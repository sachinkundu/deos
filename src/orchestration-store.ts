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
  | "awaiting_capability"
  | "manual_reconciliation_required"
  | "blocked"
  | "succeeded"
  | "denied"
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
  current_visit_sequence: number;
  last_transition_id: string | null;
  gate_origin_node: string | null;
  status: RunStatus;
  accumulated_data_json: string;
  created_at: string;
  updated_at: string;
  terminal_at: string | null;
  terminal_cause?: string | null;
  selection_kind?: "default" | "linear_label" | null;
  selection_value?: string | null;
  selection_label_name?: string | null;
  selection_reason?: SelectionReason | null;
  selection_evidence_json?: string | null;
  selection_delivery_id?: string | null;
  selection_observed_at?: string | null;
  selection_provider_digest?: string | null;
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
  repository_revision: number;
  repository_updated_by: string;
  repository_updated_at: string;
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

export interface WorkflowDefinitionSnapshot {
  definition_id: string;
  version: number;
  canonical_json: string;
  digest: string;
}

export interface WorkflowDefinitionSelectorRecord {
  project_id: string;
  repository: string;
  label_name: string;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface DeliverySelectionEvidenceRecord {
  label_selection_evidence_json: string | null;
  label_selection_evidence_digest: string | null;
}

export type SelectionReason =
  | "label_match"
  | "label_absent"
  | "label_evidence_unavailable"
  | "selector_disabled";

export interface RunSelectionEvidence {
  kind: "default" | "linear_label";
  value: string;
  labelName: string | null;
  reason: SelectionReason | null;
  evidenceJson: string;
  deliveryId: string;
  observedAt: string;
  providerDigest: string;
}

export interface WorkflowTransitionRecord {
  transition_id: string;
  run_id: string;
  from_node: string;
  to_node: string;
  from_visit_sequence: number;
  to_visit_sequence: number;
  cause_type: string;
  cause_reference: string;
  actor_id: string | null;
  actor_type: string | null;
  provider_operation_id: string | null;
  occurred_at: string;
}

export type TransitionCommitResult =
  | { outcome: "committed"; transition: WorkflowTransitionRecord }
  | { outcome: "replayed"; transition: WorkflowTransitionRecord }
  | { outcome: "stale" };

export interface WorkflowWaitRecord {
  wait_id: string;
  run_id: string;
  node_id: string;
  visit_sequence: number;
  status: "awaiting" | "consumed" | "canceled";
  resume_event_type: string;
  resume_event_json: string;
  resume_event_digest: string;
  cancel_event_type: string;
  cancel_event_json: string;
  cancel_event_digest: string;
  cause_reference: string;
  created_at: string;
  consumed_delivery_id: string | null;
  consumed_at: string | null;
}

export interface PersistedWaitInput {
  waitId: string;
  resumeEventType: string;
  resumeEventJson: string;
  resumeEventDigest: string;
  cancelEventType: string;
  cancelEventJson: string;
  cancelEventDigest: string;
}

export interface OrchestrationDispatchStore {
  upsertIssueIndex(input: {
    issueId: string;
    projectId: string;
    issueKey: string;
    title: string;
    linearUrl: string;
    sourceDeliveryId: string;
    observedAt: string;
  }): Promise<void>;
  registerDefinitionAndPolicy(input: {
    definition: LoadedWorkflowDefinition;
    projectId: string;
    repository: string;
    startStateName: string;
    humanGateStateId: string;
    dispatchEnabled: boolean;
    now: string;
  }): Promise<void>;
  registerDefinition(input: {
    definition: LoadedWorkflowDefinition;
    projectId: string;
    now: string;
  }): Promise<void>;
  registerSelector(input: {
    projectId: string;
    repository: string;
    labelName: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<void>;
  findSelector(
    projectId: string,
    repository: string,
    labelName: string,
  ): Promise<WorkflowDefinitionSelectorRecord | null>;
  findDeliverySelectionEvidence(
    deliveryId: string,
  ): Promise<DeliverySelectionEvidenceRecord | null>;
  findPolicy(projectId: string): Promise<ProjectWorkflowPolicyRecord | null>;
  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null>;
  allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    selection: RunSelectionEvidence;
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
    safeCause?: string | null,
  ): Promise<boolean>;
  findOpenWait(runId: string, nodeId: string): Promise<WorkflowWaitRecord | null>;
  recordWaitDelivery(input: {
    deliveryId: string;
    waitId: string;
    runId: string;
    decision: "rejected" | "already_consumed";
    safeReason: string;
    now: string;
  }): Promise<boolean>;
  consumeWait(input: {
    waitId: string;
    runId: string;
    deliveryId: string;
    expectedNode: string;
    expectedVisitSequence: number;
    expectedStatus: "awaiting_capability" | "manual_reconciliation_required";
    nextNode: string;
    nextStatus: RunStatus;
    outcome: "received" | "canceled";
    transitionId: string;
    actorId: string | null;
    actorType: string | null;
    now: string;
    terminalCause?: string | null;
  }): Promise<boolean>;
  compareAndSetNode(input: {
    runId: string;
    expectedNode: string;
    expectedVisitSequence: number;
    expectedStatus: RunStatus;
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
    wait?: PersistedWaitInput;
    terminalCause?: string | null;
  }): Promise<TransitionCommitResult>;
}

const activeStatuses = "('pending_dispatch', 'active', 'awaiting_human', 'awaiting_capability', 'manual_reconciliation_required')";
const finalStatuses = "('blocked','succeeded','denied','failed','canceled')";

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1OrchestrationStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async upsertIssueIndex(input: {
    issueId: string;
    projectId: string;
    issueKey: string;
    title: string;
    linearUrl: string;
    sourceDeliveryId: string;
    observedAt: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT INTO linear_issue_index
       (issue_id, project_id, issue_key, title, linear_url, source_delivery_id, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(issue_id) DO UPDATE SET
         project_id = excluded.project_id,
         issue_key = excluded.issue_key,
         title = excluded.title,
         linear_url = excluded.linear_url,
         source_delivery_id = excluded.source_delivery_id,
         observed_at = excluded.observed_at
       WHERE excluded.observed_at >= linear_issue_index.observed_at`,
    ).bind(
      input.issueId,
      input.projectId,
      input.issueKey,
      input.title,
      input.linearUrl,
      input.sourceDeliveryId,
      input.observedAt,
    ).run();
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

  async registerDefinition(input: {
    definition: LoadedWorkflowDefinition;
    projectId: string;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO workflow_definitions
       (definition_id, version, project_id, name, canonical_json, digest, enabled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
    ).bind(
      input.definition.name,
      input.definition.version,
      input.projectId,
      input.definition.name,
      JSON.stringify(input.definition),
      input.definition.digest,
      input.now,
    ).run();
    const stored = await this.database.prepare(
      `SELECT digest FROM workflow_definitions
       WHERE definition_id = ? AND version = ?`,
    ).bind(input.definition.name, input.definition.version).first<{ digest: string }>();
    if (stored?.digest !== input.definition.digest) {
      throw new Error("workflow definition version already exists with another digest");
    }
  }

  async registerSelector(input: {
    projectId: string;
    repository: string;
    labelName: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT INTO workflow_definition_selectors
       (project_id, repository, label_name, definition_id, definition_version,
        definition_digest, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(project_id, repository, label_name) DO UPDATE SET
         definition_id = excluded.definition_id,
         definition_version = excluded.definition_version,
         definition_digest = excluded.definition_digest,
         updated_at = excluded.updated_at`,
    ).bind(
      input.projectId,
      input.repository,
      input.labelName,
      input.definition.name,
      input.definition.version,
      input.definition.digest,
      input.now,
      input.now,
    ).run();
    const stored = await this.findSelector(input.projectId, input.repository, input.labelName);
    if (
      stored === null ||
      stored.definition_id !== input.definition.name ||
      stored.definition_version !== input.definition.version ||
      stored.definition_digest !== input.definition.digest
    ) {
      throw new Error("workflow definition selector read-back mismatch");
    }
  }

  findSelector(
    projectId: string,
    repository: string,
    labelName: string,
  ): Promise<WorkflowDefinitionSelectorRecord | null> {
    return this.database.prepare(
      `SELECT * FROM workflow_definition_selectors
       WHERE project_id = ? AND repository = ? AND label_name = ?`,
    ).bind(projectId, repository, labelName).first<WorkflowDefinitionSelectorRecord>();
  }

  findDeliverySelectionEvidence(
    deliveryId: string,
  ): Promise<DeliverySelectionEvidenceRecord | null> {
    return this.database.prepare(
      `SELECT label_selection_evidence_json, label_selection_evidence_digest
       FROM deliveries WHERE delivery_id = ?`,
    ).bind(deliveryId).first<DeliverySelectionEvidenceRecord>();
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

  findDefinitionSnapshot(
    definitionId: string,
    version: number,
  ): Promise<WorkflowDefinitionSnapshot | null> {
    return this.database.prepare(
      `SELECT definition_id, version, canonical_json, digest
       FROM workflow_definitions WHERE definition_id = ? AND version = ?`,
    ).bind(definitionId, version).first<WorkflowDefinitionSnapshot>();
  }

  async allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    selection: RunSelectionEvidence;
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
          status, selection_kind, selection_value, selection_label_name, selection_reason,
          selection_evidence_json, selection_delivery_id, selection_observed_at,
          selection_provider_digest, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_dispatch', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.selection.kind,
        input.selection.value,
        input.selection.labelName,
        input.selection.reason,
        input.selection.evidenceJson,
        input.selection.deliveryId,
        input.selection.observedAt,
        input.selection.providerDigest,
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
    safeCause: string | null = null,
  ): Promise<boolean> {
    const result = await this.database.prepare(
      `UPDATE orchestration_runs
       SET status = ?, updated_at = ?,
           terminal_at = CASE WHEN ? IN ${finalStatuses} THEN ? ELSE NULL END,
           terminal_cause = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
       WHERE run_id = ? AND current_node = ? AND status = ?`,
    ).bind(next, now, next, now, next, safeCause, runId, currentNode, expected).run();
    return changes(result) === 1;
  }

  findOpenWait(runId: string, nodeId: string): Promise<WorkflowWaitRecord | null> {
    return this.database.prepare(
      `SELECT * FROM workflow_waits
       WHERE run_id = ? AND node_id = ? AND status = 'awaiting'
       ORDER BY created_at DESC, wait_id DESC LIMIT 1`,
    ).bind(runId, nodeId).first<WorkflowWaitRecord>();
  }

  async recordWaitDelivery(input: {
    deliveryId: string;
    waitId: string;
    runId: string;
    decision: "rejected" | "already_consumed";
    safeReason: string;
    now: string;
  }): Promise<boolean> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO workflow_wait_deliveries
       (delivery_id, wait_id, run_id, decision, safe_reason, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.deliveryId,
      input.waitId,
      input.runId,
      input.decision,
      input.safeReason,
      input.now,
    ).run();
    return changes(result) === 1;
  }

  async consumeWait(input: {
    waitId: string;
    runId: string;
    deliveryId: string;
    expectedNode: string;
    expectedVisitSequence: number;
    expectedStatus: "awaiting_capability" | "manual_reconciliation_required";
    nextNode: string;
    nextStatus: RunStatus;
    outcome: "received" | "canceled";
    transitionId: string;
    actorId: string | null;
    actorType: string | null;
    now: string;
    terminalCause?: string | null;
  }): Promise<boolean> {
    const waitStatus = input.outcome === "canceled" ? "canceled" : "consumed";
    const decision = input.outcome === "canceled" ? "canceled" : "resumed";
    const nextVisitSequence = input.expectedVisitSequence + 1;
    const results = await this.database.batch([
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_transitions_v2
         (transition_id, run_id, from_node, to_node, from_visit_sequence,
          to_visit_sequence, cause_type, cause_reference,
          actor_id, actor_type, provider_operation_id, occurred_at)
         SELECT ?, ?, ?, ?, ?, ?, 'linear_event', ?, ?, ?, NULL, ?
         WHERE EXISTS (
           SELECT 1 FROM workflow_waits AS wait
           JOIN orchestration_runs AS run ON run.run_id = wait.run_id
           WHERE wait.wait_id = ? AND wait.run_id = ? AND wait.node_id = ?
             AND wait.status = 'awaiting' AND run.current_node = ?
             AND run.current_visit_sequence = ? AND run.status = ?
         )`,
      ).bind(
        input.transitionId,
        input.runId,
        input.expectedNode,
        input.nextNode,
        input.expectedVisitSequence,
        nextVisitSequence,
        input.deliveryId,
        input.actorId,
        input.actorType,
        input.now,
        input.waitId,
        input.runId,
        input.expectedNode,
        input.expectedNode,
        input.expectedVisitSequence,
        input.expectedStatus,
      ),
      this.database.prepare(
        `UPDATE orchestration_runs
         SET previous_node = current_node, current_node = ?, current_visit_sequence = ?,
             last_transition_id = ?, status = ?, gate_origin_node = NULL,
             updated_at = ?, terminal_at = CASE WHEN ? IN ${finalStatuses} THEN ? ELSE NULL END,
             terminal_cause = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
         WHERE run_id = ? AND current_node = ? AND current_visit_sequence = ? AND status = ?
           AND EXISTS (SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?)`,
      ).bind(
        input.nextNode,
        nextVisitSequence,
        input.transitionId,
        input.nextStatus,
        input.now,
        input.nextStatus,
        input.now,
        input.nextStatus,
        input.terminalCause ?? null,
        input.runId,
        input.expectedNode,
        input.expectedVisitSequence,
        input.expectedStatus,
        input.transitionId,
      ),
      this.database.prepare(
        `UPDATE workflow_waits
         SET status = ?, consumed_delivery_id = ?, consumed_at = ?
         WHERE wait_id = ? AND status = 'awaiting'
           AND EXISTS (SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?)`,
      ).bind(waitStatus, input.deliveryId, input.now, input.waitId, input.transitionId),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_wait_deliveries
         (delivery_id, wait_id, run_id, decision, safe_reason, occurred_at)
         SELECT ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?)`,
      ).bind(
        input.deliveryId,
        input.waitId,
        input.runId,
        decision,
        decision === "resumed" ? "authorized_resume" : "authorized_cancel",
        input.now,
        input.transitionId,
      ),
    ]);
    return changes(results[0]) === 1 && changes(results[1]) === 1 && changes(results[2]) === 1;
  }

  async compareAndSetNode(input: {
    runId: string;
    expectedNode: string;
    expectedVisitSequence: number;
    expectedStatus: RunStatus;
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
    wait?: PersistedWaitInput;
    terminalCause?: string | null;
  }): Promise<TransitionCommitResult> {
    const nextVisitSequence = input.expectedVisitSequence + 1;
    const statements = [
      this.database.prepare(
        `UPDATE orchestration_runs
         SET previous_node = current_node, current_node = ?, current_visit_sequence = ?,
             last_transition_id = ?, status = ?, gate_origin_node = ?,
             updated_at = ?, terminal_at = CASE WHEN ? IN ${finalStatuses} THEN ? ELSE NULL END,
             terminal_cause = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
         WHERE run_id = ? AND current_node = ? AND current_visit_sequence = ? AND status = ?
           AND NOT EXISTS (
             SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?
           )`,
      ).bind(
        input.nextNode,
        nextVisitSequence,
        input.transitionId,
        input.nextStatus,
        input.gateOriginNode,
        input.now,
        input.nextStatus,
        input.now,
        input.nextStatus,
        input.terminalCause ?? null,
        input.runId,
        input.expectedNode,
        input.expectedVisitSequence,
        input.expectedStatus,
        input.transitionId,
      ),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_transitions_v2
         (transition_id, run_id, from_node, to_node, from_visit_sequence,
          to_visit_sequence, cause_type, cause_reference,
          actor_id, actor_type, provider_operation_id, occurred_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM orchestration_runs
           WHERE run_id = ? AND previous_node = ? AND current_node = ?
             AND current_visit_sequence = ? AND last_transition_id = ?
         )`,
      ).bind(
        input.transitionId,
        input.runId,
        input.expectedNode,
        input.nextNode,
        input.expectedVisitSequence,
        nextVisitSequence,
        input.causeType,
        input.causeReference,
        input.actorId,
        input.actorType,
        input.providerOperationId,
        input.now,
        input.runId,
        input.expectedNode,
        input.nextNode,
        nextVisitSequence,
        input.transitionId,
      ),
    ];
    if (input.wait !== undefined) {
      statements.push(this.database.prepare(
        `INSERT OR IGNORE INTO workflow_waits
         (wait_id, run_id, node_id, visit_sequence, status, resume_event_type, resume_event_json,
          resume_event_digest, cancel_event_type, cancel_event_json, cancel_event_digest,
          cause_reference, created_at)
         SELECT ?, ?, ?, ?, 'awaiting', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?)`,
      ).bind(
        input.wait.waitId,
        input.runId,
        input.nextNode,
        nextVisitSequence,
        input.wait.resumeEventType,
        input.wait.resumeEventJson,
        input.wait.resumeEventDigest,
        input.wait.cancelEventType,
        input.wait.cancelEventJson,
        input.wait.cancelEventDigest,
        input.causeReference,
        input.now,
        input.transitionId,
      ));
    }
    const results = await this.database.batch(statements);
    const transition = await this.database.prepare(
      "SELECT * FROM workflow_transitions_v2 WHERE transition_id = ?",
    ).bind(input.transitionId).first<WorkflowTransitionRecord>();
    const waitChanged = input.wait === undefined || changes(results[2]) === 1;
    if (changes(results[0]) === 1 && changes(results[1]) === 1 && waitChanged) {
      if (transition === null) throw new Error("committed workflow transition is not readable");
      return { outcome: "committed", transition };
    }
    if (transition !== null) {
      const exactReplay =
        transition.run_id === input.runId &&
        transition.from_node === input.expectedNode &&
        transition.to_node === input.nextNode &&
        transition.from_visit_sequence === input.expectedVisitSequence &&
        transition.to_visit_sequence === nextVisitSequence &&
        transition.cause_type === input.causeType &&
        transition.cause_reference === input.causeReference &&
        transition.actor_id === input.actorId &&
        transition.actor_type === input.actorType &&
        transition.provider_operation_id === input.providerOperationId;
      if (!exactReplay) throw new Error("workflow transition identity conflict");
      if (input.wait !== undefined) {
        const wait = await this.database.prepare(
          "SELECT * FROM workflow_waits WHERE wait_id = ?",
        ).bind(input.wait.waitId).first<WorkflowWaitRecord>();
        const exactWait = wait !== null &&
          wait.run_id === input.runId &&
          wait.node_id === input.nextNode &&
          wait.resume_event_type === input.wait.resumeEventType &&
          wait.resume_event_json === input.wait.resumeEventJson &&
          wait.resume_event_digest === input.wait.resumeEventDigest &&
          wait.cancel_event_type === input.wait.cancelEventType &&
          wait.cancel_event_json === input.wait.cancelEventJson &&
          wait.cancel_event_digest === input.wait.cancelEventDigest &&
          wait.cause_reference === input.causeReference;
        if (!exactWait) throw new Error("workflow wait identity conflict");
      }
      return { outcome: "replayed", transition };
    }
    if (changes(results[0]) !== 0 || changes(results[1]) !== 0 || !waitChanged) {
      throw new Error("workflow transition atomicity invariant failed");
    }
    return { outcome: "stale" };
  }
}
