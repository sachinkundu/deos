import type { WorkflowBinding, WorkflowInstanceHandle } from "./queue-consumer-core.ts";

export interface AgentStageRetryRecord {
  retry_id: string;
  run_id: string;
  failed_attempt_id: string;
  retry_node: "independent_discovery" | "independent_recheck";
  from_visit_sequence: number;
  to_visit_sequence: number;
  transition_id: string;
  state: "pending" | "established";
  workflow_status: string | null;
  safe_error_category: string | null;
  requested_by: string;
  created_at: string;
  updated_at: string;
  established_at: string | null;
  workflow_instance_id?: string;
}

export interface AgentStageRetryStore {
  prepare(input: {
    runId: string;
    failedAttemptId: string;
    retryNode: AgentStageRetryRecord["retry_node"];
    requestedBy: string;
    now: string;
  }): Promise<AgentStageRetryRecord>;
  observe(input: {
    retryId: string;
    state: AgentStageRetryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<AgentStageRetryRecord>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1AgentStageRetryStore implements AgentStageRetryStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private find(failedAttemptId: string): Promise<AgentStageRetryRecord | null> {
    return this.database.prepare(
      `SELECT retry.*, run.workflow_instance_id
       FROM agent_stage_retries AS retry
       JOIN orchestration_runs AS run ON run.run_id = retry.run_id
       WHERE retry.failed_attempt_id = ?`,
    ).bind(failedAttemptId).first<AgentStageRetryRecord>();
  }

  async prepare(input: {
    runId: string;
    failedAttemptId: string;
    retryNode: AgentStageRetryRecord["retry_node"];
    requestedBy: string;
    now: string;
  }): Promise<AgentStageRetryRecord> {
    const existing = await this.find(input.failedAttemptId);
    if (existing !== null) {
      if (existing.run_id !== input.runId || existing.retry_node !== input.retryNode) {
        throw new Error("stage_retry_identity_mismatch");
      }
      return existing;
    }
    const retryId = `stage-retry:${input.failedAttemptId}`;
    const transitionId = `transition:${retryId}`;
    const results = await this.database.batch([
      this.database.prepare(
        `INSERT OR IGNORE INTO agent_stage_retries
         (retry_id, run_id, failed_attempt_id, retry_node, from_visit_sequence,
          to_visit_sequence, transition_id, state, requested_by, created_at, updated_at)
         SELECT ?, run.run_id, attempt.attempt_id, ?, run.current_visit_sequence,
                run.current_visit_sequence + 1, ?, 'pending', ?, ?, ?
         FROM orchestration_runs AS run
         JOIN agent_attempts AS attempt ON attempt.run_id = run.run_id
         WHERE run.run_id = ? AND run.definition_id = 'simple-traceability'
           AND run.current_node = 'agent_failed' AND run.status = 'failed'
           AND run.terminal_cause = 'agent_execution_failed'
           AND attempt.attempt_id = ? AND attempt.node_id = ?
           AND attempt.state IN ('failed', 'interrupted') AND attempt.cleanup_state = 'destroyed'
           AND NOT EXISTS (
             SELECT 1 FROM agent_attempts AS later
             WHERE later.run_id = run.run_id AND later.node_id = attempt.node_id
               AND (later.created_at > attempt.created_at OR
                    (later.created_at = attempt.created_at AND later.attempt_id > attempt.attempt_id))
           )`,
      ).bind(
        retryId,
        input.retryNode,
        transitionId,
        input.requestedBy,
        input.now,
        input.now,
        input.runId,
        input.failedAttemptId,
        input.retryNode,
      ),
      this.database.prepare(
        `UPDATE orchestration_runs
         SET previous_node = current_node, current_node = ?,
             current_visit_sequence = current_visit_sequence + 1,
             last_transition_id = ?, status = 'active', gate_origin_node = NULL,
             terminal_at = NULL, terminal_cause = NULL, updated_at = ?
         WHERE run_id = ? AND current_node = 'agent_failed' AND status = 'failed'
           AND EXISTS (SELECT 1 FROM agent_stage_retries WHERE retry_id = ?)`,
      ).bind(input.retryNode, transitionId, input.now, input.runId, retryId),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_transitions_v2
         (transition_id, run_id, from_node, to_node, from_visit_sequence,
          to_visit_sequence, cause_type, cause_reference, actor_id, actor_type,
          provider_operation_id, occurred_at)
         SELECT retry.transition_id, retry.run_id, 'agent_failed', retry.retry_node,
                retry.from_visit_sequence, retry.to_visit_sequence, 'operator_retry',
                retry.failed_attempt_id, retry.requested_by, 'operator', NULL, ?
         FROM agent_stage_retries AS retry
         JOIN orchestration_runs AS run ON run.run_id = retry.run_id
         WHERE retry.retry_id = ? AND run.last_transition_id = retry.transition_id
           AND run.current_node = retry.retry_node
           AND run.current_visit_sequence = retry.to_visit_sequence`,
      ).bind(input.now, retryId),
    ]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1 || changes(results[2]) !== 1) {
      const raced = await this.find(input.failedAttemptId);
      if (raced !== null && raced.run_id === input.runId && raced.retry_node === input.retryNode) {
        return raced;
      }
      throw new Error("stage_retry_not_eligible");
    }
    const prepared = await this.find(input.failedAttemptId);
    if (prepared === null) throw new Error("stage_retry_read_back_failed");
    return prepared;
  }

  async observe(input: {
    retryId: string;
    state: AgentStageRetryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<AgentStageRetryRecord> {
    await this.database.prepare(
      `UPDATE agent_stage_retries
       SET state = ?, workflow_status = ?, safe_error_category = ?, updated_at = ?,
           established_at = CASE WHEN ? = 'established' THEN ? ELSE established_at END
       WHERE retry_id = ?`,
    ).bind(
      input.state,
      input.workflowStatus,
      input.safeErrorCategory,
      input.now,
      input.state,
      input.now,
      input.retryId,
    ).run();
    const row = await this.database.prepare(
      `SELECT retry.*, run.workflow_instance_id
       FROM agent_stage_retries AS retry
       JOIN orchestration_runs AS run ON run.run_id = retry.run_id
       WHERE retry.retry_id = ?`,
    ).bind(input.retryId).first<AgentStageRetryRecord>();
    if (row === null) throw new Error("stage_retry_observation_read_back_failed");
    return row;
  }
}

type RestartableInstance = WorkflowInstanceHandle & {
  restart(): Promise<void>;
  status(): Promise<{ status: string }>;
};

const json = (status: number, body: unknown): Response => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

export class AgentStageRetryController {
  private readonly store: AgentStageRetryStore;
  private readonly workflows: WorkflowBinding;
  private readonly secret: string;
  private readonly now: () => Date;

  constructor(
    store: AgentStageRetryStore,
    workflows: WorkflowBinding,
    secret: string,
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.workflows = workflows;
    this.secret = secret;
    this.now = now;
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
        "version", "runId", "failedAttemptId", "retryNode", "requestedBy",
      ].includes(key))
    ) return json(400, { error: "invalid_stage_retry" });
    const value = body as Record<string, unknown>;
    if (
      value.version !== 1 || typeof value.runId !== "string" || value.runId.length === 0 ||
      typeof value.failedAttemptId !== "string" || value.failedAttemptId.length === 0 ||
      (value.retryNode !== "independent_discovery" && value.retryNode !== "independent_recheck") ||
      typeof value.requestedBy !== "string" || !/^[a-zA-Z0-9._@-]{1,100}$/.test(value.requestedBy)
    ) return json(400, { error: "invalid_stage_retry" });

    let retry: AgentStageRetryRecord;
    try {
      retry = await this.store.prepare({
        runId: value.runId,
        failedAttemptId: value.failedAttemptId,
        retryNode: value.retryNode,
        requestedBy: value.requestedBy,
        now: this.now().toISOString(),
      });
    } catch (error) {
      const category = error instanceof Error ? error.message : "stage_retry_failed";
      return json(category === "stage_retry_identity_mismatch" ? 409 : 422, { error: category });
    }
    if (retry.state === "established") return json(200, { retry });
    try {
      const instance = await this.workflows.get(retry.workflow_instance_id!) as RestartableInstance;
      const before = await instance.status();
      if (["errored", "terminated", "unknown"].includes(before.status)) await instance.restart();
      const after = await instance.status();
      if (["errored", "terminated", "unknown"].includes(after.status)) {
        await this.store.observe({
          retryId: retry.retry_id,
          state: "pending",
          workflowStatus: after.status,
          safeErrorCategory: "workflow_restart_not_established",
          now: this.now().toISOString(),
        });
        return json(502, { error: "workflow_restart_not_established", retryId: retry.retry_id });
      }
      retry = await this.store.observe({
        retryId: retry.retry_id,
        state: "established",
        workflowStatus: after.status,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      return json(202, { retry });
    } catch {
      let status: string | null = null;
      try {
        const instance = await this.workflows.get(retry.workflow_instance_id!) as RestartableInstance;
        status = (await instance.status()).status;
      } catch {
        // The durable pending row makes an ambiguous provider response retryable.
      }
      if (status !== null && !["errored", "terminated", "unknown"].includes(status)) {
        retry = await this.store.observe({
          retryId: retry.retry_id,
          state: "established",
          workflowStatus: status,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        return json(202, { retry });
      }
      await this.store.observe({
        retryId: retry.retry_id,
        state: "pending",
        workflowStatus: status,
        safeErrorCategory: "workflow_restart_ambiguous",
        now: this.now().toISOString(),
      });
      return json(502, { error: "workflow_restart_ambiguous", retryId: retry.retry_id });
    }
  }
}
