import { workflowInstanceIdentity } from "./orchestration-identity.ts";
import type { WorkflowBinding, WorkflowInstanceHandle } from "./queue-consumer-core.ts";
import type { LoadedWorkflowDefinition } from "./workflow-definition.ts";
import {
  isAgentStageRetryNode,
  type AgentStageRetryNode,
} from "./stage-retry-contract.ts";

export { isAgentStageRetryNode, type AgentStageRetryNode } from "./stage-retry-contract.ts";

export type AgentStageRetryKind = "same_definition" | "compatible_tail";

export interface AgentStageRetryRecord {
  retry_id: string;
  run_id: string;
  failed_attempt_id: string;
  retry_node: AgentStageRetryNode;
  retry_kind: AgentStageRetryKind;
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
  source_definition_id: string | null;
  source_definition_version: number | null;
  source_definition_digest: string | null;
  target_definition_id: string | null;
  target_definition_version: number | null;
  target_definition_digest: string | null;
  source_workflow_instance_id: string | null;
  target_workflow_instance_id: string | null;
  source_delivery_id: string | null;
  workflow_instance_id?: string;
  current_node?: string;
  current_visit_sequence?: number;
  run_status?: string;
}

export interface AgentStageRetryStore {
  prepare(input: {
    runId: string;
    failedAttemptId: string;
    retryNode: AgentStageRetryRecord["retry_node"];
    requestedBy: string;
    targetDefinition: LoadedWorkflowDefinition;
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

interface StageRetrySource {
  run_id: string;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  workflow_instance_id: string;
  current_visit_sequence: number;
  source_delivery_id: string | null;
  attempt_id: string;
  attempt_node: string;
  attempt_state: string;
  cleanup_state: string;
  is_latest_attempt: number;
  has_published_product: number;
  has_validated_candidate: number;
  has_published_entry: number;
  has_failed_exit: number;
  target_registered: number;
}

export interface StageRetryDefinitionPlan {
  retryKind: AgentStageRetryKind;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  sourceDefinitionDigest: string;
  sourceWorkflowInstanceId: string;
  targetDefinitionId: string;
  targetDefinitionVersion: number;
  targetDefinitionDigest: string;
  targetWorkflowInstanceId: string;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

const compatibleTailRequested = (
  source: Pick<StageRetrySource, "definition_id" | "definition_version">,
  retryNode: AgentStageRetryRecord["retry_node"],
): boolean =>
  source.definition_id === "simple-traceability" &&
  source.definition_version === 11 && retryNode === "independent_discovery";

export const planStageRetryDefinition = async (
  source: Pick<
    StageRetrySource,
    | "run_id"
    | "definition_id"
    | "definition_version"
    | "definition_digest"
    | "workflow_instance_id"
    | "current_visit_sequence"
    | "target_registered"
    | "has_published_product"
    | "has_validated_candidate"
    | "has_published_entry"
    | "has_failed_exit"
  >,
  retryNode: AgentStageRetryRecord["retry_node"],
  targetDefinition: LoadedWorkflowDefinition,
): Promise<StageRetryDefinitionPlan> => {
  const base = {
    sourceDefinitionId: source.definition_id,
    sourceDefinitionVersion: source.definition_version,
    sourceDefinitionDigest: source.definition_digest,
    sourceWorkflowInstanceId: source.workflow_instance_id,
  };
  if (!compatibleTailRequested(source, retryNode)) {
    return {
      ...base,
      retryKind: "same_definition",
      targetDefinitionId: source.definition_id,
      targetDefinitionVersion: source.definition_version,
      targetDefinitionDigest: source.definition_digest,
      targetWorkflowInstanceId: await workflowInstanceIdentity(
        `${source.run_id}:stage-retry:${source.current_visit_sequence + 1}:${source.definition_id}:${source.definition_version}:${source.definition_digest}`,
      ),
    };
  }
  if (
    targetDefinition.name !== "simple-traceability" || targetDefinition.version !== 12 ||
    source.target_registered !== 1 || source.has_published_product !== 1 ||
    source.has_validated_candidate !== 1 || source.has_published_entry !== 1 ||
    source.has_failed_exit !== 1
  ) throw new Error("stage_retry_not_eligible");
  return {
    ...base,
    retryKind: "compatible_tail",
    targetDefinitionId: targetDefinition.name,
    targetDefinitionVersion: targetDefinition.version,
    targetDefinitionDigest: targetDefinition.digest,
    targetWorkflowInstanceId: await workflowInstanceIdentity(
      `${source.run_id}:definition-upgrade:${targetDefinition.version}:${targetDefinition.digest}`,
    ),
  };
};

export class D1AgentStageRetryStore implements AgentStageRetryStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private find(failedAttemptId: string): Promise<AgentStageRetryRecord | null> {
    return this.database.prepare(
      `SELECT retry.*, run.workflow_instance_id, run.current_node,
              run.current_visit_sequence, run.status AS run_status
       FROM agent_stage_retries AS retry
       JOIN orchestration_runs AS run ON run.run_id = retry.run_id
       WHERE retry.failed_attempt_id = ?`,
    ).bind(failedAttemptId).first<AgentStageRetryRecord>();
  }

  private source(
    runId: string,
    failedAttemptId: string,
    targetDefinition: LoadedWorkflowDefinition,
  ): Promise<StageRetrySource | null> {
    return this.database.prepare(
      `SELECT run.run_id, run.definition_id, run.definition_version, run.definition_digest,
              run.workflow_instance_id, run.current_visit_sequence,
              COALESCE(run.selection_delivery_id, intent.source_delivery_id) AS source_delivery_id,
              attempt.attempt_id, attempt.node_id AS attempt_node,
              attempt.state AS attempt_state, attempt.cleanup_state,
              NOT EXISTS (
                SELECT 1 FROM agent_attempts AS later
                WHERE later.run_id = run.run_id AND later.node_id = attempt.node_id
                  AND (later.created_at > attempt.created_at OR
                       (later.created_at = attempt.created_at AND later.attempt_id > attempt.attempt_id))
              ) AS is_latest_attempt,
              EXISTS (
                SELECT 1 FROM run_work_products AS product
                WHERE product.run_id = run.run_id AND product.pull_request_number IS NOT NULL
                  AND product.pull_request_url IS NOT NULL AND product.head_sha IS NOT NULL
                  AND product.planning_manifest_digest IS NOT NULL
              ) AS has_published_product,
              EXISTS (
                SELECT 1 FROM planning_candidates AS candidate
                WHERE candidate.run_id = run.run_id AND candidate.state = 'validated'
                  AND candidate.accepted_at IS NOT NULL
              ) AS has_validated_candidate,
              EXISTS (
                SELECT 1 FROM workflow_transitions_v2 AS entry
                WHERE entry.run_id = run.run_id AND entry.from_node = 'publish_initial'
                  AND entry.to_node = 'independent_discovery'
                  AND entry.to_visit_sequence = run.current_visit_sequence - 1
              ) AS has_published_entry,
              EXISTS (
                SELECT 1 FROM workflow_transitions_v2 AS exit
                WHERE exit.run_id = run.run_id AND exit.from_node = 'independent_discovery'
                  AND exit.to_node = 'agent_failed'
                  AND exit.cause_reference = 'agent:independent_discovery:failed'
                  AND exit.from_visit_sequence = run.current_visit_sequence - 1
                  AND exit.to_visit_sequence = run.current_visit_sequence
              ) AS has_failed_exit,
              EXISTS (
                SELECT 1 FROM workflow_definitions AS target
                WHERE target.definition_id = ? AND target.version = ? AND target.digest = ?
              ) AS target_registered
       FROM orchestration_runs AS run
       JOIN agent_attempts AS attempt ON attempt.run_id = run.run_id
       JOIN workflow_definitions AS source
         ON source.definition_id = run.definition_id
        AND source.version = run.definition_version
        AND source.digest = run.definition_digest
       JOIN dispatch_intents AS intent
         ON intent.run_id = run.run_id AND intent.workflow_instance_id = run.workflow_instance_id
       WHERE run.run_id = ? AND attempt.attempt_id = ?
         AND run.current_node = 'agent_failed' AND run.status = 'failed'
         AND run.terminal_cause = 'agent_execution_failed'
         AND attempt.visit_sequence = run.current_visit_sequence - 1
         AND EXISTS (
           SELECT 1 FROM workflow_transitions_v2 AS failed_exit
           WHERE failed_exit.run_id = run.run_id
             AND failed_exit.from_node = attempt.node_id
             AND failed_exit.to_node = 'agent_failed'
             AND failed_exit.from_visit_sequence = attempt.visit_sequence
             AND failed_exit.to_visit_sequence = run.current_visit_sequence
             AND failed_exit.cause_reference = 'agent:' || attempt.node_id || ':failed'
         )`,
    ).bind(
      targetDefinition.name,
      targetDefinition.version,
      targetDefinition.digest,
      runId,
      failedAttemptId,
    ).first<StageRetrySource>();
  }

  async prepare(input: {
    runId: string;
    failedAttemptId: string;
    retryNode: AgentStageRetryRecord["retry_node"];
    requestedBy: string;
    targetDefinition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<AgentStageRetryRecord> {
    const existing = await this.find(input.failedAttemptId);
    if (existing !== null) {
      if (existing.run_id !== input.runId || existing.retry_node !== input.retryNode) {
        throw new Error("stage_retry_identity_mismatch");
      }
      if (
        existing.state === "pending" &&
        (
          existing.workflow_instance_id !== existing.target_workflow_instance_id ||
          existing.current_node !== existing.retry_node ||
          existing.current_visit_sequence !== existing.to_visit_sequence ||
          existing.run_status !== "active"
        )
      ) throw new Error("stage_retry_not_eligible");
      return existing;
    }
    const source = await this.source(input.runId, input.failedAttemptId, input.targetDefinition);
    if (
      source === null || source.attempt_node !== input.retryNode ||
      !["failed", "interrupted"].includes(source.attempt_state) ||
      source.cleanup_state !== "destroyed" || source.is_latest_attempt !== 1 ||
      source.source_delivery_id === null
    ) throw new Error("stage_retry_not_eligible");
    const plan = await planStageRetryDefinition(source, input.retryNode, input.targetDefinition);
    const retryId = `stage-retry:${input.failedAttemptId}`;
    const transitionId = `transition:${retryId}`;
    const upgradeGuard = plan.retryKind === "compatible_tail"
      ? `AND run.definition_id = 'simple-traceability' AND run.definition_version = 11
         AND ? = 'independent_discovery'
         AND EXISTS (
           SELECT 1 FROM workflow_definitions AS target
           WHERE target.definition_id = ? AND target.version = ? AND target.digest = ?
         )
         AND EXISTS (
           SELECT 1 FROM run_work_products AS product
           WHERE product.run_id = run.run_id AND product.pull_request_number IS NOT NULL
             AND product.pull_request_url IS NOT NULL AND product.head_sha IS NOT NULL
             AND product.planning_manifest_digest IS NOT NULL
         )
         AND EXISTS (
           SELECT 1 FROM planning_candidates AS candidate
           WHERE candidate.run_id = run.run_id AND candidate.state = 'validated'
             AND candidate.accepted_at IS NOT NULL
         )
         AND EXISTS (
           SELECT 1 FROM workflow_transitions_v2 AS entry
           WHERE entry.run_id = run.run_id AND entry.from_node = 'publish_initial'
             AND entry.to_node = 'independent_discovery'
             AND entry.to_visit_sequence = run.current_visit_sequence - 1
         )
         AND EXISTS (
           SELECT 1 FROM workflow_transitions_v2 AS exit
           WHERE exit.run_id = run.run_id AND exit.from_node = 'independent_discovery'
             AND exit.to_node = 'agent_failed'
             AND exit.cause_reference = 'agent:independent_discovery:failed'
             AND exit.from_visit_sequence = run.current_visit_sequence - 1
             AND exit.to_visit_sequence = run.current_visit_sequence
         )`
      : "";
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO agent_stage_retries
       (retry_id, run_id, failed_attempt_id, retry_node, retry_kind,
        from_visit_sequence, to_visit_sequence, transition_id, state, requested_by,
        source_definition_id, source_definition_version, source_definition_digest,
        target_definition_id, target_definition_version, target_definition_digest,
        source_workflow_instance_id, target_workflow_instance_id, source_delivery_id,
        created_at, updated_at)
       SELECT ?, run.run_id, attempt.attempt_id, ?, ?, run.current_visit_sequence,
              run.current_visit_sequence + 1, ?, 'pending', ?,
              run.definition_id, run.definition_version, run.definition_digest,
              ?, ?, ?, run.workflow_instance_id, ?,
              COALESCE(run.selection_delivery_id, intent.source_delivery_id), ?, ?
       FROM orchestration_runs AS run
       JOIN agent_attempts AS attempt ON attempt.run_id = run.run_id
       JOIN workflow_definitions AS source
         ON source.definition_id = run.definition_id
        AND source.version = run.definition_version
        AND source.digest = run.definition_digest
       JOIN dispatch_intents AS intent
         ON intent.run_id = run.run_id AND intent.workflow_instance_id = run.workflow_instance_id
       WHERE run.run_id = ? AND run.definition_id = ? AND run.definition_version = ?
         AND run.definition_digest = ? AND run.workflow_instance_id = ?
         AND run.current_visit_sequence = ? AND run.current_node = 'agent_failed'
         AND run.status = 'failed' AND run.terminal_cause = 'agent_execution_failed'
         AND attempt.attempt_id = ? AND attempt.node_id = ?
         AND attempt.visit_sequence = run.current_visit_sequence - 1
         AND attempt.state IN ('failed', 'interrupted') AND attempt.cleanup_state = 'destroyed'
         AND COALESCE(run.selection_delivery_id, intent.source_delivery_id) IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM agent_attempts AS later
           WHERE later.run_id = run.run_id AND later.node_id = attempt.node_id
             AND (later.created_at > attempt.created_at OR
                  (later.created_at = attempt.created_at AND later.attempt_id > attempt.attempt_id))
         )
         AND EXISTS (
           SELECT 1 FROM workflow_transitions_v2 AS failed_exit
           WHERE failed_exit.run_id = run.run_id
             AND failed_exit.from_node = attempt.node_id
             AND failed_exit.to_node = 'agent_failed'
             AND failed_exit.from_visit_sequence = attempt.visit_sequence
             AND failed_exit.to_visit_sequence = run.current_visit_sequence
             AND failed_exit.cause_reference = 'agent:' || attempt.node_id || ':failed'
         )
         ${upgradeGuard}`,
    );
    const insertBindings: unknown[] = [
      retryId,
      input.retryNode,
      plan.retryKind,
      transitionId,
      input.requestedBy,
      plan.targetDefinitionId,
      plan.targetDefinitionVersion,
      plan.targetDefinitionDigest,
      plan.targetWorkflowInstanceId,
      input.now,
      input.now,
      input.runId,
      plan.sourceDefinitionId,
      plan.sourceDefinitionVersion,
      plan.sourceDefinitionDigest,
      plan.sourceWorkflowInstanceId,
      source.current_visit_sequence,
      input.failedAttemptId,
      input.retryNode,
    ];
    if (plan.retryKind === "compatible_tail") {
      insertBindings.push(
        input.retryNode,
        plan.targetDefinitionId,
        plan.targetDefinitionVersion,
        plan.targetDefinitionDigest,
      );
    }
    const statements = [
      insert.bind(...insertBindings),
      this.database.prepare(
        `UPDATE orchestration_runs
         SET definition_id = ?, definition_version = ?, definition_digest = ?,
             workflow_instance_id = ?, previous_node = current_node, current_node = ?,
             current_visit_sequence = current_visit_sequence + 1,
             last_transition_id = ?, status = 'active', gate_origin_node = NULL,
             terminal_at = NULL, terminal_cause = NULL, updated_at = ?
         WHERE run_id = ? AND definition_id = ? AND definition_version = ?
           AND definition_digest = ? AND workflow_instance_id = ?
           AND current_visit_sequence = ? AND current_node = 'agent_failed' AND status = 'failed'
           AND EXISTS (SELECT 1 FROM agent_stage_retries WHERE retry_id = ?)`,
      ).bind(
        plan.targetDefinitionId,
        plan.targetDefinitionVersion,
        plan.targetDefinitionDigest,
        plan.targetWorkflowInstanceId,
        input.retryNode,
        transitionId,
        input.now,
        input.runId,
        plan.sourceDefinitionId,
        plan.sourceDefinitionVersion,
        plan.sourceDefinitionDigest,
        plan.sourceWorkflowInstanceId,
        source.current_visit_sequence,
        retryId,
      ),
    ];
    statements.push(this.database.prepare(
      `UPDATE dispatch_intents
         SET workflow_instance_id = ?, safe_error_category = NULL, updated_at = ?
         WHERE run_id = ? AND source_delivery_id = ? AND workflow_instance_id = ?
           AND EXISTS (SELECT 1 FROM agent_stage_retries WHERE retry_id = ?)`,
    ).bind(
      plan.targetWorkflowInstanceId,
      input.now,
      input.runId,
      source.source_delivery_id,
      plan.sourceWorkflowInstanceId,
      retryId,
    ));
    statements.push(
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
           AND run.current_visit_sequence = retry.to_visit_sequence
           AND run.definition_id = retry.target_definition_id
           AND run.definition_version = retry.target_definition_version
           AND run.definition_digest = retry.target_definition_digest
           AND run.workflow_instance_id = retry.target_workflow_instance_id`,
      ).bind(input.now, retryId),
    );
    const results = await this.database.batch(statements);
    if (results.some((result) => changes(result) !== 1)) {
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

type ObservableInstance = WorkflowInstanceHandle & {
  status(): Promise<{ status: string }>;
};

export interface AgentStageRetryObservation {
  outcome: "prepared" | "established" | "failed";
  retryId: string;
  runId: string;
  retryNode: AgentStageRetryRecord["retry_node"];
  retryKind: AgentStageRetryKind;
  sourceDefinitionVersion: number | null;
  targetDefinitionVersion: number | null;
  sourceWorkflowInstanceId: string | null;
  targetWorkflowInstanceId: string | null;
  workflowStatus?: string | null;
  safeErrorCategory?: string;
}

export type AgentStageRetryObserver = (event: AgentStageRetryObservation) => void;

const defaultObserver: AgentStageRetryObserver = (event) => console.log({
  "event.name": "deos.orchestration.stage_retry",
  "deos.workflow.outcome": event.outcome,
  "deos.stage_retry.id": event.retryId,
  "deos.workflow.run_id": event.runId,
  "deos.workflow.node_id": event.retryNode,
  "deos.stage_retry.kind": event.retryKind,
  "deos.stage_retry.source_definition_version": event.sourceDefinitionVersion,
  "deos.stage_retry.target_definition_version": event.targetDefinitionVersion,
  "deos.stage_retry.source_workflow_instance_id": event.sourceWorkflowInstanceId,
  "deos.stage_retry.target_workflow_instance_id": event.targetWorkflowInstanceId,
  "cloudflare.workflow.status": event.workflowStatus,
  "error.type": event.safeErrorCategory,
});

const json = (status: number, body: unknown): Response => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store" },
});

const terminalWorkflowStatuses = new Set(["errored", "terminated", "unknown"]);

export class AgentStageRetryController {
  private readonly store: AgentStageRetryStore;
  private readonly workflows: WorkflowBinding;
  private readonly secret: string;
  private readonly targetDefinition: LoadedWorkflowDefinition;
  private readonly now: () => Date;
  private readonly observe: AgentStageRetryObserver;

  constructor(
    store: AgentStageRetryStore,
    workflows: WorkflowBinding,
    secret: string,
    targetDefinition: LoadedWorkflowDefinition,
    now: () => Date = () => new Date(),
    observe: AgentStageRetryObserver = defaultObserver,
  ) {
    this.store = store;
    this.workflows = workflows;
    this.secret = secret;
    this.targetDefinition = targetDefinition;
    this.now = now;
    this.observe = observe;
  }

  private observation(
    retry: AgentStageRetryRecord,
    outcome: AgentStageRetryObservation["outcome"],
    extra: Pick<AgentStageRetryObservation, "workflowStatus" | "safeErrorCategory"> = {},
  ): AgentStageRetryObservation {
    return {
      outcome,
      retryId: retry.retry_id,
      runId: retry.run_id,
      retryNode: retry.retry_node,
      retryKind: retry.retry_kind ?? "same_definition",
      sourceDefinitionVersion: retry.source_definition_version,
      targetDefinitionVersion: retry.target_definition_version,
      sourceWorkflowInstanceId: retry.source_workflow_instance_id,
      targetWorkflowInstanceId: retry.target_workflow_instance_id ?? retry.workflow_instance_id ?? null,
      ...extra,
    };
  }

  private targetWorkflowInstanceId(retry: AgentStageRetryRecord): string {
    const id = retry.target_workflow_instance_id ?? retry.workflow_instance_id;
    if (!id) throw new Error("stage_retry_target_instance_missing");
    return id;
  }

  private async locateReplacement(
    retry: AgentStageRetryRecord,
  ): Promise<ObservableInstance> {
    const id = this.targetWorkflowInstanceId(retry);
    try {
      return await this.workflows.get(id) as ObservableInstance;
    } catch {
      // Creation uses the durable target ID, so an ambiguous response is safe to reconcile.
    }
    try {
      const created = await this.workflows.createBatch([{
        id,
        params: { runId: retry.run_id, sourceDeliveryId: retry.source_delivery_id! },
      }]);
      const handle = created.find((instance) => instance.id === id);
      if (handle !== undefined) return handle as ObservableInstance;
    } catch {
      // The provider may have created the instance before the response failed.
    }
    return await this.workflows.get(id) as ObservableInstance;
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
      !isAgentStageRetryNode(value.retryNode) ||
      typeof value.requestedBy !== "string" || !/^[a-zA-Z0-9._@-]{1,100}$/.test(value.requestedBy)
    ) return json(400, { error: "invalid_stage_retry" });

    let retry: AgentStageRetryRecord;
    try {
      retry = await this.store.prepare({
        runId: value.runId,
        failedAttemptId: value.failedAttemptId,
        retryNode: value.retryNode,
        requestedBy: value.requestedBy,
        targetDefinition: this.targetDefinition,
        now: this.now().toISOString(),
      });
    } catch (error) {
      const category = error instanceof Error ? error.message : "stage_retry_failed";
      return json(category === "stage_retry_identity_mismatch" ? 409 : 422, { error: category });
    }
    if (retry.state === "established") return json(200, { retry });
    this.observe(this.observation(retry, "prepared"));
    const targetId = this.targetWorkflowInstanceId(retry);
    const notEstablished = "workflow_replacement_not_established";
    const ambiguous = "workflow_replacement_ambiguous";
    try {
      const instance = await this.locateReplacement(retry);
      const after = await instance.status();
      if (terminalWorkflowStatuses.has(after.status)) {
        await this.store.observe({
          retryId: retry.retry_id,
          state: "pending",
          workflowStatus: after.status,
          safeErrorCategory: notEstablished,
          now: this.now().toISOString(),
        });
        this.observe(this.observation(retry, "failed", {
          workflowStatus: after.status,
          safeErrorCategory: notEstablished,
        }));
        return json(502, { error: notEstablished, retryId: retry.retry_id });
      }
      retry = await this.store.observe({
        retryId: retry.retry_id,
        state: "established",
        workflowStatus: after.status,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      this.observe(this.observation(retry, "established", { workflowStatus: after.status }));
      return json(202, { retry });
    } catch {
      let status: string | null = null;
      try {
        const instance = await this.workflows.get(targetId) as ObservableInstance;
        status = (await instance.status()).status;
      } catch {
        // The durable pending row makes an ambiguous provider response retryable.
      }
      if (status !== null && !terminalWorkflowStatuses.has(status)) {
        retry = await this.store.observe({
          retryId: retry.retry_id,
          state: "established",
          workflowStatus: status,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        this.observe(this.observation(retry, "established", { workflowStatus: status }));
        return json(202, { retry });
      }
      await this.store.observe({
        retryId: retry.retry_id,
        state: "pending",
        workflowStatus: status,
        safeErrorCategory: ambiguous,
        now: this.now().toISOString(),
      });
      this.observe(this.observation(retry, "failed", {
        workflowStatus: status,
        safeErrorCategory: ambiguous,
      }));
      return json(502, { error: ambiguous, retryId: retry.retry_id });
    }
  }
}
