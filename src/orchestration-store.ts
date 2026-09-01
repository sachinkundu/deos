import type { LoadedWorkflowDefinition } from "./workflow-definition.ts";
import {
  correlationIdentity,
  runIdentity,
  workflowInstanceIdentity,
} from "./orchestration-identity.ts";
import {
  D1RepositoryRouteStore,
  repositoryRouteDigest,
  type GitHubAccessState,
} from "./repository-routes.ts";

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
  author_model_provider?: string | null;
  author_model?: string | null;
  author_reasoning?: string | null;
  independent_review_provider?: string | null;
  independent_review_model?: string | null;
  independent_review_reasoning?: string | null;
  route_project_name?: string | null;
  route_repository?: string | null;
  route_github_installation_id?: string | null;
  route_revision?: number | null;
  route_digest?: string | null;
  route_start_state_name?: string | null;
  route_human_gate_state_id?: string | null;
  route_repository_revision?: number | null;
  route_workflow_revision?: number | null;
  route_review_revision?: number | null;
}

export interface ProjectWorkflowPolicyRecord {
  project_id: string;
  linear_project_name?: string | null;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  trial_repository: string;
  github_installation_id?: string | null;
  start_state_name: string;
  human_gate_state_id: string;
  dispatch_enabled: number;
  repository_revision: number;
  repository_updated_by: string;
  repository_updated_at: string;
  workflow_revision?: number;
  workflow_updated_by?: string;
  workflow_updated_at?: string;
  independent_review_provider?: "openrouter";
  independent_review_model?: string | null;
  independent_review_revision?: number;
  independent_review_updated_by?: string;
  independent_review_updated_at?: string;
  route_revision?: number;
  route_digest?: string | null;
  route_updated_by?: string;
  route_updated_at?: string;
  github_access_state?: "unchecked" | "passed" | "missing" | "weak_permissions" | "unavailable";
  github_access_checked_at?: string | null;
  github_access_permissions_digest?: string | null;
  github_settings_url?: string | null;
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

export interface HumanGateDecisionInput {
  deliveryId: string;
  outcome: "revision_requested" | "merge_authorized" | "canceled";
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
  recordRouteDispatchResult?(input: {
    resultId: string;
    deliveryId: string;
    projectId: string;
    queuedRouteRevision: number | null;
    queuedRouteDigest: string | null;
    outcome: "stale_route" | "missing_route" | "disabled_route" | "access_denied";
    safeErrorCategory: string | null;
    recordedAt: string;
  }): Promise<void>;
  saveRouteAccessResult?(input: {
    projectId: string;
    repository: string;
    installationId: string;
    expectedRouteRevision: number;
    expectedRouteDigest: string;
    checkId: string;
    requiredPermissionsDigest: string;
    observedPermissionsDigest: string | null;
    result: Exclude<GitHubAccessState, "unchecked">;
    settingsUrl: string | null;
    safeErrorCategory: string | null;
    actorEmail: string;
    now: string;
  }): Promise<void>;
  listPolicies?(): Promise<ProjectWorkflowPolicyRecord[]>;
  linkDefinitionToPolicy?(input: {
    projectId: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<void>;
  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null>;
  allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    selection: RunSelectionEvidence;
    routeRevision: number;
    routeDigest: string;
    now: string;
  }): Promise<{ run: OrchestrationRunRecord; created: boolean } | null>;
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
    humanGateDecision?: HumanGateDecisionInput;
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
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE NOT EXISTS (SELECT 1 FROM project_workflow_policies)
         ON CONFLICT(project_id) DO NOTHING`,
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

  async recordRouteDispatchResult(input: {
    resultId: string;
    deliveryId: string;
    projectId: string;
    queuedRouteRevision: number | null;
    queuedRouteDigest: string | null;
    outcome: "stale_route" | "missing_route" | "disabled_route" | "access_denied";
    safeErrorCategory: string | null;
    recordedAt: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO route_dispatch_results
       (result_id, delivery_id, project_id, queued_route_revision, queued_route_digest,
        outcome, safe_error_category, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.resultId,
      input.deliveryId,
      input.projectId,
      input.queuedRouteRevision,
      input.queuedRouteDigest,
      input.outcome,
      input.safeErrorCategory,
      input.recordedAt,
    ).run();
  }

  async saveRouteAccessResult(input: {
    projectId: string;
    repository: string;
    installationId: string;
    expectedRouteRevision: number;
    expectedRouteDigest: string;
    checkId: string;
    requiredPermissionsDigest: string;
    observedPermissionsDigest: string | null;
    result: Exclude<GitHubAccessState, "unchecked">;
    settingsUrl: string | null;
    safeErrorCategory: string | null;
    actorEmail: string;
    now: string;
  }): Promise<void> {
    await new D1RepositoryRouteStore(this.database).saveAccessResult(input);
  }

  async listPolicies(): Promise<ProjectWorkflowPolicyRecord[]> {
    const result = await this.database.prepare(
      "SELECT * FROM project_workflow_policies ORDER BY project_id",
    ).all<ProjectWorkflowPolicyRecord>();
    return result.results;
  }

  async linkDefinitionToPolicy(input: {
    projectId: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<void> {
    const current = await this.findPolicy(input.projectId);
    if (current === null) throw new Error("workflow route is missing");
    if (
      current.definition_id === input.definition.name &&
      current.definition_version === input.definition.version &&
      current.definition_digest === input.definition.digest
    ) return;
    if (
      current.linear_project_name === undefined || current.linear_project_name === null ||
      current.github_installation_id === undefined || current.github_installation_id === null ||
      current.workflow_revision === undefined ||
      current.independent_review_provider === undefined ||
      current.independent_review_revision === undefined ||
      current.route_revision === undefined || current.route_updated_by === undefined ||
      current.route_updated_at === undefined || current.github_access_state === undefined
    ) throw new Error("workflow route metadata is incomplete");
    const digest = await repositoryRouteDigest({
      project_id: current.project_id,
      linear_project_name: current.linear_project_name,
      definition_id: input.definition.name,
      definition_version: input.definition.version,
      definition_digest: input.definition.digest,
      trial_repository: current.trial_repository,
      github_installation_id: current.github_installation_id,
      start_state_name: current.start_state_name,
      human_gate_state_id: current.human_gate_state_id,
      dispatch_enabled: current.dispatch_enabled,
      repository_revision: current.repository_revision,
      workflow_revision: current.workflow_revision,
      independent_review_provider: current.independent_review_provider,
      independent_review_model: current.independent_review_model ?? null,
      independent_review_revision: current.independent_review_revision,
      route_revision: current.route_revision + 1,
      route_updated_by: current.route_updated_by,
      route_updated_at: current.route_updated_at,
      github_access_state: current.github_access_state,
      github_access_checked_at: current.github_access_checked_at ?? null,
      github_access_permissions_digest: current.github_access_permissions_digest ?? null,
      github_settings_url: current.github_settings_url ?? null,
    });
    const result = await this.database.prepare(
      `UPDATE project_workflow_policies
       SET definition_id = ?, definition_version = ?, definition_digest = ?,
           route_revision = route_revision + 1, route_digest = ?,
           route_updated_by = 'deployment', route_updated_at = ?, updated_at = ?
       WHERE project_id = ? AND route_revision = ?`,
    ).bind(
      input.definition.name,
      input.definition.version,
      input.definition.digest,
      digest,
      input.now,
      input.now,
      input.projectId,
      current.route_revision,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) throw new Error("workflow route definition link raced");
    const saved = await this.findPolicy(input.projectId);
    if (
      saved?.definition_id !== input.definition.name ||
      saved.definition_version !== input.definition.version ||
      saved.definition_digest !== input.definition.digest || saved.route_digest !== digest
    ) throw new Error("workflow route definition link read-back failed");
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
    routeRevision: number;
    routeDigest: string;
    now: string;
  }): Promise<{ run: OrchestrationRunRecord; created: boolean } | null> {
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
    const definitionJobs = input.definition.jobs ?? {};
    const authorJobs = Object.values(definitionJobs)
      .filter((job) => job.agentRole === "author");
    const independentJobs = Object.values(definitionJobs)
      .filter((job) => job.agentRole === "reviewer" && job.modelProvider === "openrouter");
    const authorSettings = authorJobs[0] ?? null;
    if (authorJobs.some((job) =>
      job.modelProvider !== authorSettings?.modelProvider || job.model !== authorSettings?.model ||
      job.reasoning !== authorSettings?.reasoning)) {
      throw new Error("workflow author model settings are inconsistent");
    }
    const policy = await this.findPolicy(input.projectId);
    if (
      policy === null || policy.route_revision !== input.routeRevision ||
      policy.route_digest !== input.routeDigest || policy.dispatch_enabled !== 1
    ) return null;
    if (independentJobs.length > 0 && !policy.independent_review_model) {
      throw new Error("independent review model setting is missing");
    }
    try {
      const result = await this.database.prepare(
        `INSERT INTO orchestration_runs
         (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
          definition_version, definition_digest, workflow_instance_id, current_node,
          status, selection_kind, selection_value, selection_label_name, selection_reason,
          selection_evidence_json, selection_delivery_id, selection_observed_at,
          selection_provider_digest, author_model_provider, author_model, author_reasoning,
          independent_review_provider, independent_review_model, independent_review_reasoning,
          route_project_name, route_repository, route_github_installation_id,
          route_revision, route_digest, route_start_state_name, route_human_gate_state_id,
          route_repository_revision, route_workflow_revision, route_review_revision,
          created_at, updated_at)
         SELECT ?, ?, ?, p.project_id, ?, ?, ?, ?, ?, ?, 'pending_dispatch', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                CASE WHEN ? = 0 THEN NULL ELSE p.independent_review_provider END,
                CASE WHEN ? = 0 THEN NULL ELSE p.independent_review_model END,
                ?, p.linear_project_name, p.trial_repository, p.github_installation_id,
                p.route_revision, p.route_digest, p.start_state_name, p.human_gate_state_id,
                p.repository_revision, p.workflow_revision, p.independent_review_revision, ?, ?
         FROM project_workflow_policies p
         WHERE p.project_id = ? AND p.dispatch_enabled = 1
           AND p.route_revision = ? AND p.route_digest = ?
           AND p.linear_project_name IS NOT NULL AND p.github_installation_id IS NOT NULL
           AND p.route_digest IS NOT NULL`,
      ).bind(
        runId,
        correlationId,
        sequence,
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
        authorSettings?.modelProvider ?? null,
        authorSettings?.model ?? null,
        authorSettings?.reasoning ?? null,
        independentJobs.length,
        independentJobs.length,
        independentJobs[0]?.reasoning ?? null,
        input.now,
        input.now,
        input.projectId,
        input.routeRevision,
        input.routeDigest,
      ).run();
      if (changes(result) === 1) {
        const created = await this.findRun(runId);
        if (created === null) throw new Error("created orchestration run is not readable");
        return { run: created, created: true };
      } else return null;
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
    humanGateDecision?: HumanGateDecisionInput;
    terminalCause?: string | null;
  }): Promise<TransitionCommitResult> {
    const nextVisitSequence = input.expectedVisitSequence + 1;
    const gateGuard = input.humanGateDecision === undefined
      ? ""
      : ` AND EXISTS (
            SELECT 1 FROM human_gate_visits gate
            WHERE gate.run_id = ? AND gate.visit_sequence = ? AND gate.node_id = ?
              AND gate.state = 'open' AND gate.decision_delivery_id IS NULL
          )`;
    const runUpdate = this.database.prepare(
      `UPDATE orchestration_runs
       SET previous_node = current_node, current_node = ?, current_visit_sequence = ?,
           last_transition_id = ?, status = ?, gate_origin_node = ?,
           updated_at = ?, terminal_at = CASE WHEN ? IN ${finalStatuses} THEN ? ELSE NULL END,
           terminal_cause = CASE WHEN ? = 'failed' THEN ? ELSE NULL END
       WHERE run_id = ? AND current_node = ? AND current_visit_sequence = ? AND status = ?
         AND NOT EXISTS (
           SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?
         )${gateGuard}`,
    );
    const runBindings: unknown[] = [
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
    ];
    if (input.humanGateDecision !== undefined) {
      runBindings.push(input.runId, input.expectedVisitSequence, input.expectedNode);
    }
    const statements = [
      runUpdate.bind(...runBindings),
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
    if (input.humanGateDecision !== undefined) {
      statements.push(this.database.prepare(
        `UPDATE human_gate_visits
         SET state = ?, decision_delivery_id = ?, decision_outcome = ?, decided_at = ?
         WHERE run_id = ? AND visit_sequence = ? AND node_id = ? AND state = 'open'
           AND decision_delivery_id IS NULL
           AND EXISTS (SELECT 1 FROM workflow_transitions_v2 WHERE transition_id = ?)`,
      ).bind(
        input.humanGateDecision.outcome,
        input.humanGateDecision.deliveryId,
        input.humanGateDecision.outcome,
        input.now,
        input.runId,
        input.expectedVisitSequence,
        input.expectedNode,
        input.transitionId,
      ));
    }
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
    const waitIndex = input.wait === undefined ? -1 : 2 + (input.humanGateDecision === undefined ? 0 : 1);
    const gateIndex = input.humanGateDecision === undefined ? -1 : 2;
    const waitChanged = waitIndex === -1 || changes(results[waitIndex]!) === 1;
    const gateChanged = gateIndex === -1 || changes(results[gateIndex]!) === 1;
    if (changes(results[0]) === 1 && changes(results[1]) === 1 && waitChanged && gateChanged) {
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
      if (input.humanGateDecision !== undefined) {
        const gate = await this.database.prepare(
          `SELECT decision_delivery_id, decision_outcome FROM human_gate_visits
           WHERE run_id = ? AND visit_sequence = ?`,
        ).bind(input.runId, input.expectedVisitSequence).first<{
          decision_delivery_id: string | null;
          decision_outcome: string | null;
        }>();
        if (
          gate?.decision_delivery_id !== input.humanGateDecision.deliveryId ||
          gate.decision_outcome !== input.humanGateDecision.outcome
        ) throw new Error("human gate decision identity conflict");
      }
      return { outcome: "replayed", transition };
    }
    if (changes(results[0]) !== 0 || changes(results[1]) !== 0 || !waitChanged) {
      throw new Error("workflow transition atomicity invariant failed");
    }
    return { outcome: "stale" };
  }
}
