import { workflowInstanceIdentity } from "./orchestration-identity.ts";
import type { WorkflowBinding, WorkflowInstanceHandle } from "./queue-consumer-core.ts";

const recoverableNodes = new Set(["design_self_review"]);

export interface WorkflowRuntimeRecoveryRecord {
  recovery_id: string;
  run_id: string;
  retry_node: string;
  from_visit_sequence: number;
  to_visit_sequence: number;
  transition_id: string;
  state: "pending" | "established";
  workflow_status: string | null;
  safe_error_category: string | null;
  requested_by: string;
  source_workflow_instance_id: string;
  target_workflow_instance_id: string;
  source_delivery_id: string;
  created_at: string;
  updated_at: string;
  established_at: string | null;
}

export interface WorkflowRuntimeRecoveryStore {
  prepare(input: {
    runId: string;
    sourceWorkflowInstanceId: string;
    retryNode: string;
    visitSequence: number;
    requestedBy: string;
    now: string;
  }): Promise<WorkflowRuntimeRecoveryRecord>;
  observe(input: {
    recoveryId: string;
    state: WorkflowRuntimeRecoveryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<WorkflowRuntimeRecoveryRecord>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1WorkflowRuntimeRecoveryStore implements WorkflowRuntimeRecoveryStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private find(sourceWorkflowInstanceId: string): Promise<WorkflowRuntimeRecoveryRecord | null> {
    return this.database.prepare(
      `SELECT * FROM workflow_runtime_recoveries WHERE source_workflow_instance_id = ?`,
    ).bind(sourceWorkflowInstanceId).first<WorkflowRuntimeRecoveryRecord>();
  }

  async prepare(input: {
    runId: string;
    sourceWorkflowInstanceId: string;
    retryNode: string;
    visitSequence: number;
    requestedBy: string;
    now: string;
  }): Promise<WorkflowRuntimeRecoveryRecord> {
    const existing = await this.find(input.sourceWorkflowInstanceId);
    if (existing !== null) {
      if (
        existing.run_id !== input.runId || existing.retry_node !== input.retryNode ||
        existing.from_visit_sequence !== input.visitSequence
      ) throw new Error("workflow_runtime_recovery_identity_mismatch");
      return existing;
    }

    const targetWorkflowInstanceId = await workflowInstanceIdentity(
      `${input.runId}:runtime-recovery:${input.visitSequence + 1}`,
    );
    const recoveryId = `workflow-runtime-recovery:${input.sourceWorkflowInstanceId}`;
    const transitionId = `transition:${recoveryId}`;
    const statements = [
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_runtime_recoveries
         (recovery_id, run_id, retry_node, from_visit_sequence, to_visit_sequence,
          transition_id, state, requested_by, source_workflow_instance_id,
          target_workflow_instance_id, source_delivery_id, created_at, updated_at)
         SELECT ?, run.run_id, run.current_node, run.current_visit_sequence,
                run.current_visit_sequence + 1, ?, 'pending', ?, run.workflow_instance_id,
                ?, COALESCE(run.selection_delivery_id, intent.source_delivery_id), ?, ?
         FROM orchestration_runs AS run
         JOIN dispatch_intents AS intent ON intent.run_id = run.run_id
         WHERE run.run_id = ? AND run.workflow_instance_id = ?
           AND run.current_node = ? AND run.current_visit_sequence = ? AND run.status = 'active'
           AND COALESCE(run.selection_delivery_id, intent.source_delivery_id) IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM agent_attempts AS attempt
             WHERE attempt.run_id = run.run_id
               AND attempt.visit_sequence = run.current_visit_sequence
           )`,
      ).bind(
        recoveryId,
        transitionId,
        input.requestedBy,
        targetWorkflowInstanceId,
        input.now,
        input.now,
        input.runId,
        input.sourceWorkflowInstanceId,
        input.retryNode,
        input.visitSequence,
      ),
      this.database.prepare(
        `UPDATE orchestration_runs
         SET workflow_instance_id = ?, previous_node = current_node,
             current_visit_sequence = current_visit_sequence + 1,
             last_transition_id = ?, updated_at = ?
         WHERE run_id = ? AND workflow_instance_id = ? AND current_node = ?
           AND current_visit_sequence = ? AND status = 'active'
           AND EXISTS (
             SELECT 1 FROM workflow_runtime_recoveries
             WHERE recovery_id = ? AND state = 'pending'
           )`,
      ).bind(
        targetWorkflowInstanceId,
        transitionId,
        input.now,
        input.runId,
        input.sourceWorkflowInstanceId,
        input.retryNode,
        input.visitSequence,
        recoveryId,
      ),
      this.database.prepare(
        `UPDATE dispatch_intents
         SET workflow_instance_id = ?, safe_error_category = NULL, updated_at = ?
         WHERE run_id = ? AND workflow_instance_id = ?
           AND EXISTS (
             SELECT 1 FROM workflow_runtime_recoveries WHERE recovery_id = ?
           )`,
      ).bind(
        targetWorkflowInstanceId,
        input.now,
        input.runId,
        input.sourceWorkflowInstanceId,
        recoveryId,
      ),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_transitions_v2
         (transition_id, run_id, from_node, to_node, from_visit_sequence,
          to_visit_sequence, cause_type, cause_reference, actor_id, actor_type,
          provider_operation_id, occurred_at)
         SELECT recovery.transition_id, recovery.run_id, recovery.retry_node,
                recovery.retry_node, recovery.from_visit_sequence,
                recovery.to_visit_sequence, 'operator_retry', recovery.recovery_id,
                recovery.requested_by, 'operator', NULL, ?
         FROM workflow_runtime_recoveries AS recovery
         JOIN orchestration_runs AS run ON run.run_id = recovery.run_id
         WHERE recovery.recovery_id = ? AND run.last_transition_id = recovery.transition_id
           AND run.workflow_instance_id = recovery.target_workflow_instance_id
           AND run.current_visit_sequence = recovery.to_visit_sequence`,
      ).bind(input.now, recoveryId),
    ];
    const results = await this.database.batch(statements);
    if (results.some((result) => changes(result) !== 1)) {
      const raced = await this.find(input.sourceWorkflowInstanceId);
      if (raced !== null && raced.run_id === input.runId && raced.retry_node === input.retryNode) {
        return raced;
      }
      throw new Error("workflow_runtime_recovery_not_eligible");
    }
    const prepared = await this.find(input.sourceWorkflowInstanceId);
    if (prepared === null) throw new Error("workflow_runtime_recovery_read_back_failed");
    return prepared;
  }

  async observe(input: {
    recoveryId: string;
    state: WorkflowRuntimeRecoveryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<WorkflowRuntimeRecoveryRecord> {
    await this.database.prepare(
      `UPDATE workflow_runtime_recoveries
       SET state = ?, workflow_status = ?, safe_error_category = ?, updated_at = ?,
           established_at = CASE WHEN ? = 'established' THEN ? ELSE established_at END
       WHERE recovery_id = ?`,
    ).bind(
      input.state,
      input.workflowStatus,
      input.safeErrorCategory,
      input.now,
      input.state,
      input.now,
      input.recoveryId,
    ).run();
    const row = await this.database.prepare(
      `SELECT * FROM workflow_runtime_recoveries WHERE recovery_id = ?`,
    ).bind(input.recoveryId).first<WorkflowRuntimeRecoveryRecord>();
    if (row === null) throw new Error("workflow_runtime_recovery_observation_read_back_failed");
    return row;
  }
}

type ObservableInstance = WorkflowInstanceHandle & {
  status(): Promise<{ status: string }>;
};

const json = (status: number, body: unknown): Response => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

const terminalWorkflowStatuses = new Set(["errored", "terminated", "unknown"]);

export class WorkflowRuntimeRecoveryController {
  private readonly store: WorkflowRuntimeRecoveryStore;
  private readonly workflows: WorkflowBinding;
  private readonly secret: string;
  private readonly now: () => Date;

  constructor(
    store: WorkflowRuntimeRecoveryStore,
    workflows: WorkflowBinding,
    secret: string,
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.workflows = workflows;
    this.secret = secret;
    this.now = now;
  }

  private async locateReplacement(
    recovery: WorkflowRuntimeRecoveryRecord,
  ): Promise<ObservableInstance> {
    try {
      return await this.workflows.get(recovery.target_workflow_instance_id) as ObservableInstance;
    } catch {
      // A durable target ID makes an ambiguous create safe to reconcile.
    }
    try {
      const created = await this.workflows.createBatch([{
        id: recovery.target_workflow_instance_id,
        params: { runId: recovery.run_id, sourceDeliveryId: recovery.source_delivery_id },
      }]);
      const handle = created.find((instance) => instance.id === recovery.target_workflow_instance_id);
      if (handle !== undefined) return handle as ObservableInstance;
    } catch {
      // The provider may have created the instance before the response failed.
    }
    return await this.workflows.get(recovery.target_workflow_instance_id) as ObservableInstance;
  }

  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (request.headers.get("Authorization") !== `Bearer ${this.secret}`) {
      return json(401, { error: "invalid_operator_capability" });
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (
      typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).some((key) => ![
        "version", "runId", "sourceWorkflowInstanceId", "retryNode", "visitSequence", "requestedBy",
      ].includes(key))
    ) return json(400, { error: "invalid_workflow_runtime_recovery" });
    const value = body as Record<string, unknown>;
    if (
      value.version !== 1 || typeof value.runId !== "string" || value.runId.length === 0 ||
      typeof value.sourceWorkflowInstanceId !== "string" ||
      !/^wf-v1-[a-z2-7]+$/.test(value.sourceWorkflowInstanceId) ||
      typeof value.retryNode !== "string" || !recoverableNodes.has(value.retryNode) ||
      !Number.isInteger(value.visitSequence) || (value.visitSequence as number) < 1 ||
      typeof value.requestedBy !== "string" || !/^[a-zA-Z0-9._@-]{1,100}$/.test(value.requestedBy)
    ) return json(400, { error: "invalid_workflow_runtime_recovery" });

    try {
      const source = await this.workflows.get(value.sourceWorkflowInstanceId) as ObservableInstance;
      if ((await source.status()).status !== "errored") {
        return json(409, { error: "source_workflow_not_errored" });
      }
    } catch {
      return json(422, { error: "source_workflow_status_unavailable" });
    }

    let recovery: WorkflowRuntimeRecoveryRecord;
    try {
      recovery = await this.store.prepare({
        runId: value.runId,
        sourceWorkflowInstanceId: value.sourceWorkflowInstanceId,
        retryNode: value.retryNode,
        visitSequence: value.visitSequence as number,
        requestedBy: value.requestedBy,
        now: this.now().toISOString(),
      });
    } catch (error) {
      const category = error instanceof Error ? error.message : "workflow_runtime_recovery_failed";
      return json(category === "workflow_runtime_recovery_identity_mismatch" ? 409 : 422, {
        error: category,
      });
    }
    if (recovery.state === "established") return json(200, { recovery });

    const notEstablished = "workflow_replacement_not_established";
    const ambiguous = "workflow_replacement_ambiguous";
    try {
      const instance = await this.locateReplacement(recovery);
      const status = (await instance.status()).status;
      if (terminalWorkflowStatuses.has(status)) {
        await this.store.observe({
          recoveryId: recovery.recovery_id,
          state: "pending",
          workflowStatus: status,
          safeErrorCategory: notEstablished,
          now: this.now().toISOString(),
        });
        return json(502, { error: notEstablished, recoveryId: recovery.recovery_id });
      }
      recovery = await this.store.observe({
        recoveryId: recovery.recovery_id,
        state: "established",
        workflowStatus: status,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      return json(202, { recovery });
    } catch {
      await this.store.observe({
        recoveryId: recovery.recovery_id,
        state: "pending",
        workflowStatus: null,
        safeErrorCategory: ambiguous,
        now: this.now().toISOString(),
      });
      return json(502, { error: ambiguous, recoveryId: recovery.recovery_id });
    }
  }
}
