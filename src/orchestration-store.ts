import type { LoadedWorkflowDefinition } from "./workflow-definition.ts";
import {
  correlationIdentity,
  runIdentity,
  workflowInstanceIdentity,
} from "./orchestration-identity.ts";

export type RunStatus =
  | "pending_dispatch"
  | "active"
  | "awaiting_human"
  | "blocked"
  | "succeeded"
  | "failed"
  | "canceled";

export interface OrchestrationRunRecord {
  run_id: string;
  correlation_id: string;
  run_sequence: number;
  project_id: string;
  issue_id: string;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  workflow_instance_id: string;
  previous_node: string | null;
  current_node: string;
  gate_origin_node: string | null;
  status: RunStatus;
  accumulated_data_json: string;
  created_at: string;
  updated_at: string;
  terminal_at: string | null;
}

export interface ProjectWorkflowPolicyRecord {
  project_id: string;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  trial_repository: string;
  start_state_name: string;
  human_gate_state_id: string;
  dispatch_enabled: number;
  updated_at: string;
}

export interface DispatchIntentRecord {
  run_id: string;
  source_delivery_id: string;
  workflow_instance_id: string;
  state: "pending" | "established" | "failed";
  attempt_count: number;
  last_attempt_at: string | null;
  safe_error_category: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowInboxEvent {
  deliveryId: string;
  runId: string | null;
  correlationId: string;
  eventKind: string;
  actorId: string | null;
  actorType: string | null;
  providerTime: string;
  fromStateId: string | null;
  fromStateName: string | null;
  toStateId: string | null;
  toStateName: string;
  payloadDigest: string;
}

export interface WorkflowInboxRecord {
  delivery_id: string;
  run_id: string | null;
  correlation_id: string;
  event_kind: string;
  actor_id: string | null;
  actor_type: string | null;
  provider_time: string;
  from_state_id: string | null;
  from_state_name: string | null;
  to_state_id: string | null;
  to_state_name: string;
  payload_digest: string;
  state: "pending" | "sent" | "claimed" | "processed" | "duplicate" | "unmatched";
}

export interface OrchestrationDispatchStore {
  registerDefinitionAndPolicy(input: {
    definition: LoadedWorkflowDefinition;
    projectId: string;
    repository: string;
    startStateName: string;
    humanGateStateId: string;
    dispatchEnabled: boolean;
    now: string;
  }): Promise<void>;
  findPolicy(projectId: string): Promise<ProjectWorkflowPolicyRecord | null>;
  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null>;
  allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<{ run: OrchestrationRunRecord; created: boolean }>;
  createDispatchIntent(
    run: OrchestrationRunRecord,
    sourceDeliveryId: string,
    now: string,
  ): Promise<DispatchIntentRecord>;
  findDispatchIntent(runId: string): Promise<DispatchIntentRecord | null>;
  markDispatchAttempt(
    runId: string,
    state: DispatchIntentRecord["state"],
    now: string,
    safeErrorCategory?: string | null,
  ): Promise<void>;
  insertInboxEvent(event: WorkflowInboxEvent, now: string): Promise<boolean>;
  findInboxEvent(deliveryId: string): Promise<WorkflowInboxRecord | null>;
  markInboxState(
    deliveryId: string,
    expected: "pending" | "sent" | "claimed",
    next: "sent" | "claimed" | "processed" | "duplicate",
    now: string,
  ): Promise<boolean>;
}

export interface WorkflowRuntimeStore {
  findRun(runId: string): Promise<OrchestrationRunRecord | null>;
  findInboxEvent(deliveryId: string): Promise<WorkflowInboxRecord | null>;
  claimInboxEvent(deliveryId: string, runId: string, now: string): Promise<WorkflowInboxRecord | null>;
  markInboxState(
    deliveryId: string,
    expected: "pending" | "sent" | "claimed",
    next: "sent" | "claimed" | "processed" | "duplicate",
    now: string,
  ): Promise<boolean>;
  setRunStatus(
    runId: string,
    currentNode: string,
    expected: RunStatus,
    next: RunStatus,
    now: string,
  ): Promise<boolean>;
  compareAndSetNode(input: {
    runId: string;
    expectedNode: string;
    nextNode: string;
    nextStatus: RunStatus;
    gateOriginNode: string | null;
    transitionId: string;
    causeType: string;
    causeReference: string;
    actorId: string | null;
    actorType: string | null;
    providerOperationId: string | null;
    now: string;
  }): Promise<boolean>;
}

const activeStatuses = "('pending_dispatch', 'active', 'awaiting_human')";

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1OrchestrationStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async registerDefinitionAndPolicy(input: {
    definition: LoadedWorkflowDefinition;
    projectId: string;
    repository: string;
    startStateName: string;
    humanGateStateId: string;
    dispatchEnabled: boolean;
    now: string;
  }): Promise<void> {
    const definitionId = input.definition.name;
    const canonicalJson = JSON.stringify(input.definition);
    await this.database.batch([
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_definitions
         (definition_id, version, project_id, name, canonical_json, digest, enabled_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        definitionId,
        input.definition.version,
        input.projectId,
        input.definition.name,
        canonicalJson,
        input.definition.digest,
        input.dispatchEnabled ? input.now : null,
        input.now,
      ),
      this.database.prepare(
        `INSERT INTO project_workflow_policies
         (project_id, definition_id, definition_version, definition_digest, trial_repository,
          start_state_name, human_gate_state_id, dispatch_enabled, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(project_id) DO UPDATE SET
           definition_id = excluded.definition_id,
           definition_version = excluded.definition_version,
           definition_digest = excluded.definition_digest,
           trial_repository = excluded.trial_repository,
           start_state_name = excluded.start_state_name,
           human_gate_state_id = excluded.human_gate_state_id,
           dispatch_enabled = project_workflow_policies.dispatch_enabled,
           updated_at = excluded.updated_at`,
      ).bind(
        input.projectId,
        definitionId,
        input.definition.version,
        input.definition.digest,
        input.repository,
        input.startStateName,
        input.humanGateStateId,
        input.dispatchEnabled ? 1 : 0,
        input.now,
      ),
    ]);
    const stored = await this.database.prepare(
      "SELECT digest FROM workflow_definitions WHERE definition_id = ? AND version = ?",
    ).bind(definitionId, input.definition.version).first<{ digest: string }>();
    if (stored?.digest !== input.definition.digest) {
      throw new Error("workflow definition version already exists with another digest");
    }
  }

  findPolicy(projectId: string): Promise<ProjectWorkflowPolicyRecord | null> {
    return this.database.prepare(
      "SELECT * FROM project_workflow_policies WHERE project_id = ?",
    ).bind(projectId).first<ProjectWorkflowPolicyRecord>();
  }

  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null> {
    return this.database.prepare(
      `SELECT * FROM orchestration_runs
       WHERE project_id = ? AND issue_id = ? AND status IN ${activeStatuses}
       ORDER BY run_sequence DESC LIMIT 1`,
    ).bind(projectId, issueId).first<OrchestrationRunRecord>();
  }

  findRun(runId: string): Promise<OrchestrationRunRecord | null> {
    return this.database.prepare(
      "SELECT * FROM orchestration_runs WHERE run_id = ?",
    ).bind(runId).first<OrchestrationRunRecord>();
  }

  async allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<{ run: OrchestrationRunRecord; created: boolean }> {
    const active = await this.findActiveRun(input.projectId, input.issueId);
    if (active !== null) return { run: active, created: false };
    const sequenceRow = await this.database.prepare(
      `SELECT COALESCE(MAX(run_sequence), 0) + 1 AS next_sequence
       FROM orchestration_runs WHERE project_id = ? AND issue_id = ?`,
    ).bind(input.projectId, input.issueId).first<{ next_sequence: number }>();
    const sequence = sequenceRow?.next_sequence ?? 1;
    const correlationId = correlationIdentity(input.projectId, input.issueId);
    const runId = runIdentity(correlationId, sequence);
    const workflowInstanceId = await workflowInstanceIdentity(runId);
    try {
      const result = await this.database.prepare(
        `INSERT INTO orchestration_runs
         (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
          definition_version, definition_digest, workflow_instance_id, current_node,
          status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_dispatch', ?, ?)`,
      ).bind(
        runId,
        correlationId,
        sequence,
        input.projectId,
        input.issueId,
        input.definition.name,
        input.definition.version,
        input.definition.digest,
        workflowInstanceId,
        input.definition.start,
        input.now,
        input.now,
      ).run();
      if (changes(result) === 1) {
        const created = await this.findRun(runId);
        if (created === null) throw new Error("created orchestration run is not readable");
        return { run: created, created: true };
      }
    } catch {
      const raced = await this.findActiveRun(input.projectId, input.issueId);
      if (raced !== null) return { run: raced, created: false };
      throw new Error("orchestration run allocation failed without a readable winner");
    }
    throw new Error("orchestration run allocation did not create a row");
  }

  async createDispatchIntent(
    run: OrchestrationRunRecord,
    sourceDeliveryId: string,
    now: string,
  ): Promise<DispatchIntentRecord> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO dispatch_intents
       (run_id, source_delivery_id, workflow_instance_id, state, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    ).bind(run.run_id, sourceDeliveryId, run.workflow_instance_id, now, now).run();
    const intent = await this.database.prepare(
      "SELECT * FROM dispatch_intents WHERE run_id = ?",
    ).bind(run.run_id).first<DispatchIntentRecord>();
    if (intent === null || intent.workflow_instance_id !== run.workflow_instance_id) {
      throw new Error("dispatch intent identity mismatch");
    }
    return intent;
  }

  findDispatchIntent(runId: string): Promise<DispatchIntentRecord | null> {
    return this.database.prepare(
      "SELECT * FROM dispatch_intents WHERE run_id = ?",
    ).bind(runId).first<DispatchIntentRecord>();
  }

  async markDispatchAttempt(
    runId: string,
    state: DispatchIntentRecord["state"],
    now: string,
    safeErrorCategory: string | null = null,
  ): Promise<void> {
    await this.database.prepare(
      `UPDATE dispatch_intents
       SET state = ?, attempt_count = attempt_count + 1, last_attempt_at = ?,
           safe_error_category = ?, updated_at = ?
       WHERE run_id = ?`,
    ).bind(state, now, safeErrorCategory, now, runId).run();
    if (state === "established") {
      await this.database.prepare(
        `UPDATE orchestration_runs SET status = 'active', updated_at = ?
         WHERE run_id = ? AND status = 'pending_dispatch'`,
      ).bind(now, runId).run();
    }
  }

  async insertInboxEvent(event: WorkflowInboxEvent, now: string): Promise<boolean> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO workflow_event_inbox
       (delivery_id, run_id, correlation_id, event_kind, actor_id, actor_type,
        provider_time, from_state_id, from_state_name, to_state_id, to_state_name,
        payload_digest, state, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      event.deliveryId,
      event.runId,
      event.correlationId,
      event.eventKind,
      event.actorId,
      event.actorType,
      event.providerTime,
      event.fromStateId,
      event.fromStateName,
      event.toStateId,
      event.toStateName,
      event.payloadDigest,
      event.runId === null ? "unmatched" : "pending",
      now,
    ).run();
    return changes(result) === 1;
  }

  findInboxEvent(deliveryId: string): Promise<WorkflowInboxRecord | null> {
    return this.database.prepare(
      "SELECT * FROM workflow_event_inbox WHERE delivery_id = ?",
    ).bind(deliveryId).first<WorkflowInboxRecord>();
  }

  async claimInboxEvent(
    deliveryId: string,
    runId: string,
    now: string,
  ): Promise<WorkflowInboxRecord | null> {
    const result = await this.database.prepare(
      `UPDATE workflow_event_inbox SET state = 'claimed', claimed_at = ?
       WHERE delivery_id = ? AND run_id = ? AND state IN ('pending', 'sent')`,
    ).bind(now, deliveryId, runId).run();
    if (changes(result) !== 1) return null;
    return this.findInboxEvent(deliveryId);
  }

  async markInboxState(
    deliveryId: string,
    expected: "pending" | "sent" | "claimed",
    next: "sent" | "claimed" | "processed" | "duplicate",
    now: string,
  ): Promise<boolean> {
    const column = next === "sent" ? "sent_at" : next === "claimed" ? "claimed_at" : "processed_at";
    const result = await this.database.prepare(
      `UPDATE workflow_event_inbox SET state = ?, ${column} = ?
       WHERE delivery_id = ? AND state = ?`,
    ).bind(next, now, deliveryId, expected).run();
    return changes(result) === 1;
  }

  async setRunStatus(
    runId: string,
    currentNode: string,
    expected: RunStatus,
    next: RunStatus,
    now: string,
  ): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE orchestration_runs SET status = ?, updated_at = ?
       WHERE run_id = ? AND current_node = ? AND status = ?`,
    ).bind(next, now, runId, currentNode, expected).run();
    return changes(result) === 1;
  }

  async compareAndSetNode(input: {
    runId: string;
    expectedNode: string;
    nextNode: string;
    nextStatus: RunStatus;
    gateOriginNode: string | null;
    transitionId: string;
    causeType: string;
    causeReference: string;
    actorId: string | null;
    actorType: string | null;
    providerOperationId: string | null;
    now: string;
  }): Promise<boolean> {
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE orchestration_runs
         SET previous_node = current_node, current_node = ?, status = ?, gate_origin_node = ?,
             updated_at = ?, terminal_at = CASE WHEN ? IN ('blocked','succeeded','failed','canceled') THEN ? ELSE NULL END
         WHERE run_id = ? AND current_node = ?`,
      ).bind(
        input.nextNode,
        input.nextStatus,
        input.gateOriginNode,
        input.now,
        input.nextStatus,
        input.now,
        input.runId,
        input.expectedNode,
      ),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_transitions_v2
         (transition_id, run_id, from_node, to_node, cause_type, cause_reference,
          actor_id, actor_type, provider_operation_id, occurred_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM orchestration_runs
           WHERE run_id = ? AND previous_node = ? AND current_node = ? AND updated_at = ?
         )`,
      ).bind(
        input.transitionId,
        input.runId,
        input.expectedNode,
        input.nextNode,
        input.causeType,
        input.causeReference,
        input.actorId,
        input.actorType,
        input.providerOperationId,
        input.now,
        input.runId,
        input.expectedNode,
        input.nextNode,
        input.now,
      ),
    ]);
    return changes(results[0]) === 1 && changes(results[1]) === 1;
  }
}
