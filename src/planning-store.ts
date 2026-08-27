const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export interface GovernedPlanningLink {
  kind: "pull_request" | "openspec_artifact";
  label: string;
  url: string;
}

interface PlanningManifestEntry {
  path: string;
  sha256: string;
  byteSize: number;
}

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const changePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const planningBranchPattern = /^deos\/planning\/[0-9a-f]{24}$/;
const shaPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^[0-9a-f]{64}$/;

const manifestPath = (changeId: string, path: string): boolean => {
  const prefix = `openspec/changes/${changeId}/`;
  if (!path.startsWith(prefix)) return false;
  const relative = path.slice(prefix.length);
  return relative === ".openspec.yaml" || relative === "proposal.md" ||
    /^specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/.test(relative);
};

export const governedPlanningLinks = (input: {
  repository: string;
  remoteBranch: string;
  changeId: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  headSha: string;
  planningManifestJson: string;
}): readonly GovernedPlanningLink[] => {
  if (
    !repositoryPattern.test(input.repository) ||
    !planningBranchPattern.test(input.remoteBranch) ||
    !changePattern.test(input.changeId) ||
    !Number.isSafeInteger(input.pullRequestNumber) ||
    input.pullRequestNumber <= 0 ||
    !shaPattern.test(input.headSha) ||
    input.pullRequestUrl !== `https://github.com/${input.repository}/pull/${input.pullRequestNumber}`
  ) throw new Error("planning publication destination is invalid");

  let untrusted: unknown;
  try {
    untrusted = JSON.parse(input.planningManifestJson);
  } catch {
    throw new Error("planning publication manifest is invalid");
  }
  if (!Array.isArray(untrusted) || untrusted.length < 3 || untrusted.length > 48) {
    throw new Error("planning publication manifest is invalid");
  }
  const entries: PlanningManifestEntry[] = [];
  const seen = new Set<string>();
  for (const value of untrusted) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("planning publication manifest is invalid");
    }
    const entry = value as Record<string, unknown>;
    if (
      typeof entry.path !== "string" || !manifestPath(input.changeId, entry.path) ||
      typeof entry.sha256 !== "string" || !digestPattern.test(entry.sha256) ||
      typeof entry.byteSize !== "number" || !Number.isSafeInteger(entry.byteSize) || entry.byteSize < 0 ||
      seen.has(entry.path)
    ) throw new Error("planning publication manifest is invalid");
    seen.add(entry.path);
    entries.push({ path: entry.path, sha256: entry.sha256, byteSize: entry.byteSize });
  }
  if (
    entries.some((entry, index) => index > 0 && entries[index - 1]!.path.localeCompare(entry.path) >= 0) ||
    !seen.has(`openspec/changes/${input.changeId}/.openspec.yaml`) ||
    !seen.has(`openspec/changes/${input.changeId}/proposal.md`) ||
    !entries.some((entry) => entry.path.includes("/specs/"))
  ) throw new Error("planning publication manifest is invalid");

  return Object.freeze([
    Object.freeze({
      kind: "pull_request" as const,
      label: `PR #${input.pullRequestNumber}`,
      url: input.pullRequestUrl,
    }),
    ...entries.map((entry) => Object.freeze({
      kind: "openspec_artifact" as const,
      label: entry.path,
      url: `https://github.com/${input.repository}/blob/${input.headSha}/${entry.path}`,
    })),
  ]);
};

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
    if (await sha256Hex(input.planningManifestJson) !== input.planningManifestDigest) {
      throw new Error("planning publication manifest digest mismatch");
    }
    const links = governedPlanningLinks(input);
    const update = this.database.prepare(
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
    );
    const linkStatements = links.map((link, index) => this.database.prepare(
      `INSERT INTO governed_work_links
       (link_id, run_id, visit_sequence, attempt_id, operation_id,
        kind, label, url, created_at)
       SELECT ?, operation.run_id, attempt.visit_sequence, attempt.attempt_id,
              operation.operation_id, ?, ?, ?, operation.completed_at
       FROM provider_operations operation
       JOIN agent_attempts attempt
         ON attempt.attempt_id = operation.attempt_id
        AND attempt.run_id = operation.run_id
       WHERE operation.operation_id = ? AND operation.run_id = ?
         AND operation.capability = 'github'
         AND operation.action = 'publish_planning_work_product'
         AND operation.sanitized_target = ?
         AND operation.state IN ('succeeded', 'reconciled', 'duplicate')
         AND operation.completed_at IS NOT NULL
         AND attempt.node_id = 'openspec_planning'
         AND attempt.visit_sequence IS NOT NULL
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
      `${input.repository}:${input.remoteBranch}`,
    ));
    const results = await this.database.batch([update, ...linkStatements]);
    if (changes(results[0]!) !== 1) throw new Error("planning publication identity mismatch");
    if (results.slice(1).some((result) => changes(result) !== 1)) {
      throw new Error("planning publication governed-link write failed");
    }
    const stored = await this.findRunWorkProduct(input.runId);
    if (
      stored === null ||
      stored.head_sha !== input.headSha ||
      stored.planning_manifest_digest !== input.planningManifestDigest ||
      stored.latest_publication_operation_id !== input.operationId
    ) {
      throw new Error("planning publication read-back mismatch");
    }
    const recordedLinks = await this.database.prepare(
      `SELECT kind, label, url FROM governed_work_links
       WHERE run_id = ? AND operation_id = ?
       ORDER BY kind, label`,
    ).bind(input.runId, input.operationId).all<GovernedPlanningLink>();
    const expected = [...links].sort((left, right) =>
      left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
    if (
      recordedLinks.results.length !== expected.length ||
      recordedLinks.results.some((link, index) =>
        link.kind !== expected[index]!.kind ||
        link.label !== expected[index]!.label ||
        link.url !== expected[index]!.url)
    ) throw new Error("planning publication governed-link read-back mismatch");
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
