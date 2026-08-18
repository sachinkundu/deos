import assert from "node:assert/strict";
import test from "node:test";

import {
  CategorizedWorkflowError,
  processQueueMessage,
  type QueueBody,
  type QueueConsumerEnv,
  type WorkflowBinding,
  type WorkflowInstanceHandle,
} from "../src/queue-consumer-core.ts";
import {
  type DispatchIntentRecord,
  type OrchestrationDispatchStore,
  type OrchestrationRunRecord,
  type ProjectWorkflowPolicyRecord,
  type WorkflowInboxEvent,
  type WorkflowInboxRecord,
} from "../src/orchestration-store.ts";
import type { WorkflowObservation } from "../src/telemetry.ts";
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
  failEstablishedOnce = false;

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
      definition_id: input.definition.name,
      definition_version: input.definition.version,
      definition_digest: input.definition.digest,
      trial_repository: input.repository,
      start_state_name: input.startStateName,
      human_gate_state_id: input.humanGateStateId,
      dispatch_enabled: existing?.dispatch_enabled ?? (input.dispatchEnabled ? 1 : 0),
      updated_at: input.now,
    });
  }

  findPolicy(projectId: string): Promise<ProjectWorkflowPolicyRecord | null> {
    return Promise.resolve(this.policies.get(projectId) ?? null);
  }

  findActiveRun(projectId: string, issueId: string): Promise<OrchestrationRunRecord | null> {
    return Promise.resolve(
      this.runs.findLast(
        (run) =>
          run.project_id === projectId &&
          run.issue_id === issueId &&
          ["pending_dispatch", "active", "awaiting_human"].includes(run.status),
      ) ?? null,
    );
  }

  async allocateRun(input: {
    projectId: string;
    issueId: string;
    definition: LoadedWorkflowDefinition;
    now: string;
  }): Promise<{ run: OrchestrationRunRecord; created: boolean }> {
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
  ...overrides,
});

const environment = (workflow: FakeWorkflow): QueueConsumerEnv => ({
  ORCHESTRATION_WORKFLOW: workflow,
  LINEAR_PROJECT_ID: "project-1",
  LINEAR_START_STATE_NAME: "In Progress",
  LINEAR_HUMAN_APPROVAL_STATE_ID: "human-approval-state",
  TRIAL_REPOSITORY: "sachinkundu/deos",
  TRIAL_DISPATCH_ENABLED: "true",
} as unknown as QueueConsumerEnv);

const runMessage = async (
  store: FakeStore,
  workflow: FakeWorkflow,
  body = queueBody(),
  attempts = 1,
): Promise<WorkflowObservation[]> => {
  const observations: WorkflowObservation[] = [];
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
