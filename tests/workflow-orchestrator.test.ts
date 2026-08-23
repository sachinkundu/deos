import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrchestrationRunRecord,
  RunStatus,
  WorkflowTransitionRecord,
  WorkflowInboxRecord,
  WorkflowRuntimeStore,
  WorkflowWaitRecord,
} from "../src/orchestration-store.ts";
import type {
  WorkflowNodeServices,
  WorkflowStepLike,
} from "../src/workflow-orchestrator.ts";
import { WorkflowFailureError, WorkflowOrchestrator } from "../src/workflow-orchestrator.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";

const NOW = "2026-08-16T06:00:00.000Z";
const definition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: orchestrator-test, version: 1 }
spec:
  start: implement
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs:
    work:
      promptFile: prompts/work.md
      inputs: []
      resultSchema: schemas/result.json
      requiredOutputs: []
  nodes:
    implement: { type: agent, job: work, edges: { completed: review, blocked: blocked, failed: blocked } }
    review: { type: agent, job: work, edges: { approved: approval, changes_requested: implement, blocked: blocked, failed: blocked } }
    approval: { type: human_gate, linearState: Human Approval, edges: { approved: verify, rejected: implement } }
    verify: { type: system_action, action: openspec.verify, edges: { completed: done, failed: blocked } }
    done: { type: terminal, outcome: succeeded }
    blocked: { type: terminal, outcome: blocked }
`,
  {
    prompts: { "prompts/work.md": "Work." },
    schemas: {
      "schemas/result.json": JSON.stringify({ $id: "https://deos.dev/result.json", type: "object" }),
    },
  },
);

const resumableDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: resumable-test, version: 4 }
spec:
  start: action
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    action: { type: system_action, action: openspec.create_tasks, edges: { completed: done, failed: wait } }
    wait:
      type: wait
      deosStatus: awaiting_capability
      resumeEvent: { type: linear.issue.state_changed, actorType: user, toState: In Progress, action: openspec.create_tasks }
      cancelEvent: { type: linear.issue.state_changed, actorType: user, toState: Canceled }
      edges: { received: action, canceled: canceled }
    done: { type: terminal, deosStatus: succeeded, executorAction: return }
    canceled: { type: terminal, deosStatus: canceled, executorAction: return }
`,
  { prompts: {}, schemas: {} },
);

const failureDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: failure-test, version: 4 }
spec:
  start: action
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    action: { type: system_action, action: openspec.verify, edges: { completed: done, failed: failed } }
    done: { type: terminal, deosStatus: succeeded, executorAction: return }
    failed: { type: failure, deosStatus: failed, executorAction: throw, cause: verification_invariant_failed }
`,
  { prompts: {}, schemas: {} },
);

const agentInvariantFailureDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: agent-invariant-failure-test, version: 4 }
spec:
  start: review
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs:
    review:
      promptFile: prompts/work.md
      inputs: []
      resultSchema: schemas/result.json
      requiredOutputs: []
  nodes:
    review: { type: agent, job: review, edges: { approved: done, blocked: failed, failed: failed } }
    done: { type: terminal, deosStatus: succeeded, executorAction: return }
    failed: { type: failure, deosStatus: failed, executorAction: throw, cause: agent_execution_failed }
`,
  {
    prompts: { "prompts/work.md": "Work." },
    schemas: {
      "schemas/result.json": JSON.stringify({ $id: "https://deos.dev/result.json", type: "object" }),
    },
  },
);

const simpleDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: simple, version: 1 }
spec:
  start: openspec_planning
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs:
    planning:
      promptFile: prompts/work.md
      inputs: [openspec_change]
      resultSchema: schemas/result.json
      requiredOutputs: []
      capabilities: [github.publish_planning_work_product]
  nodes:
    openspec_planning: { type: agent, job: planning, edges: { completed: planning_review, blocked: failed, failed: failed } }
    planning_review:
      type: human_gate
      linearState: Human Review
      decisions: { revision_requested: In Progress, merge_authorized: Merging, canceled: Canceled }
      edges: { revision_requested: openspec_planning, merge_authorized: merge, canceled: canceled }
    merge: { type: system_action, action: github.merge_planning_pull_request, edges: { completed: verify, failed: failed } }
    verify: { type: system_action, action: github.verify_planning_merge, edges: { completed: done, failed: failed } }
    done: { type: terminal, deosStatus: succeeded, executorAction: return }
    canceled: { type: terminal, deosStatus: canceled, executorAction: return }
    failed: { type: failure, deosStatus: failed, executorAction: throw, cause: planning_failed }
`,
  {
    prompts: { "prompts/work.md": "Plan." },
    schemas: {
      "schemas/result.json": JSON.stringify({ $id: "https://deos.dev/result.json", type: "object" }),
    },
  },
);

const makeRun = (selectedDefinition = definition): OrchestrationRunRecord => ({
  run_id: "workflow:project-1:issue-1:run:1",
  correlation_id: "workflow:project-1:issue-1",
  run_sequence: 1,
  project_id: "project-1",
  issue_id: "issue-1",
  definition_id: selectedDefinition.name,
  definition_version: selectedDefinition.version,
  definition_digest: selectedDefinition.digest,
  workflow_instance_id: "wf-1",
  previous_node: null,
  current_node: selectedDefinition.start,
  current_visit_sequence: 1,
  last_transition_id: null,
  gate_origin_node: null,
  status: "active",
  accumulated_data_json: "{}",
  created_at: NOW,
  updated_at: NOW,
  terminal_at: null,
});

class RuntimeStore implements WorkflowRuntimeStore {
  readonly run: OrchestrationRunRecord;
  readonly inbox = new Map<string, WorkflowInboxRecord>();
  readonly waits = new Map<string, WorkflowWaitRecord>();
  readonly waitDeliveries: Array<{ deliveryId: string; decision: string }> = [];
  readonly transitions: Array<WorkflowTransitionRecord> = [];
  reads = 0;
  staleTransitionAtNode: string | null = null;

  constructor(run = makeRun()) {
    this.run = run;
  }

  findRun(runId: string): Promise<OrchestrationRunRecord | null> {
    this.reads += 1;
    return Promise.resolve(runId === this.run.run_id ? { ...this.run } : null);
  }

  findInboxEvent(deliveryId: string): Promise<WorkflowInboxRecord | null> {
    return Promise.resolve(this.inbox.get(deliveryId) ?? null);
  }

  claimInboxEvent(deliveryId: string, runId: string): Promise<WorkflowInboxRecord | null> {
    const event = this.inbox.get(deliveryId);
    if (event === undefined || event.run_id !== runId || !["pending", "sent"].includes(event.state)) {
      return Promise.resolve(null);
    }
    event.state = "claimed";
    return Promise.resolve({ ...event });
  }

  markInboxState(
    deliveryId: string,
    expected: "pending" | "sent" | "claimed",
    next: "sent" | "claimed" | "processed" | "duplicate",
  ): Promise<boolean> {
    const event = this.inbox.get(deliveryId);
    if (event?.state !== expected) return Promise.resolve(false);
    event.state = next;
    return Promise.resolve(true);
  }

  setRunStatus(
    runId: string,
    currentNode: string,
    expected: RunStatus,
    next: RunStatus,
  ): Promise<boolean> {
    if (
      this.run.run_id !== runId ||
      this.run.current_node !== currentNode ||
      this.run.status !== expected
    ) return Promise.resolve(false);
    this.run.status = next;
    return Promise.resolve(true);
  }

  findOpenWait(runId: string, nodeId: string): Promise<WorkflowWaitRecord | null> {
    return Promise.resolve(
      [...this.waits.values()].find(
        (wait) => wait.run_id === runId && wait.node_id === nodeId && wait.status === "awaiting",
      ) ?? null,
    );
  }

  recordWaitDelivery(input: {
    deliveryId: string;
    decision: "rejected" | "already_consumed";
  }): Promise<boolean> {
    if (this.waitDeliveries.some(({ deliveryId }) => deliveryId === input.deliveryId)) {
      return Promise.resolve(false);
    }
    this.waitDeliveries.push({ deliveryId: input.deliveryId, decision: input.decision });
    return Promise.resolve(true);
  }

  consumeWait(input: Parameters<WorkflowRuntimeStore["consumeWait"]>[0]): Promise<boolean> {
    const wait = this.waits.get(input.waitId);
    if (
      wait?.status !== "awaiting" ||
      this.run.current_node !== input.expectedNode ||
      this.run.current_visit_sequence !== input.expectedVisitSequence ||
      this.run.status !== input.expectedStatus
    ) return Promise.resolve(false);
    wait.status = input.outcome === "canceled" ? "canceled" : "consumed";
    wait.consumed_delivery_id = input.deliveryId;
    this.run.previous_node = input.expectedNode;
    this.run.current_node = input.nextNode;
    this.run.current_visit_sequence += 1;
    this.run.last_transition_id = input.transitionId;
    this.run.status = input.nextStatus;
    this.waitDeliveries.push({
      deliveryId: input.deliveryId,
      decision: input.outcome === "canceled" ? "canceled" : "resumed",
    });
    return Promise.resolve(true);
  }

  compareAndSetNode(input: Parameters<WorkflowRuntimeStore["compareAndSetNode"]>[0]) {
    const existing = this.transitions.find(({ transition_id }) =>
      transition_id === input.transitionId);
    if (existing !== undefined) {
      const exact = existing.run_id === input.runId &&
        existing.from_node === input.expectedNode &&
        existing.to_node === input.nextNode &&
        existing.from_visit_sequence === input.expectedVisitSequence &&
        existing.to_visit_sequence === input.expectedVisitSequence + 1 &&
        existing.cause_type === input.causeType &&
        existing.cause_reference === input.causeReference &&
        existing.actor_id === input.actorId &&
        existing.actor_type === input.actorType &&
        existing.provider_operation_id === input.providerOperationId;
      if (!exact) throw new Error("workflow transition identity conflict");
      return Promise.resolve({ outcome: "replayed" as const, transition: existing });
    }
    if (this.staleTransitionAtNode === input.expectedNode) {
      this.staleTransitionAtNode = null;
      this.run.previous_node = input.expectedNode;
      this.run.current_node = input.nextNode;
      this.run.current_visit_sequence += 1;
      this.run.status = input.nextStatus;
      this.run.gate_origin_node = input.gateOriginNode;
      return Promise.resolve({ outcome: "stale" as const });
    }
    if (
      this.run.run_id !== input.runId ||
      this.run.current_node !== input.expectedNode ||
      this.run.current_visit_sequence !== input.expectedVisitSequence ||
      this.run.status !== input.expectedStatus
    ) {
      return Promise.resolve({ outcome: "stale" as const });
    }
    const transition: WorkflowTransitionRecord = {
      transition_id: input.transitionId,
      run_id: input.runId,
      from_node: input.expectedNode,
      to_node: input.nextNode,
      from_visit_sequence: input.expectedVisitSequence,
      to_visit_sequence: input.expectedVisitSequence + 1,
      cause_type: input.causeType,
      cause_reference: input.causeReference,
      actor_id: input.actorId,
      actor_type: input.actorType,
      provider_operation_id: input.providerOperationId,
      occurred_at: input.now,
    };
    this.transitions.push(transition);
    this.run.previous_node = input.expectedNode;
    this.run.current_node = input.nextNode;
    this.run.current_visit_sequence += 1;
    this.run.last_transition_id = input.transitionId;
    this.run.status = input.nextStatus;
    this.run.gate_origin_node = input.gateOriginNode;
    if (input.wait !== undefined) {
      this.waits.set(input.wait.waitId, {
        wait_id: input.wait.waitId,
        run_id: input.runId,
        node_id: input.nextNode,
        visit_sequence: input.expectedVisitSequence + 1,
        status: "awaiting",
        resume_event_type: input.wait.resumeEventType,
        resume_event_json: input.wait.resumeEventJson,
        resume_event_digest: input.wait.resumeEventDigest,
        cancel_event_type: input.wait.cancelEventType,
        cancel_event_json: input.wait.cancelEventJson,
        cancel_event_digest: input.wait.cancelEventDigest,
        cause_reference: input.causeReference,
        created_at: input.now,
        consumed_delivery_id: null,
        consumed_at: null,
      });
    }
    return Promise.resolve({ outcome: "committed" as const, transition });
  }
}

const inboxEvent = (
  deliveryId: string,
  actorType: string,
  toStateName = "In Progress",
): WorkflowInboxRecord => ({
  delivery_id: deliveryId,
  run_id: "workflow:project-1:issue-1:run:1",
  correlation_id: "workflow:project-1:issue-1",
  event_kind: "issue-state-change",
  actor_id: `${actorType}-1`,
  actor_type: actorType,
  provider_time: NOW,
  from_state_id: "human-state",
  from_state_name: "Human Approval",
  to_state_id: "next-state",
  to_state_name: toStateName,
  payload_digest: `digest-${deliveryId}`,
  state: "sent",
});

class FakeStep implements WorkflowStepLike {
  readonly names: string[] = [];
  private readonly deliveries: string[];

  constructor(deliveries: string[]) {
    this.deliveries = deliveries;
  }

  async do<T>(name: string, callback: () => Promise<T>): Promise<T> {
    this.names.push(name);
    return callback();
  }

  async waitForEvent<T>(): Promise<{ payload: Readonly<T> }> {
    const deliveryId = this.deliveries.shift();
    if (deliveryId === undefined) throw new Error("no event available");
    return { payload: { deliveryId } as T };
  }
}

class InterruptingStep extends FakeStep {
  interrupted = false;

  async waitForEvent<T>(): Promise<{ payload: Readonly<T> }> {
    if (!this.interrupted) {
      this.interrupted = true;
      throw new Error("durable wait checkpoint");
    }
    return super.waitForEvent<T>();
  }
}

class RacingRuntimeStore extends RuntimeStore {
  raced = false;

  consumeWait(input: Parameters<WorkflowRuntimeStore["consumeWait"]>[0]): Promise<boolean> {
    if (this.raced) return super.consumeWait(input);
    this.raced = true;
    const wait = this.waits.get(input.waitId);
    if (wait === undefined) throw new Error("race wait is missing");
    wait.status = input.outcome === "canceled" ? "canceled" : "consumed";
    wait.consumed_delivery_id = input.deliveryId;
    this.run.previous_node = input.expectedNode;
    this.run.current_node = input.nextNode;
    this.run.current_visit_sequence += 1;
    this.run.last_transition_id = input.transitionId;
    this.run.status = input.nextStatus;
    return Promise.resolve(false);
  }
}

class NodeServices implements WorkflowNodeServices {
  readonly agentOutcomes: string[];
  gateEntries = 0;
  repairs = 0;
  failRepair = false;

  constructor(agentOutcomes = ["completed", "approved"]) {
    this.agentOutcomes = agentOutcomes;
  }

  executeAgent() {
    const outcome = this.agentOutcomes.shift();
    if (outcome === undefined) throw new Error("no agent outcome");
    return Promise.resolve({
      state: "completed" as const,
      attemptId: `attempt-${outcome}`,
      sandboxId: `sandbox-${outcome}`,
      manifestId: `manifest-${outcome}`,
      outcome: {
        kind: "agent" as const,
        outcome,
        providerReceiptsPresent: true,
        providerReceiptsComplete: true,
      },
    });
  }

  executeSystemAction(): ReturnType<WorkflowNodeServices["executeSystemAction"]> {
    return Promise.resolve({
      kind: "system_action" as const,
      outcome: "completed" as const,
      providerReceiptsComplete: true,
    });
  }

  ensureHumanGate() {
    this.gateEntries += 1;
    return Promise.resolve({ providerOperationId: "gate-operation", state: "confirmed" as const });
  }

  restoreHumanGate() {
    this.repairs += 1;
    if (this.failRepair) return Promise.reject(new Error("repair not confirmed"));
    return Promise.resolve({ providerOperationId: "repair-operation", state: "confirmed" as const });
  }

  observeHumanGateDelivery() {
    return Promise.resolve({ providerOperationId: "gate-operation", state: "confirmed" as const });
  }
}

class WaitServices extends NodeServices {
  readonly systemOutcomes: Array<"completed" | "failed">;

  constructor(outcomes: Array<"completed" | "failed">) {
    super();
    this.systemOutcomes = outcomes;
  }

  executeSystemAction() {
    const outcome = this.systemOutcomes.shift();
    if (outcome === undefined) throw new Error("no system outcome");
    return Promise.resolve({
      kind: "system_action" as const,
      outcome,
      providerReceiptsComplete: outcome === "completed",
    });
  }
}

class MissingReceiptServices extends NodeServices {
  override executeAgent() {
    return Promise.resolve({
      state: "completed" as const,
      attemptId: "attempt-review",
      sandboxId: "sandbox-review",
      manifestId: "manifest-review",
      outcome: {
        kind: "agent" as const,
        outcome: "approved",
        providerReceiptsPresent: false,
        providerReceiptsComplete: false,
      },
    });
  }
}

const orchestrator = (store: RuntimeStore, services: NodeServices) =>
  new WorkflowOrchestrator(store, definition, services, {
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
    now: () => new Date(NOW),
  });

test("Workflow reloads D1 authority and continues through agents, a gate, and system action", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));
  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-human"]),
  );

  assert.deepEqual(result, { outcome: "succeeded", runId: store.run.run_id });
  assert.deepEqual(store.transitions.map(({ from_node, to_node }) => [from_node, to_node]), [
    ["implement", "review"],
    ["review", "approval"],
    ["approval", "verify"],
    ["verify", "done"],
  ]);
  assert.equal(store.transitions[2].actor_type, "user");
  assert.equal(store.reads >= 5, true);
  assert.equal(services.gateEntries, 1);
});

test("simple graph revises on a fresh visit then reaches trusted merge and verification", async () => {
  const store = new RuntimeStore(makeRun(simpleDefinition));
  const services = new NodeServices(["completed", "completed"]);
  store.inbox.set("delivery-revision", inboxEvent("delivery-revision", "user", "In Progress"));
  store.inbox.set("delivery-merge", inboxEvent("delivery-merge", "user", "Merging"));
  const result = await new WorkflowOrchestrator(store, simpleDefinition, services, {
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
    now: () => new Date(NOW),
  }).run(store.run.run_id, new FakeStep(["delivery-revision", "delivery-merge"]));
  assert.deepEqual(result, { outcome: "succeeded", runId: store.run.run_id });
  assert.deepEqual(store.transitions.map(({ from_node, to_node }) => [from_node, to_node]), [
    ["openspec_planning", "planning_review"],
    ["planning_review", "openspec_planning"],
    ["openspec_planning", "planning_review"],
    ["planning_review", "merge"],
    ["merge", "verify"],
    ["verify", "done"],
  ]);
  assert.deepEqual(
    store.transitions.filter(({ from_node }) => from_node === "openspec_planning")
      .map(({ from_visit_sequence }) => from_visit_sequence),
    [1, 3],
  );
  assert.equal(services.gateEntries, 2);
});

test("simple graph cancellation reaches no merge action", async () => {
  const store = new RuntimeStore(makeRun(simpleDefinition));
  const services = new NodeServices(["completed"]);
  store.inbox.set("delivery-canceled", inboxEvent("delivery-canceled", "user", "Canceled"));
  const result = await new WorkflowOrchestrator(store, simpleDefinition, services, {
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
    now: () => new Date(NOW),
  }).run(store.run.run_id, new FakeStep(["delivery-canceled"]));
  assert.equal(result.outcome, "canceled");
  assert.equal(store.transitions.some(({ to_node }) => to_node === "merge"), false);
});

test("version 4 routes a successful agent result with missing receipts to its failure node", async () => {
  const store = new RuntimeStore(makeRun(agentInvariantFailureDefinition));
  const workflow = new WorkflowOrchestrator(
    store,
    agentInvariantFailureDefinition,
    new MissingReceiptServices(),
    {
      humanGateStateId: "human-state",
      approvalStateNames: ["In Progress"],
      rejectionStateNames: ["Canceled"],
      now: () => new Date(NOW),
    },
  );

  await assert.rejects(
    workflow.run(store.run.run_id, new FakeStep([])),
    (error: unknown) => error instanceof WorkflowFailureError &&
      error.safeCause === "agent_execution_failed",
  );
  assert.equal(store.run.current_node, "failed");
  assert.equal(store.run.status, "failed");
});

test("unauthorized gate departure is repaired before a later human decision", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  store.inbox.set("delivery-bot", inboxEvent("delivery-bot", "oauthclient"));
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));
  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-bot", "delivery-human"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.equal(services.repairs, 1);
  assert.equal(store.inbox.get("delivery-bot")?.state, "processed");
});

test("a failed provider gate repair blocks gate processing", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  services.failRepair = true;
  store.inbox.set("delivery-bot", inboxEvent("delivery-bot", "integration"));

  await assert.rejects(
    orchestrator(store, services).run(store.run.run_id, new FakeStep(["delivery-bot"])),
    /repair not confirmed/,
  );
  assert.equal(store.run.current_node, "approval");
  assert.equal(store.run.status, "awaiting_human");
  assert.equal(store.inbox.get("delivery-bot")?.state, "claimed");
});

test("duplicate buffered delivery cannot repeat a human transition", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  const duplicate = inboxEvent("delivery-duplicate", "user");
  duplicate.state = "processed";
  store.inbox.set(duplicate.delivery_id, duplicate);
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));

  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-duplicate", "delivery-human"]),
  );
  assert.equal(result.outcome, "succeeded");
  assert.equal(store.transitions.filter(({ from_node }) => from_node === "approval").length, 1);
});

test("a loop records a distinct traversal for the same successful edge", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices([
    "completed",
    "changes_requested",
    "completed",
    "approved",
  ]);
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));

  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-human"]),
  );

  assert.equal(result.outcome, "succeeded");
  const repeated = store.transitions.filter(({ from_node, to_node }) =>
    from_node === "implement" && to_node === "review");
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(({ from_visit_sequence }) => from_visit_sequence), [1, 3]);
  assert.notEqual(repeated[0].transition_id, repeated[1].transition_id);
  assert.equal(store.run.current_visit_sequence, 7);
});

test("a stale transition reloads current authority and resumes the outer loop", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  store.staleTransitionAtNode = "implement";
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));

  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-human"]),
  );

  assert.deepEqual(result, { outcome: "succeeded", runId: store.run.run_id });
  assert.equal(store.reads >= 6, true);
  assert.deepEqual(store.transitions.map(({ from_node, to_node }) => [from_node, to_node]), [
    ["review", "approval"],
    ["approval", "verify"],
    ["verify", "done"],
  ]);
});

test("a human event that loses transition authority is classified as duplicate", async () => {
  const store = new RuntimeStore();
  const services = new NodeServices();
  store.staleTransitionAtNode = "approval";
  store.inbox.set("delivery-human", inboxEvent("delivery-human", "user"));

  const result = await orchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-human"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.equal(store.inbox.get("delivery-human")?.state, "duplicate");
  assert.equal(store.run.current_node, "done");
});

test("one source visit commits once, replays exactly, and rejects stale or conflicting facts", async () => {
  const store = new RuntimeStore();
  const input = {
    runId: store.run.run_id,
    expectedNode: "implement",
    expectedVisitSequence: 1,
    expectedStatus: "active" as const,
    nextNode: "review",
    nextStatus: "active" as const,
    gateOriginNode: null,
    transitionId: `${store.run.run_id}:visit:1:transition`,
    causeType: "agent",
    causeReference: "attempt-completed",
    actorId: null,
    actorType: "agent",
    providerOperationId: null,
    now: NOW,
  };

  const [winner, replay] = await Promise.all([
    store.compareAndSetNode(input),
    store.compareAndSetNode(input),
  ]);
  assert.deepEqual([winner.outcome, replay.outcome], ["committed", "replayed"]);
  assert.equal(store.transitions.length, 1);

  const stale = await store.compareAndSetNode({
    ...input,
    transitionId: `${store.run.run_id}:visit:1:other-transition`,
  });
  assert.equal(stale.outcome, "stale");
  assert.equal(store.transitions.length, 1);

  await assert.rejects(
    async () => store.compareAndSetNode({ ...input, nextNode: "approval" }),
    /identity conflict/,
  );
  assert.equal(store.run.current_node, "review");
  assert.equal(store.transitions.length, 1);
});

const waitInboxEvent = (deliveryId: string, toStateName: string, actorType = "user") => ({
  ...inboxEvent(deliveryId, actorType, toStateName),
  event_kind: "Issue.update",
  from_state_id: "other-state",
  from_state_name: "Other",
});

const lifecycleOrchestrator = (
  store: RuntimeStore,
  services: WorkflowNodeServices,
  selectedDefinition = resumableDefinition,
) => new WorkflowOrchestrator(store, selectedDefinition, services, {
  humanGateStateId: "human-state",
  approvalStateNames: ["In Progress"],
  rejectionStateNames: ["Canceled"],
  now: () => new Date(NOW),
});

test("a missing exact action receipt waits and an authorized event resumes the same run", async () => {
  const store = new RuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed", "completed"]);
  store.inbox.set("delivery-resume", waitInboxEvent("delivery-resume", "In Progress"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-resume"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.equal(store.run.workflow_instance_id, "wf-1");
  assert.equal(store.waits.size, 1);
  assert.equal([...store.waits.values()][0].status, "consumed");
  assert.deepEqual(store.waitDeliveries, [
    { deliveryId: "delivery-resume", decision: "resumed" },
  ]);
});

test("an interrupted wait entry reloads the same persisted wait before resuming", async () => {
  const store = new RuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed", "completed"]);
  store.inbox.set("delivery-resume", waitInboxEvent("delivery-resume", "In Progress"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new InterruptingStep(["delivery-resume"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.equal(store.waits.size, 1);
});

test("an authorized cancellation ends the same waiting run without retrying the action", async () => {
  const store = new RuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed"]);
  store.inbox.set("delivery-cancel", waitInboxEvent("delivery-cancel", "Canceled"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-cancel"]),
  );

  assert.equal(result.outcome, "canceled");
  assert.equal(store.run.status, "canceled");
  assert.equal([...store.waits.values()][0].status, "canceled");
  assert.equal(services.systemOutcomes.length, 0);
});

test("unexpected and unauthorized wait events are audited without changing the wait", async () => {
  const store = new RuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed", "completed"]);
  store.inbox.set("delivery-bot", waitInboxEvent("delivery-bot", "In Progress", "oauthclient"));
  store.inbox.set("delivery-unexpected", waitInboxEvent("delivery-unexpected", "Human Review"));
  store.inbox.set("delivery-resume", waitInboxEvent("delivery-resume", "In Progress"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-bot", "delivery-unexpected", "delivery-resume"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.deepEqual(store.waitDeliveries.map(({ decision }) => decision), [
    "rejected",
    "rejected",
    "resumed",
  ]);
});

test("a duplicate buffered wait delivery cannot consume the wait twice", async () => {
  const store = new RuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed", "completed"]);
  const duplicate = waitInboxEvent("delivery-duplicate", "In Progress");
  duplicate.state = "processed";
  store.inbox.set(duplicate.delivery_id, duplicate);
  store.inbox.set("delivery-resume", waitInboxEvent("delivery-resume", "In Progress"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-duplicate", "delivery-resume"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.equal(store.waitDeliveries.filter(({ decision }) => decision === "resumed").length, 1);
});

test("the losing wait consumer observes the winner and cannot repeat the effect", async () => {
  const store = new RacingRuntimeStore(makeRun(resumableDefinition));
  const services = new WaitServices(["failed", "completed"]);
  store.inbox.set("delivery-race", waitInboxEvent("delivery-race", "In Progress"));

  const result = await lifecycleOrchestrator(store, services).run(
    store.run.run_id,
    new FakeStep(["delivery-race"]),
  );

  assert.equal(result.outcome, "succeeded");
  assert.deepEqual(store.waitDeliveries, [
    { deliveryId: "delivery-race", decision: "already_consumed" },
  ]);
});

test("a typed failure commits DEOS failed before surfacing an executor error", async () => {
  const store = new RuntimeStore(makeRun(failureDefinition));
  const services = new WaitServices(["failed"]);

  await assert.rejects(
    lifecycleOrchestrator(store, services, failureDefinition).run(store.run.run_id, new FakeStep([])),
    (error: unknown) =>
      error instanceof WorkflowFailureError && error.safeCause === "verification_invariant_failed",
  );
  assert.equal(store.run.current_node, "failed");
  assert.equal(store.run.status, "failed");
});
