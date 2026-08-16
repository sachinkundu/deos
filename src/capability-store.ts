import type { ProviderOperationRecord, ProviderOperationState } from "./linear-transition.ts";

export interface CapabilityContext {
  attemptId: string;
  runId: string;
  issueId: string;
  projectId: string;
  repository: string;
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
  finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
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
              p.trial_repository AS repository
       FROM agent_attempts a
       JOIN orchestration_runs r ON r.run_id = a.run_id
       JOIN project_workflow_policies p ON p.project_id = r.project_id
       WHERE a.attempt_id = ?`,
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

  async finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE provider_operations
       SET state = ?, provider_resource_id = ?, safe_error_category = ?,
           updated_at = ?, completed_at = ?
       WHERE operation_id = ? AND state = ?`,
    ).bind(
      input.state,
      input.providerResourceId,
      input.safeErrorCategory,
      input.now,
      input.now,
      input.operationId,
      input.expected,
    ).run();
    return changes(result) === 1;
  }
}
