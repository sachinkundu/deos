const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export interface RunWorkProductRecord {
  run_id: string;
  repository: string;
  base_branch: "main";
  remote_branch: string;
  change_id: string;
  pull_request_database_id: string | null;
  pull_request_number: number | null;
  pull_request_url: string | null;
  head_sha: string | null;
  planning_manifest_digest: string | null;
  planning_manifest_json: string | null;
  latest_publication_operation_id: string | null;
  merge_operation_id: string | null;
  merge_commit_sha: string | null;
  verification_operation_id: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export const planningBranchForRun = async (runId: string): Promise<string> =>
  `deos/planning/${(await sha256Hex(`deos-planning-branch:${runId}`)).slice(0, 24)}`;

export class D1PlanningStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  findRunWorkProduct(runId: string): Promise<RunWorkProductRecord | null> {
    return this.database.prepare(
      "SELECT * FROM run_work_products WHERE run_id = ?",
    ).bind(runId).first<RunWorkProductRecord>();
  }

  async allocateRunWorkProduct(input: {
    runId: string;
    repository: string;
    changeId: string;
    now: string;
  }): Promise<RunWorkProductRecord> {
    const remoteBranch = await planningBranchForRun(input.runId);
    await this.database.prepare(
      `INSERT OR IGNORE INTO run_work_products
       (run_id, repository, base_branch, remote_branch, change_id, created_at, updated_at)
       VALUES (?, ?, 'main', ?, ?, ?, ?)`,
    ).bind(
      input.runId,
      input.repository,
      remoteBranch,
      input.changeId,
      input.now,
      input.now,
    ).run();
    const stored = await this.findRunWorkProduct(input.runId);
    if (
      stored === null ||
      stored.repository !== input.repository ||
      stored.base_branch !== "main" ||
      stored.remote_branch !== remoteBranch ||
      stored.change_id !== input.changeId
    ) {
      throw new Error("run work-product allocation mismatch");
    }
    return stored;
  }

  async recordPublication(input: {
    runId: string;
    repository: string;
    remoteBranch: string;
    changeId: string;
    pullRequestDatabaseId: string;
    pullRequestNumber: number;
    pullRequestUrl: string;
    headSha: string;
    planningManifestDigest: string;
    planningManifestJson: string;
    operationId: string;
    now: string;
  }): Promise<RunWorkProductRecord> {
    const result = await this.database.prepare(
      `UPDATE run_work_products
       SET pull_request_database_id = ?, pull_request_number = ?, pull_request_url = ?,
           head_sha = ?, planning_manifest_digest = ?, planning_manifest_json = ?,
           latest_publication_operation_id = ?, updated_at = ?
       WHERE run_id = ? AND repository = ? AND base_branch = 'main'
         AND remote_branch = ? AND change_id = ?
         AND (pull_request_database_id IS NULL OR pull_request_database_id = ?)
         AND (pull_request_number IS NULL OR pull_request_number = ?)
         AND (pull_request_url IS NULL OR pull_request_url = ?)`,
    ).bind(
      input.pullRequestDatabaseId,
      input.pullRequestNumber,
      input.pullRequestUrl,
      input.headSha,
      input.planningManifestDigest,
      input.planningManifestJson,
      input.operationId,
      input.now,
      input.runId,
      input.repository,
      input.remoteBranch,
      input.changeId,
      input.pullRequestDatabaseId,
      input.pullRequestNumber,
      input.pullRequestUrl,
    ).run();
    if (changes(result) !== 1) throw new Error("planning publication identity mismatch");
    const stored = await this.findRunWorkProduct(input.runId);
    if (
      stored === null ||
      stored.head_sha !== input.headSha ||
      stored.planning_manifest_digest !== input.planningManifestDigest ||
      stored.latest_publication_operation_id !== input.operationId
    ) {
      throw new Error("planning publication read-back mismatch");
    }
    return stored;
  }

  async recordMerge(input: {
    runId: string;
    operationId: string;
    expectedHeadSha: string;
    mergeCommitSha: string;
    now: string;
  }): Promise<RunWorkProductRecord> {
    const result = await this.database.prepare(
      `UPDATE run_work_products
       SET merge_operation_id = ?, merge_commit_sha = ?, updated_at = ?
       WHERE run_id = ? AND head_sha = ?
         AND (merge_operation_id IS NULL OR merge_operation_id = ?)
         AND (merge_commit_sha IS NULL OR merge_commit_sha = ?)`,
    ).bind(
      input.operationId,
      input.mergeCommitSha,
      input.now,
      input.runId,
      input.expectedHeadSha,
      input.operationId,
      input.mergeCommitSha,
    ).run();
    if (changes(result) !== 1) throw new Error("planning merge identity mismatch");
    const stored = await this.findRunWorkProduct(input.runId);
    if (stored?.merge_commit_sha !== input.mergeCommitSha) {
      throw new Error("planning merge read-back mismatch");
    }
    return stored;
  }

  async recordVerification(input: {
    runId: string;
    operationId: string;
    mergeCommitSha: string;
    planningManifestDigest: string;
    now: string;
  }): Promise<RunWorkProductRecord> {
    const result = await this.database.prepare(
      `UPDATE run_work_products
       SET verification_operation_id = ?, verified_at = ?, updated_at = ?
       WHERE run_id = ? AND merge_commit_sha = ? AND planning_manifest_digest = ?
         AND (verification_operation_id IS NULL OR verification_operation_id = ?)`,
    ).bind(
      input.operationId,
      input.now,
      input.now,
      input.runId,
      input.mergeCommitSha,
      input.planningManifestDigest,
      input.operationId,
    ).run();
    if (changes(result) !== 1) throw new Error("planning verification identity mismatch");
    const stored = await this.findRunWorkProduct(input.runId);
    if (stored?.verification_operation_id !== input.operationId || stored.verified_at !== input.now) {
      throw new Error("planning verification read-back mismatch");
    }
    return stored;
  }

  async setSelectorEnabled(input: {
    projectId: string;
    repository: string;
    labelName: string;
    enabled: boolean;
    now: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE workflow_definition_selectors SET enabled = ?, updated_at = ?
       WHERE project_id = ? AND repository = ? AND label_name = ?`,
    ).bind(
      input.enabled ? 1 : 0,
      input.now,
      input.projectId,
      input.repository,
      input.labelName,
    ).run();
    return changes(result) === 1;
  }
}
