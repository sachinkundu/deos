const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const changePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

export interface DesignWorkProductRecord {
  run_id: string;
  repository: string;
  base_branch: "main";
  base_commit: string;
  remote_branch: string;
  change_id: string;
  pull_request_database_id: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  head_sha: string | null;
  design_manifest_digest: string | null;
  design_manifest_json: string | null;
  publication_operation_id: string | null;
  merge_operation_id: string | null;
  merge_commit_sha: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignCandidateRecord {
  candidate_id: string;
  run_id: string;
  round: number;
  source_attempt_id: string;
  base_commit: string;
  change_id: string;
  design_digest: string;
  candidate_digest: string;
  candidate_r2_key: string;
  candidate_sha256: string;
  validation_r2_key: string;
  validation_sha256: string;
  state: "validated" | "rejected";
  created_at: string;
  accepted_at: string | null;
}

export interface GovernedDesignLink {
  kind: "pull_request" | "openspec_artifact";
  label: string;
  url: string;
}

export const designBranchForRun = async (runId: string): Promise<string> =>
  `deos/design/${(await sha256Hex(`deos-design-branch:${runId}`)).slice(0, 24)}`;

export class D1DesignStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  findWorkProduct(runId: string): Promise<DesignWorkProductRecord | null> {
    return this.database.prepare("SELECT * FROM design_work_products WHERE run_id = ?")
      .bind(runId).first<DesignWorkProductRecord>();
  }

  async allocate(input: {
    runId: string;
    repository: string;
    baseCommit: string;
    changeId: string;
    now: string;
  }): Promise<DesignWorkProductRecord> {
    if (!repositoryPattern.test(input.repository) || !shaPattern.test(input.baseCommit) ||
      !changePattern.test(input.changeId)) throw new Error("design work-product allocation is invalid");
    const branch = await designBranchForRun(input.runId);
    await this.database.prepare(
      `INSERT OR IGNORE INTO design_work_products
       (run_id, repository, base_branch, base_commit, remote_branch, change_id, created_at, updated_at)
       VALUES (?, ?, 'main', ?, ?, ?, ?, ?)`,
    ).bind(input.runId, input.repository, input.baseCommit, branch, input.changeId, input.now, input.now).run();
    const stored = await this.findWorkProduct(input.runId);
    if (stored === null || stored.repository !== input.repository || stored.base_commit !== input.baseCommit ||
      stored.remote_branch !== branch || stored.change_id !== input.changeId) {
      throw new Error("design work-product allocation mismatch");
    }
    return stored;
  }

  async recordPublication(input: {
    runId: string;
    pullRequestDatabaseId: string;
    pullRequestNumber: number;
    pullRequestUrl: string;
    headSha: string;
    designDigest: string;
    operationId: string;
    expectedOperationState: "pending" | "manual_reconciliation_required";
    operationState: "succeeded" | "reconciled";
    now: string;
  }): Promise<DesignWorkProductRecord> {
    const current = await this.findWorkProduct(input.runId);
    if (current === null || !shaPattern.test(input.headSha) || !digestPattern.test(input.designDigest) ||
      input.pullRequestUrl !== `https://github.com/${current.repository}/pull/${input.pullRequestNumber}`) {
      throw new Error("design publication identity is invalid");
    }
    if (
      (input.expectedOperationState === "pending" && !["succeeded", "reconciled"].includes(input.operationState)) ||
      (input.expectedOperationState === "manual_reconciliation_required" && input.operationState !== "reconciled")
    ) throw new Error("design publication operation transition is invalid");
    const manifestJson = JSON.stringify([{
      path: `openspec/changes/${current.change_id}/design.md`,
      sha256: input.designDigest,
    }]);
    const manifestDigest = await sha256Hex(manifestJson);
    const links: readonly GovernedDesignLink[] = Object.freeze([
      Object.freeze({
        kind: "pull_request",
        label: `Design PR #${input.pullRequestNumber}`,
        url: input.pullRequestUrl,
      }),
      Object.freeze({
        kind: "openspec_artifact",
        label: `openspec/changes/${current.change_id}/design.md`,
        url: `https://github.com/${current.repository}/blob/${input.headSha}/openspec/changes/${current.change_id}/design.md`,
      }),
    ]);
    const operationUpdate = this.database.prepare(
      `UPDATE provider_operations
       SET state = ?, provider_resource_id = ?, safe_error_category = NULL,
           updated_at = ?, completed_at = ?
       WHERE operation_id = ? AND run_id = ? AND capability = 'system_action'
         AND action = 'github.publish_design_candidate' AND state = ?`,
    ).bind(
      input.operationState,
      input.pullRequestDatabaseId,
      input.now,
      input.now,
      input.operationId,
      input.runId,
      input.expectedOperationState,
    );
    const update = this.database.prepare(
      `UPDATE design_work_products
       SET pull_request_database_id = ?, pull_request_number = ?, pull_request_url = ?, head_sha = ?,
           design_manifest_digest = ?, design_manifest_json = ?, publication_operation_id = ?, updated_at = ?
       WHERE run_id = ? AND (pull_request_database_id IS NULL OR pull_request_database_id = ?)
         AND (pull_request_number IS NULL OR pull_request_number = ?)
         AND (pull_request_url IS NULL OR pull_request_url = ?)`,
    ).bind(
      input.pullRequestDatabaseId, input.pullRequestNumber, input.pullRequestUrl, input.headSha,
      manifestDigest, manifestJson, input.operationId, input.now, input.runId,
      input.pullRequestDatabaseId, input.pullRequestNumber, input.pullRequestUrl,
    );
    const linkStatements = links.map((link, index) => this.database.prepare(
      `INSERT INTO governed_work_links
       (link_id, run_id, visit_sequence, attempt_id, operation_id,
        kind, label, url, created_at)
       SELECT ?, operation.run_id, run.current_visit_sequence, operation.attempt_id,
              operation.operation_id, ?, ?, ?, operation.completed_at
       FROM provider_operations operation
       JOIN orchestration_runs run ON run.run_id = operation.run_id
       WHERE operation.operation_id = ? AND operation.run_id = ?
         AND operation.capability = 'system_action'
         AND operation.action = 'github.publish_design_candidate'
         AND operation.state IN ('succeeded', 'reconciled', 'duplicate')
         AND operation.completed_at IS NOT NULL
       ON CONFLICT (run_id, visit_sequence, kind, label) DO UPDATE SET
         attempt_id = excluded.attempt_id,
         operation_id = excluded.operation_id,
         url = excluded.url,
         created_at = excluded.created_at`,
    ).bind(
      `governed:${input.operationId}:${link.kind}:${index}`,
      link.kind,
      link.label,
      link.url,
      input.operationId,
      input.runId,
    ));
    const results = await this.database.batch([operationUpdate, update, ...linkStatements]);
    if (changes(results[0]!) !== 1) throw new Error("design publication operation compare-and-set failed");
    if (changes(results[1]!) !== 1) throw new Error("design publication identity mismatch");
    if (results.slice(2).some((result) => changes(result) !== 1)) {
      throw new Error("design publication governed-link write failed");
    }
    const stored = await this.findWorkProduct(input.runId);
    if (stored?.head_sha !== input.headSha || stored.publication_operation_id !== input.operationId) {
      throw new Error("design publication read-back mismatch");
    }
    const recordedOperation = await this.database.prepare(
      `SELECT state, provider_resource_id, completed_at FROM provider_operations
       WHERE operation_id = ? AND run_id = ?`,
    ).bind(input.operationId, input.runId).first<{
      state: string;
      provider_resource_id: string | null;
      completed_at: string | null;
    }>();
    if (
      recordedOperation?.state !== input.operationState ||
      recordedOperation.provider_resource_id !== input.pullRequestDatabaseId ||
      recordedOperation.completed_at !== input.now
    ) throw new Error("design publication operation read-back mismatch");
    const recordedLinks = await this.database.prepare(
      `SELECT kind, label, url FROM governed_work_links
       WHERE run_id = ? AND operation_id = ? ORDER BY kind, label`,
    ).bind(input.runId, input.operationId).all<GovernedDesignLink>();
    const expected = [...links].sort((left, right) =>
      left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
    if (recordedLinks.results.length !== expected.length || recordedLinks.results.some((link, index) =>
      link.kind !== expected[index]!.kind || link.label !== expected[index]!.label ||
      link.url !== expected[index]!.url)) {
      throw new Error("design publication governed-link read-back mismatch");
    }
    return stored;
  }

  async recordFeedbackChangedPublication(input: {
    runId: string;
    pullRequestDatabaseId: string;
    pullRequestNumber: number;
    pullRequestUrl: string;
    headSha: string;
    designDigest: string;
    operationId: string;
    expectedOperationState: "pending" | "manual_reconciliation_required";
    now: string;
  }): Promise<DesignWorkProductRecord> {
    const current = await this.findWorkProduct(input.runId);
    if (
      current === null || !shaPattern.test(input.headSha) || !digestPattern.test(input.designDigest) ||
      input.pullRequestUrl !== `https://github.com/${current.repository}/pull/${input.pullRequestNumber}`
    ) throw new Error("design feedback-change publication identity is invalid");
    const manifestJson = JSON.stringify([{
      path: `openspec/changes/${current.change_id}/design.md`,
      sha256: input.designDigest,
    }]);
    const manifestDigest = await sha256Hex(manifestJson);
    const operationUpdate = this.database.prepare(
      `UPDATE provider_operations
       SET state = 'failed', provider_resource_id = ?, safe_error_category = 'design_review_feedback_changed',
           updated_at = ?, completed_at = ?
       WHERE operation_id = ? AND run_id = ? AND capability = 'system_action'
         AND action = 'github.publish_design_candidate' AND state = ?`,
    ).bind(
      input.pullRequestDatabaseId,
      input.now,
      input.now,
      input.operationId,
      input.runId,
      input.expectedOperationState,
    );
    const update = this.database.prepare(
      `UPDATE design_work_products
       SET pull_request_database_id = ?, pull_request_number = ?, pull_request_url = ?, head_sha = ?,
           design_manifest_digest = ?, design_manifest_json = ?, publication_operation_id = ?, updated_at = ?
       WHERE run_id = ? AND (pull_request_database_id IS NULL OR pull_request_database_id = ?)
         AND (pull_request_number IS NULL OR pull_request_number = ?)
         AND (pull_request_url IS NULL OR pull_request_url = ?)`,
    ).bind(
      input.pullRequestDatabaseId, input.pullRequestNumber, input.pullRequestUrl, input.headSha,
      manifestDigest, manifestJson, input.operationId, input.now, input.runId,
      input.pullRequestDatabaseId, input.pullRequestNumber, input.pullRequestUrl,
    );
    const results = await this.database.batch([operationUpdate, update]);
    if (changes(results[0]!) !== 1) {
      throw new Error("design feedback-change operation compare-and-set failed");
    }
    if (changes(results[1]!) !== 1) throw new Error("design feedback-change publication identity mismatch");
    const stored = await this.findWorkProduct(input.runId);
    if (
      stored?.pull_request_database_id !== input.pullRequestDatabaseId ||
      stored.pull_request_number !== input.pullRequestNumber || stored.head_sha !== input.headSha ||
      stored.publication_operation_id !== input.operationId
    ) throw new Error("design feedback-change publication read-back mismatch");
    const operation = await this.database.prepare(
      `SELECT state, provider_resource_id, safe_error_category, completed_at
       FROM provider_operations WHERE operation_id = ? AND run_id = ?`,
    ).bind(input.operationId, input.runId).first<{
      state: string;
      provider_resource_id: string | null;
      safe_error_category: string | null;
      completed_at: string | null;
    }>();
    if (
      operation?.state !== "failed" || operation.provider_resource_id !== input.pullRequestDatabaseId ||
      operation.safe_error_category !== "design_review_feedback_changed" || operation.completed_at !== input.now
    ) throw new Error("design feedback-change operation read-back mismatch");
    return stored;
  }

  async recordMerge(input: {
    runId: string;
    operationId: string;
    expectedHeadSha: string;
    mergeCommitSha: string;
    now: string;
  }): Promise<DesignWorkProductRecord> {
    if (!shaPattern.test(input.expectedHeadSha) || !shaPattern.test(input.mergeCommitSha)) {
      throw new Error("design merge identity is invalid");
    }
    const result = await this.database.prepare(
      `UPDATE design_work_products SET merge_operation_id = ?, merge_commit_sha = ?, updated_at = ?
       WHERE run_id = ? AND head_sha = ?
         AND (merge_operation_id IS NULL OR merge_operation_id = ?)
         AND (merge_commit_sha IS NULL OR merge_commit_sha = ?)`,
    ).bind(input.operationId, input.mergeCommitSha, input.now, input.runId, input.expectedHeadSha,
      input.operationId, input.mergeCommitSha).run();
    if (changes(result) !== 1) throw new Error("design merge identity mismatch");
    const stored = await this.findWorkProduct(input.runId);
    if (stored?.merge_commit_sha !== input.mergeCommitSha) throw new Error("design merge read-back mismatch");
    return stored;
  }

  findLatestCandidate(runId: string): Promise<DesignCandidateRecord | null> {
    return this.database.prepare(
      `SELECT * FROM design_candidates WHERE run_id = ? AND state = 'validated'
       ORDER BY round DESC, created_at DESC, candidate_id DESC LIMIT 1`,
    ).bind(runId).first<DesignCandidateRecord>();
  }

  async recordCandidate(input: DesignCandidateRecord): Promise<DesignCandidateRecord> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO design_candidates
       (candidate_id, run_id, round, source_attempt_id, base_commit, change_id, design_digest,
        candidate_digest, candidate_r2_key, candidate_sha256, validation_r2_key, validation_sha256,
        state, created_at, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.candidate_id, input.run_id, input.round, input.source_attempt_id, input.base_commit,
      input.change_id, input.design_digest, input.candidate_digest, input.candidate_r2_key,
      input.candidate_sha256, input.validation_r2_key, input.validation_sha256, input.state,
      input.created_at, input.accepted_at,
    ).run();
    const stored = await this.database.prepare("SELECT * FROM design_candidates WHERE candidate_id = ?")
      .bind(input.candidate_id).first<DesignCandidateRecord>();
    if (stored === null || stored.run_id !== input.run_id || stored.candidate_digest !== input.candidate_digest ||
      stored.design_digest !== input.design_digest || (changes(result) === 0 && stored.candidate_r2_key !== input.candidate_r2_key)) {
      throw new Error("design candidate identity mismatch");
    }
    return stored;
  }
}
