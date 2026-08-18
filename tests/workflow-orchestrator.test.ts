import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrchestrationRunRecord,
  RunStatus,
  WorkflowTransitionRecord,
  WorkflowInboxRecord,
  WorkflowRuntimeStore,
} from "../src/orchestration-store.ts";
import type {
  WorkflowNodeServices,
  WorkflowStepLike,
} from "../src/workflow-orchestrator.ts";
import { WorkflowOrchestrator } from "../src/workflow-orchestrator.ts";
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

const makeRun = (): OrchestrationRunRecord => ({
  run_id: "workflow:project-1:issue-1:run:1",
  correlation_id: "workflow:project-1:issue-1",
  run_sequence: 1,
  project_id: "project-1",
  issue_id: "issue-1",
  definition_id: definition.name,
  definition_version: definition.version,
  definition_digest: definition.digest,
  workflow_instance_id: "wf-1",
  previous_node: null,
  current_node: definition.start,
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
  readonly run = makeRun();
  readonly inbox = new Map<string, WorkflowInboxRecord>();
  readonly transitions: Array<WorkflowTransitionRecord> = [];
  reads = 0;

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

  compareAndSetNode(input: {
    runId: string;
    expectedNode: string;
    expectedVisitSequence: number;
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
  }) {
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
    if (
      this.run.run_id !== input.runId ||
      this.run.current_node !== input.expectedNode ||
      this.run.current_visit_sequence !== input.expectedVisitSequence
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

  executeSystemAction() {
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

test("one source visit commits once, replays exactly, and rejects stale or conflicting facts", async () => {
  const store = new RuntimeStore();
  const input = {
    runId: store.run.run_id,
    expectedNode: "implement",
    expectedVisitSequence: 1,
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
