import type { ProviderOperationRecord, ProviderOperationState } from "./linear-transition.ts";

export interface CapabilityContext {
  attemptId: string;
  runId: string;
  issueId: string;
  projectId: string;
  repository: string;
  githubInstallationId?: string;
  attemptState: string;
}

export interface CapabilityStore {
  context(attemptId: string): Promise<CapabilityContext | null>;
  begin(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    capability: string;
    action: string;
    sanitizedTarget: string;
    requestDigest: string;
    now: string;
  }): Promise<{ operation: ProviderOperationRecord; created: boolean }>;
  find(operationId: string): Promise<ProviderOperationRecord | null>;
  listAttemptOperations(attemptId: string, action: string): Promise<readonly ProviderOperationRecord[]>;
  finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    diagnosticId?: string | null;
    now: string;
  }): Promise<boolean>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1CapabilityStore implements CapabilityStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  context(attemptId: string): Promise<CapabilityContext | null> {
    return this.database.prepare(
      `SELECT a.attempt_id AS attemptId, a.run_id AS runId, a.state AS attemptState,
              r.issue_id AS issueId, r.project_id AS projectId,
              r.route_repository AS repository,
              r.route_github_installation_id AS githubInstallationId
       FROM agent_attempts a
       JOIN orchestration_runs r ON r.run_id = a.run_id
       WHERE a.attempt_id = ?
         AND r.route_repository IS NOT NULL
         AND r.route_github_installation_id IS NOT NULL`,
    ).bind(attemptId).first<CapabilityContext>();
  }

  async begin(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    capability: string;
    action: string;
    sanitizedTarget: string;
    requestDigest: string;
    now: string;
  }): Promise<{ operation: ProviderOperationRecord; created: boolean }> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO provider_operations
       (operation_id, run_id, attempt_id, capability, action, sanitized_target,
        request_digest, state, started_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    ).bind(
      input.operationId,
      input.runId,
      input.attemptId,
      input.capability,
      input.action,
      input.sanitizedTarget,
      input.requestDigest,
      input.now,
      input.now,
    ).run();
    const operation = await this.find(input.operationId);
    if (operation === null) throw new Error("capability operation is not readable");
    if (
      operation.run_id !== input.runId ||
      operation.attempt_id !== input.attemptId ||
      operation.request_digest !== input.requestDigest
    ) throw new Error("capability operation identity mismatch");
    return { operation, created: changes(result) === 1 };
  }

  find(operationId: string): Promise<ProviderOperationRecord | null> {
    return this.database.prepare(
      "SELECT * FROM provider_operations WHERE operation_id = ?",
    ).bind(operationId).first<ProviderOperationRecord>();
  }

  async listAttemptOperations(
    attemptId: string,
    action: string,
  ): Promise<readonly ProviderOperationRecord[]> {
    const rows = await this.database.prepare(
      `SELECT * FROM provider_operations
       WHERE attempt_id = ? AND capability = 'model' AND action = ?
       ORDER BY started_at, operation_id`,
    ).bind(attemptId, action).all<ProviderOperationRecord>();
    return Object.freeze(rows.results);
  }

  async finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    diagnosticId?: string | null;
    now: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE provider_operations
       SET state = ?, provider_resource_id = ?, safe_error_category = ?, diagnostic_id = ?,
           updated_at = ?, completed_at = ?
       WHERE operation_id = ? AND state = ?`,
    ).bind(
      input.state,
      input.providerResourceId,
      input.safeErrorCategory,
      input.diagnosticId ?? null,
      input.now,
      input.now,
      input.operationId,
      input.expected,
    ).run();
    return changes(result) === 1;
  }
}

export interface ProviderReceiptVerifier {
  verify(
    runId: string,
    attemptId: string,
    operationIds?: readonly string[],
  ): Promise<boolean>;
  hasAny(runId: string, attemptId: string): Promise<boolean>;
}

export class D1ProviderReceiptVerifier implements ProviderReceiptVerifier {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async verify(
    runId: string,
    attemptId: string,
    operationIds?: readonly string[],
  ): Promise<boolean> {
    const uniqueIds = operationIds === undefined ? undefined : [...new Set(operationIds)];
    if (uniqueIds !== undefined && (uniqueIds.length === 0 || uniqueIds.length !== operationIds?.length)) {
      return false;
    }
    const selectedClause = uniqueIds === undefined
      ? ""
      : ` AND operation_id IN (${uniqueIds.map(() => "?").join(", ")})`;
    const row = await this.database.prepare(
      `SELECT
         COUNT(*) AS selectedCount,
         COALESCE(SUM(CASE WHEN state IN ('succeeded', 'reconciled') THEN 1 ELSE 0 END), 0) AS successfulCount,
         (SELECT COUNT(*) FROM provider_operations
          WHERE run_id = ? AND attempt_id = ?
            AND state NOT IN ('succeeded', 'reconciled')) AS incompleteCount
       FROM provider_operations
       WHERE run_id = ? AND attempt_id = ?${selectedClause}`,
    ).bind(
      runId,
      attemptId,
      runId,
      attemptId,
      ...(uniqueIds ?? []),
    ).first<{ selectedCount: number; successfulCount: number; incompleteCount: number }>();
    const expected = uniqueIds?.length ?? row?.selectedCount ?? 0;
    const complete = expected > 0 && row?.selectedCount === expected &&
      row.successfulCount === expected && row.incompleteCount === 0;
    if (!complete) return false;
    const selected = uniqueIds === undefined
      ? await this.database.prepare(
          `SELECT operation_id, action FROM provider_operations
           WHERE run_id = ? AND attempt_id = ?`,
        ).bind(runId, attemptId).all<{ operation_id: string; action: string }>()
      : await this.database.prepare(
          `SELECT operation_id, action FROM provider_operations
           WHERE run_id = ? AND attempt_id = ?
             AND operation_id IN (${uniqueIds.map(() => "?").join(", ")})`,
        ).bind(runId, attemptId, ...uniqueIds).all<{ operation_id: string; action: string }>();
    const planning = selected.results.filter((operation) =>
      operation.action === "publish_planning_work_product");
    if (planning.length === 0) return true;
    if (planning.length !== 1 || selected.results.length !== 1) return false;
    const workProduct = await this.database.prepare(
      `SELECT latest_publication_operation_id, head_sha, planning_manifest_digest,
              planning_manifest_json, pull_request_number
       FROM run_work_products WHERE run_id = ?`,
    ).bind(runId).first<{
      latest_publication_operation_id: string | null;
      head_sha: string | null;
      planning_manifest_digest: string | null;
      planning_manifest_json: string | null;
      pull_request_number: number | null;
    }>();
    if (
      workProduct === null ||
      workProduct.latest_publication_operation_id !== planning[0].operation_id ||
      workProduct.head_sha === null || workProduct.planning_manifest_digest === null ||
      workProduct.planning_manifest_json === null || workProduct.pull_request_number === null
    ) return false;
    let manifest: unknown;
    try {
      manifest = JSON.parse(workProduct.planning_manifest_json);
    } catch {
      return false;
    }
    if (!Array.isArray(manifest)) return false;
    const paths = manifest.map((entry) =>
      typeof entry === "object" && entry !== null && typeof entry.path === "string"
        ? entry.path as string
        : "");
    const changePrefix = paths[0]?.match(/^(openspec\/changes\/[a-z0-9-]+\/)/)?.[1];
    return changePrefix !== undefined &&
      [".openspec.yaml", "proposal.md"].every((path) =>
        paths.includes(`${changePrefix}${path}`)) &&
      paths.some((path) => new RegExp(`^${changePrefix}specs/[a-z0-9-]+/spec\\.md$`).test(path)) &&
      paths.every((path) =>
        path === `${changePrefix}.openspec.yaml` ||
        path === `${changePrefix}proposal.md` ||
        new RegExp(`^${changePrefix}specs/[a-z0-9-]+/spec\\.md$`).test(path));
  }

  async hasAny(runId: string, attemptId: string): Promise<boolean> {
    const row = await this.database.prepare(
      `SELECT COUNT(*) AS operationCount FROM provider_operations
       WHERE run_id = ? AND attempt_id = ?`,
    ).bind(runId, attemptId).first<{ operationCount: number }>();
    return (row?.operationCount ?? 0) > 0;
  }
}
