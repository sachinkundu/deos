import assert from "node:assert/strict";
import test from "node:test";

import {
  CategorizedWorkflowError,
  processQueueMessage,
  registerBundledWorkflowDefinitions,
  type QueueBody,
  type QueueConsumerEnv,
  type WorkflowBinding,
  type WorkflowInstanceHandle,
} from "../src/queue-consumer-core.ts";
import {
  type DispatchIntentRecord,
  type DeliverySelectionEvidenceRecord,
  type OrchestrationDispatchStore,
  type OrchestrationRunRecord,
  type ProjectWorkflowPolicyRecord,
  type RunSelectionEvidence,
  type WorkflowDefinitionSelectorRecord,
  type WorkflowInboxEvent,
  type WorkflowInboxRecord,
} from "../src/orchestration-store.ts";
import type { WorkflowObservation } from "../src/telemetry.ts";
import { RepositoryRouteError } from "../src/repository-routes.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";

const definition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: test, version: 1 }
spec:
  start: start
  execution:
    attemptTimeout: 24h
    heartbeatTimeout: 5m
    codexSandboxMode: danger-full-access
  jobs: {}
  nodes:
    start:
      type: terminal
      outcome: succeeded
`,
  { prompts: {}, schemas: {} },
);
const simpleDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: simple, version: 1 }
spec:
  start: simple_start
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    simple_start: { type: terminal, outcome: succeeded }
`,
  { prompts: {}, schemas: {} },
);
const traceabilityDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: simple-traceability, version: 1 }
spec:
  start: trace_start
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    trace_start: { type: terminal, outcome: succeeded }
`,
  { prompts: {}, schemas: {} },
);
const NOW = "2026-08-16T05:00:00.000Z";

class FakeInstance implements WorkflowInstanceHandle {
  readonly events: Array<{ type: string; payload: unknown }> = [];
  readonly id: string;

  constructor(id: string) {
    this.id = id;
  }

  async sendEvent(event: { type: string; payload: unknown }): Promise<void> {
    this.events.push(event);
  }
}

class FakeWorkflow implements WorkflowBinding {
  readonly instances = new Map<string, FakeInstance>();
  creates = 0;
  failAfterCreateOnce = false;

  async get(id: string): Promise<FakeInstance> {
    const instance = this.instances.get(id);
    if (instance === undefined) throw new Error("not found");
    return instance;
  }

  async createBatch(batch: Array<{ id: string }>): Promise<FakeInstance[]> {
    this.creates += 1;
    const created = batch.map(({ id }) => {
      const existing = this.instances.get(id);
      if (existing !== undefined) return existing;
      const instance = new FakeInstance(id);
      this.instances.set(id, instance);
      return instance;
    });
    if (this.failAfterCreateOnce) {
      this.failAfterCreateOnce = false;
      throw new Error("response lost");
    }
    return created;
  }
}

class FakeStore implements OrchestrationDispatchStore {
  readonly policies = new Map<string, ProjectWorkflowPolicyRecord>();
  readonly runs: OrchestrationRunRecord[] = [];
  readonly intents = new Map<string, DispatchIntentRecord>();
  readonly inbox = new Map<string, WorkflowInboxRecord>();
  readonly selectors = new Map<string, WorkflowDefinitionSelectorRecord>();
  readonly deliveryEvidence = new Map<string, DeliverySelectionEvidenceRecord>();
  readonly routeDispatchResults: Array<{
    outcome: "stale_route" | "missing_route" | "disabled_route" | "access_denied";
    safeErrorCategory: string | null;
  }> = [];
  readonly routeAccessResults: Array<{
    projectId: string;
    result: "passed" | "missing" | "weak_permissions" | "unavailable";
    safeErrorCategory: string | null;
  }> = [];
  failEstablishedOnce = false;
  readonly issueIndex = new Map<string, { key: string; title: string; url: string }>();

  async upsertIssueIndex(input: {
    issueId: string;
    issueKey: string;
    title: string;
    linearUrl: string;
  }): Promise<void> {
    this.issueIndex.set(input.issueId, { key: input.issueKey, title: input.title, url: input.linearUrl });
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
    const existing = this.policies.get(input.projectId);
    this.policies.set(input.projectId, {
      project_id: input.projectId,
      linear_project_name: existing?.linear_project_name ?? "Sample project",
      definition_id: input.definition.name,
      definition_version: input.definition.version,
      definition_digest: input.definition.digest,
      trial_repository: existing?.trial_repository ?? input.repository,
      github_installation_id: existing?.github_installation_id ?? "154095438",
      start_state_name: input.startStateName,
      human_gate_state_id: input.humanGateStateId,
      dispatch_enabled: existing?.dispatch_enabled ?? (input.dispatchEnabled ? 1 : 0),
      repository_revision: existing?.repository_revision ?? 1,
      repository_updated_by: existing?.repository_updated_by ?? "deployment",
      repository_updated_at: existing?.repository_updated_at ?? input.now,
      workflow_revision: existing?.workflow_revision ?? 1,
      workflow_updated_by: existing?.workflow_updated_by ?? "deployment",
      workflow_updated_at: existing?.workflow_updated_at ?? input.now,
      independent_review_provider: existing?.independent_review_provider ?? "openrouter",
      independent_review_model: existing?.independent_review_model ?? "deepseek/deepseek-v4-pro",
      independent_review_revision: existing?.independent_review_revision ?? 1,
      independent_review_updated_by: existing?.independent_review_updated_by ?? "deployment",
      independent_review_updated_at: existing?.independent_review_updated_at ?? input.now,
      route_revision: existing?.route_revision ?? 1,
      route_digest: existing?.route_digest ?? "a".repeat(64),
      route_updated_by: existing?.route_updated_by ?? "deployment",
      route_updated_at: existing?.route_updated_at ?? input.now,
      github_access_state: existing?.github_access_state ?? "passed",
      github_access_checked_at: existing?.github_access_checked_at ?? input.now,
      github_access_permissions_digest: existing?.github_access_permissions_digest ?? "b".repeat(64),
      github_settings_url: existing?.github_settings_url ?? "https://github.com/settings/installations/154095438",
      updated_at: input.now,
    });
  }

  async registerDefinition(): Promise<void> {}

  async registerSelector(input: {
    projectId: string;
    repository: string;
    labelName: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<void> {
    const key = `${input.projectId}:${input.repository}:${input.labelName}`;
    const existing = this.selectors.get(key);
    this.selectors.set(key, {
      project_id: input.projectId,
      repository: input.repository,
      label_name: input.labelName,
      definition_id: input.definition.name,
      definition_version: input.definition.version,
      definition_digest: input.definition.digest,
      enabled: existing?.enabled ?? 0,
      created_at: existing?.created_at ?? input.now,
      updated_at: input.now,
    });
  }

  async findSelector(projectId: string, repository: string, labelName: string) {
    return this.selectors.get(`${projectId}:${repository}:${labelName}`) ?? null;
  }

  findDeliverySelectionEvidence(deliveryId: string) {
    return Promise.resolve(this.deliveryEvidence.get(deliveryId) ?? null);
  }

  findPolicy(projectId: string): Promise<ProjectWorkflowPolicyRecord | null> {
    return Promise.resolve(this.policies.get(projectId) ?? null);
  }

  async recordRouteDispatchResult(input: {
    outcome: "stale_route" | "missing_route" | "disabled_route" | "access_denied";
    safeErrorCategory: string | null;
  }): Promise<void> {
    this.routeDispatchResults.push({
      outcome: input.outcome,
      safeErrorCategory: input.safeErrorCategory,
    });
  }

  async saveRouteAccessResult(input: {
    projectId: string;
    repository: string;
    installationId: string;
    expectedRouteRevision: number;
    expectedRouteDigest: string;
    result: "passed" | "missing" | "weak_permissions" | "unavailable";
    safeErrorCategory: string | null;
  }): Promise<void> {
    const policy = this.policies.get(input.projectId);
    if (
      policy?.trial_repository !== input.repository ||
      policy.github_installation_id !== input.installationId ||
      policy.route_revision !== input.expectedRouteRevision ||
      policy.route_digest !== input.expectedRouteDigest
    ) throw new RepositoryRouteError("stale_repository_revision");
    this.routeAccessResults.push({
      projectId: input.projectId,
      result: input.result,
      safeErrorCategory: input.safeErrorCategory,
    });
    if (policy !== undefined) {
      policy.github_access_state = input.result;
      if (input.result !== "passed") policy.dispatch_enabled = 0;
    }
  }

  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null> {
    return Promise.resolve(
      this.runs.findLast(
        (run) =>
          run.project_id === projectId &&
          run.issue_id === issueId &&
          [
            "pending_dispatch",
            "active",
            "awaiting_human",
            "awaiting_capability",
            "manual_reconciliation_required",
          ].includes(run.status),
      ) ?? null,
    );
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
    const policy = this.policies.get(input.projectId);
    if (
      policy?.route_revision !== input.routeRevision ||
      policy.route_digest !== input.routeDigest || policy.dispatch_enabled !== 1
    ) return null;
    const active = await this.findActiveRun(input.projectId, input.issueId);
    if (active !== null) return { run: active, created: false };
    const sequence = this.runs.filter(
      (run) => run.project_id === input.projectId && run.issue_id === input.issueId,
    ).length + 1;
    const run: OrchestrationRunRecord = {
      run_id: `workflow:${input.projectId}:${input.issueId}:run:${sequence}`,
      correlation_id: `workflow:${input.projectId}:${input.issueId}`,
      run_sequence: sequence,
      project_id: input.projectId,
      issue_id: input.issueId,
      definition_id: input.definition.name,
      definition_version: input.definition.version,
      definition_digest: input.definition.digest,
      workflow_instance_id: `workflow-instance-${sequence}`,
      previous_node: null,
      current_node: input.definition.start,
      current_visit_sequence: 1,
      last_transition_id: null,
      gate_origin_node: null,
      status: "pending_dispatch",
      accumulated_data_json: "{}",
      created_at: input.now,
      updated_at: input.now,
      terminal_at: null,
      route_project_name: policy.linear_project_name ?? null,
      route_repository: policy.trial_repository,
      route_github_installation_id: policy.github_installation_id ?? null,
      route_revision: policy.route_revision ?? null,
      route_digest: policy.route_digest ?? null,
      route_start_state_name: policy.start_state_name,
      route_human_gate_state_id: policy.human_gate_state_id,
      route_repository_revision: policy.repository_revision,
      route_workflow_revision: policy.workflow_revision ?? null,
      route_review_revision: policy.independent_review_revision ?? null,
      selection_kind: input.selection.kind,
      selection_value: input.selection.value,
      selection_label_name: input.selection.labelName,
      selection_reason: input.selection.reason,
      selection_evidence_json: input.selection.evidenceJson,
      selection_delivery_id: input.selection.deliveryId,
      selection_observed_at: input.selection.observedAt,
      selection_provider_digest: input.selection.providerDigest,
    };
    this.runs.push(run);
    return { run, created: true };
  }

  async createDispatchIntent(
    run: OrchestrationRunRecord,
    sourceDeliveryId: string,
    now: string,
  ): Promise<DispatchIntentRecord> {
    const existing = this.intents.get(run.run_id);
    if (existing !== undefined) return existing;
    const intent: DispatchIntentRecord = {
      run_id: run.run_id,
      source_delivery_id: sourceDeliveryId,
      workflow_instance_id: run.workflow_instance_id,
      state: "pending",
      attempt_count: 0,
      last_attempt_at: null,
      safe_error_category: null,
      created_at: now,
      updated_at: now,
    };
    this.intents.set(run.run_id, intent);
    return intent;
  }

  findDispatchIntent(runId: string): Promise<DispatchIntentRecord | null> {
    return Promise.resolve(this.intents.get(runId) ?? null);
  }

  async markDispatchAttempt(
    runId: string,
    state: DispatchIntentRecord["state"],
    now: string,
    safeErrorCategory: string | null = null,
  ): Promise<void> {
    if (state === "established" && this.failEstablishedOnce) {
      this.failEstablishedOnce = false;
      throw new Error("mapping write failed");
    }
    const intent = this.intents.get(runId);
    if (intent === undefined) throw new Error("missing intent");
    intent.state = state;
    intent.attempt_count += 1;
    intent.last_attempt_at = now;
    intent.safe_error_category = safeErrorCategory;
    intent.updated_at = now;
    if (state === "established") {
      const run = this.runs.find((candidate) => candidate.run_id === runId);
      if (run !== undefined) run.status = "active";
    }
  }

  async insertInboxEvent(event: WorkflowInboxEvent): Promise<boolean> {
    if (this.inbox.has(event.deliveryId)) return false;
    this.inbox.set(event.deliveryId, {
      delivery_id: event.deliveryId,
      run_id: event.runId,
      correlation_id: event.correlationId,
      event_kind: event.eventKind,
      actor_id: event.actorId,
      actor_type: event.actorType,
      provider_time: event.providerTime,
      from_state_id: event.fromStateId,
      from_state_name: event.fromStateName,
      to_state_id: event.toStateId,
      to_state_name: event.toStateName,
      payload_digest: event.payloadDigest,
      state: event.runId === null ? "unmatched" : "pending",
    });
    return true;
  }

  findInboxEvent(deliveryId: string): Promise<WorkflowInboxRecord | null> {
    return Promise.resolve(this.inbox.get(deliveryId) ?? null);
  }

  async markInboxState(
    deliveryId: string,
    expected: "pending" | "sent" | "claimed",
    next: "sent" | "claimed" | "processed" | "duplicate",
  ): Promise<boolean> {
    const inbox = this.inbox.get(deliveryId);
    if (inbox?.state !== expected) return false;
    inbox.state = next;
    return true;
  }
}

const queueBody = (overrides: Partial<QueueBody> = {}): QueueBody => ({
  event_id: "delivery-1",
  source_delivery_id: "delivery-1",
  issue_id: "issue-1",
  issue_key: "SAC-101",
  issue_title: "Show the DEOS workflow for a Linear issue",
  issue_url: "https://linear.app/deos/issue/SAC-101/show-the-deos-workflow-for-a-linear-issue",
  project_id: "project-1",
  transition: "In Progress",
  actor_id: "actor-1",
  actor_type: "user",
  event_kind: "issue-state-change",
  state_id: "in-progress-state",
  previous_state_id: "backlog-state",
  previous_state_name: "Backlog",
  occurred_at: NOW,
  correlation_id: "workflow:project-1:issue-1",
  payload_digest: "sha256-payload-1",
  label_selection_evidence: { status: "available", labels: [] },
  label_selection_evidence_digest: "824b8df4ec8660b9b753719a1d51a0fc24e663fcd05395c2d05f4ccba399a190",
  route_revision: 1,
  route_digest: "a".repeat(64),
  ...overrides,
});

const seedEvidence = (store: FakeStore, body: QueueBody): void => {
  store.deliveryEvidence.set(body.source_delivery_id, {
    label_selection_evidence_json: JSON.stringify(body.label_selection_evidence),
    label_selection_evidence_digest: body.label_selection_evidence_digest,
  });
};

const environment = (workflow: FakeWorkflow): QueueConsumerEnv => ({
  ORCHESTRATION_WORKFLOW: workflow,
  LINEAR_PROJECT_ID: "project-1",
  LINEAR_START_STATE_NAME: "In Progress",
  LINEAR_HUMAN_APPROVAL_STATE_ID: "human-approval-state",
  TRIAL_REPOSITORY: "sachinkundu/deos",
  TRIAL_DISPATCH_ENABLED: "true",
} as unknown as QueueConsumerEnv);

test("scheduled registration makes simple-traceability the default", async () => {
  const store = new FakeStore();
  const env = environment(new FakeWorkflow());
  const definitions = {
    "openspec-delivery": definition,
    simple: simpleDefinition,
    "simple-traceability": traceabilityDefinition,
  };

  await registerBundledWorkflowDefinitions(env, {
    store,
    definitions,
    now: () => new Date(NOW),
  });
  assert.equal(store.policies.get("project-1")?.definition_id, traceabilityDefinition.name);
  assert.equal(store.policies.get("project-1")?.definition_digest, traceabilityDefinition.digest);
  assert.equal(store.selectors.size, 1);
});

test("scheduled registration preserves the D1 repository setting", async () => {
  const store = new FakeStore();
  store.policies.set("project-1", {
    project_id: "project-1",
    definition_id: definition.name,
    definition_version: definition.version,
    definition_digest: definition.digest,
    trial_repository: "sachinkundu/deos-sample-project",
    start_state_name: "Todo",
    human_gate_state_id: "human-approval-state",
    dispatch_enabled: 0,
    repository_revision: 2,
    repository_updated_by: "sachinkundu@gmail.com",
    repository_updated_at: NOW,
    updated_at: NOW,
  });
  await registerBundledWorkflowDefinitions(environment(new FakeWorkflow()), {
    store,
    definitions: {
      "openspec-delivery": definition,
      simple: simpleDefinition,
      "simple-traceability": traceabilityDefinition,
    },
    now: () => new Date(NOW),
  });
  assert.equal(store.policies.get("project-1")?.trial_repository, "sachinkundu/deos-sample-project");
  assert.equal(store.policies.get("project-1")?.definition_id, traceabilityDefinition.name);
  assert.equal(store.policies.get("project-1")?.dispatch_enabled, 0);
  assert.equal(store.selectors.size, 1);
  assert.equal(
    store.selectors.get("project-1:sachinkundu/deos-sample-project:DEOS Traceability")?.enabled,
    0,
  );
  assert.equal(store.selectors.has("project-1:sachinkundu/deos:DEOS Traceability"), false);
});

const runMessage = async (
  store: FakeStore,
  workflow: FakeWorkflow,
  body = queueBody(),
  attempts = 1,
): Promise<WorkflowObservation[]> => {
  const observations: WorkflowObservation[] = [];
  seedEvidence(store, body);
  await processQueueMessage(
    { id: `message-${attempts}`, attempts, body },
    environment(workflow),
    {
      store,
      definition,
      now: () => new Date(NOW),
      observe: (entry) => observations.push(entry),
      lifecycle: () => {},
    },
  );
  return observations;
};

const runSelectedMessage = async (input: {
  store: FakeStore;
  workflow: FakeWorkflow;
  evidence?: QueueBody["label_selection_evidence"];
  evidenceDigest?: string;
  storedDigest?: string;
}): Promise<void> => {
  const evidence = input.evidence ?? { status: "available", labels: [] };
  const evidenceDigest = input.evidenceDigest ?? (
    evidence.status === "unavailable"
      ? "774a5957e1e1b76e5ba7d6a9b803e215b28d31ac0fae1df873a96758e7fb35ef"
      : evidence.labels.length === 1
        ? "0e2ea257f23ae2fad54c7b9a1e0a37721e92921c0bdc1645f4263ca6a9bdc499"
        : "824b8df4ec8660b9b753719a1d51a0fc24e663fcd05395c2d05f4ccba399a190"
  );
  const body = queueBody({
    transition: "Todo",
    label_selection_evidence: evidence,
    label_selection_evidence_digest: evidenceDigest,
  });
  seedEvidence(input.store, body);
  if (input.storedDigest !== undefined) {
    const stored = input.store.deliveryEvidence.get(body.source_delivery_id);
    if (stored !== undefined) stored.label_selection_evidence_digest = input.storedDigest;
  }
  await processQueueMessage(
    { id: "selected-message", attempts: 1, body },
    ({
      ...environment(input.workflow),
      LINEAR_START_STATE_NAME: "Todo",
    } as unknown as QueueConsumerEnv),
    {
      store: input.store,
      definitions: {
        [definition.name]: definition,
        simple: simpleDefinition,
        "simple-traceability": traceabilityDefinition,
      },
      now: () => new Date(NOW),
      observe: () => {},
      lifecycle: () => {},
    },
  );
};

test("start delivery allocates one run and establishes one stable Workflow", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  const observations = await runMessage(store, workflow);

  assert.equal(store.runs.length, 1);
  assert.equal(store.runs[0].status, "active");
  assert.equal(store.intents.get(store.runs[0].run_id)?.state, "established");
  assert.equal(workflow.creates, 1);
  assert.equal(observations.at(-1)?.["deos.workflow.outcome"], "succeeded");
});

test("a stale queued route proof is audited and cannot allocate a run", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  const body = queueBody({ route_digest: "c".repeat(64) });

  await runMessage(store, workflow, body);

  assert.equal(store.runs.length, 0);
  assert.equal(workflow.creates, 0);
  assert.equal(store.inbox.get(body.source_delivery_id)?.state, "unmatched");
  assert.deepEqual(store.routeDispatchResults, [{
    outcome: "stale_route",
    safeErrorCategory: "route_proof_mismatch",
  }]);
});

test("repository access loss disables only that route before allocation", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  const body = queueBody();
  const observations: WorkflowObservation[] = [];
  seedEvidence(store, body);

  await processQueueMessage(
    { id: "message-access-loss", attempts: 1, body },
    environment(workflow),
    {
      store,
      definition,
      now: () => new Date(NOW),
      observe: (entry) => observations.push(entry),
      lifecycle: () => {},
      githubAccess: async () => ({
        state: "missing",
        repository: null,
        settingsUrl: "https://github.com/settings/installations/154095438",
        permissions: null,
      }),
    },
  );

  assert.equal(store.runs.length, 0);
  assert.equal(workflow.creates, 0);
  assert.equal(store.policies.get("project-1")?.dispatch_enabled, 0);
  assert.deepEqual(store.routeAccessResults, [{
    projectId: "project-1",
    result: "missing",
    safeErrorCategory: "github_route_access_denied",
  }]);
  assert.deepEqual(store.routeDispatchResults, [{
    outcome: "access_denied",
    safeErrorCategory: "github_route_access_denied",
  }]);
  assert.equal(observations.at(-1)?.["deos.workflow.outcome"], "succeeded");
});

test("a route edit during the live access check is audited and starts no run", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  const body = queueBody();
  seedEvidence(store, body);

  await processQueueMessage(
    { id: "message-route-race", attempts: 1, body },
    environment(workflow),
    {
      store,
      definition,
      now: () => new Date(NOW),
      observe: () => {},
      lifecycle: () => {},
      githubAccess: async () => {
        const policy = store.policies.get(body.project_id);
        if (policy === undefined) throw new Error("route setup failed");
        policy.trial_repository = "sachinkundu/deos-sample-project-2";
        policy.route_revision = 2;
        policy.route_digest = "b".repeat(64);
        return {
          state: "passed" as const,
          repository: null,
          settingsUrl: "https://github.com/settings/installations/154095438",
          permissions: { metadata: "read", contents: "write", pull_requests: "write", checks: "write" },
        };
      },
    },
  );

  assert.equal(store.runs.length, 0);
  assert.equal(workflow.creates, 0);
  assert.deepEqual(store.routeDispatchResults, [{
    outcome: "stale_route",
    safeErrorCategory: "route_changed_during_access_check",
  }]);
});

test("labels and legacy selector state do not change the simple-traceability default", async () => {
  const labeled = new FakeStore();
  const legacyKey = "project-1:sachinkundu/deos:simple-workflow";
  await labeled.registerSelector({
    projectId: "project-1",
    repository: "sachinkundu/deos",
    labelName: "simple-workflow",
    definition: simpleDefinition,
    now: NOW,
  });
  const selector = labeled.selectors.get(legacyKey);
  if (selector === undefined) throw new Error("selector setup failed");
  selector.enabled = 1;
  await runSelectedMessage({
    store: labeled,
    workflow: new FakeWorkflow(),
    evidence: {
      status: "available",
      labels: [{ id: "label-1", name: "simple-workflow" }],
    },
  });
  assert.equal(labeled.runs[0].definition_id, "simple-traceability");
  assert.equal(labeled.runs[0].selection_kind, "default");
  assert.equal(labeled.runs[0].selection_value, "project_policy");
  assert.equal(labeled.runs[0].selection_label_name, null);
  assert.equal(labeled.runs[0].selection_reason, null);
  assert.equal(
    labeled.runs[0].selection_provider_digest,
    "0e2ea257f23ae2fad54c7b9a1e0a37721e92921c0bdc1645f4263ca6a9bdc499",
  );

  const unlabeled = new FakeStore();
  await runSelectedMessage({
    store: unlabeled,
    workflow: new FakeWorkflow(),
  });
  assert.equal(unlabeled.runs[0].definition_id, "simple-traceability");
  assert.equal(unlabeled.runs[0].selection_value, "project_policy");
});

test("the traceability selector is registered off and selects only after explicit enablement", async () => {
  const store = new FakeStore();
  await registerBundledWorkflowDefinitions(environment(new FakeWorkflow()), {
    store,
    definitions: {
      [definition.name]: definition,
      simple: simpleDefinition,
      "simple-traceability": traceabilityDefinition,
    },
    now: () => new Date(NOW),
  });
  const selector = store.selectors.get("project-1:sachinkundu/deos:DEOS Traceability");
  assert.equal(selector?.enabled, 0);

  if (selector === undefined) throw new Error("traceability selector setup failed");
  selector.enabled = 1;
  const evidence = {
    status: "available" as const,
    labels: [{ id: "trace-label", name: "DEOS Traceability" }],
  };
  const encoded = JSON.stringify(evidence);
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encoded)))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  await runSelectedMessage({ store, workflow: new FakeWorkflow(), evidence, evidenceDigest: digest });
  assert.equal(store.runs[0].definition_id, "simple-traceability");
  assert.equal(store.runs[0].selection_kind, "linear_label");
  assert.equal(store.runs[0].selection_label_name, "DEOS Traceability");
});

test("unavailable evidence keeps the simple-traceability default while tampering fails before allocation", async () => {
  const store = new FakeStore();
  await runSelectedMessage({
    store,
    workflow: new FakeWorkflow(),
    evidence: { status: "unavailable" },
  });
  assert.equal(store.runs[0].definition_id, "simple-traceability");
  assert.equal(store.runs[0].selection_value, "project_policy");
  assert.equal(store.runs[0].selection_reason, null);

  const tampered = new FakeStore();
  await assert.rejects(runSelectedMessage({
    store: tampered,
    workflow: new FakeWorkflow(),
    storedDigest: "tampered",
  }), CategorizedWorkflowError);
  assert.equal(tampered.runs.length, 0);
});

test("duplicate start delivery reuses the established instance", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  await runMessage(store, workflow);
  await runMessage(store, workflow, queueBody(), 2);

  assert.equal(store.runs.length, 1);
  assert.equal(workflow.creates, 1);
  assert.equal(workflow.instances.values().next().value?.events.length, 0);
});

test("lost create response is reconciled by stable identity", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  workflow.failAfterCreateOnce = true;
  await runMessage(store, workflow);

  assert.equal(workflow.creates, 1);
  assert.equal(workflow.instances.size, 1);
  assert.equal(store.intents.values().next().value?.state, "established");
});

test("mapping write failure retries against the existing instance", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  store.failEstablishedOnce = true;
  await assert.rejects(runMessage(store, workflow));

  await runMessage(store, workflow, queueBody(), 2);
  assert.equal(workflow.creates, 1);
  assert.equal(workflow.instances.size, 1);
  assert.equal(store.intents.values().next().value?.state, "established");
});

test("later active-run event is inboxed and sent once", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  await runMessage(store, workflow);
  const later = queueBody({
    event_id: "delivery-2",
    source_delivery_id: "delivery-2",
    transition: "Human Approval",
    state_id: "human-approval-state",
    previous_state_id: "in-progress-state",
    previous_state_name: "In Progress",
    payload_digest: "sha256-payload-2",
  });
  await runMessage(store, workflow, later);
  await runMessage(store, workflow, later, 2);

  const instance = workflow.instances.values().next().value;
  assert.deepEqual(instance?.events, [
    { type: "linear-event", payload: { deliveryId: "delivery-2" } },
  ]);
  assert.equal(store.inbox.get("delivery-2")?.state, "sent");
});

test("later waiting-run event is sent to the same instance without a replacement", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  await runMessage(store, workflow);
  const run = store.runs[0];
  run.status = "awaiting_capability";
  run.current_node = "wait-for-capability";
  const later = queueBody({
    event_id: "delivery-resume",
    source_delivery_id: "delivery-resume",
    transition: "In Progress",
    previous_state_name: "Human Review",
    payload_digest: "sha256-resume",
  });

  await runMessage(store, workflow, later);

  assert.equal(store.runs.length, 1);
  assert.equal(workflow.creates, 1);
  assert.deepEqual(workflow.instances.get(run.workflow_instance_id)?.events, [
    { type: "linear-event", payload: { deliveryId: "delivery-resume" } },
  ]);
});

test("non-start or disabled events are audited as unmatched", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  const body = queueBody({ transition: "Canceled", state_id: "canceled-state" });
  await runMessage(store, workflow, body);

  assert.equal(store.runs.length, 0);
  assert.equal(workflow.creates, 0);
  assert.equal(store.inbox.get("delivery-1")?.state, "unmatched");
});

test("a new start after terminal completion creates the next run", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  await runMessage(store, workflow);
  store.runs[0].status = "succeeded";
  const next = queueBody({
    event_id: "delivery-2",
    source_delivery_id: "delivery-2",
    payload_digest: "sha256-payload-2",
  });
  await runMessage(store, workflow, next);

  assert.deepEqual(store.runs.map((run) => run.run_sequence), [1, 2]);
  assert.deepEqual(store.runs.map((run) => run.workflow_instance_id), [
    "workflow-instance-1",
    "workflow-instance-2",
  ]);
  assert.equal(workflow.creates, 2);
});

test("correlation mismatch fails before storage or provider action", async () => {
  const store = new FakeStore();
  const workflow = new FakeWorkflow();
  await assert.rejects(
    runMessage(store, workflow, queueBody({ correlation_id: "wrong" })),
    (error: unknown) =>
      error instanceof CategorizedWorkflowError && error.category === "correlation_mismatch",
  );
  assert.equal(store.runs.length, 0);
  assert.equal(workflow.creates, 0);
});
