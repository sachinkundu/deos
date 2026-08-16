import assert from "node:assert/strict";
import test from "node:test";

import type {
  OrchestrationRunRecord,
  RunStatus,
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
  readonly transitions: Array<{ from: string; to: string; actorType: string | null }> = [];
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
    nextNode: string;
    nextStatus: RunStatus;
    gateOriginNode: string | null;
    actorType: string | null;
  }): Promise<boolean> {
    if (this.run.run_id !== input.runId || this.run.current_node !== input.expectedNode) {
      return Promise.resolve(false);
    }
    this.transitions.push({
      from: input.expectedNode,
      to: input.nextNode,
      actorType: input.actorType,
    });
    this.run.previous_node = input.expectedNode;
    this.run.current_node = input.nextNode;
    this.run.status = input.nextStatus;
    this.run.gate_origin_node = input.gateOriginNode;
    return Promise.resolve(true);
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
  readonly agentOutcomes = ["completed", "approved"];
  gateEntries = 0;
  repairs = 0;
  failRepair = false;

  executeAgent() {
    const outcome = this.agentOutcomes.shift();
    if (outcome === undefined) throw new Error("no agent outcome");
    return Promise.resolve({
      state: "completed" as const,
      attemptId: `attempt-${outcome}`,
      sandboxId: `sandbox-${outcome}`,
      manifestId: `manifest-${outcome}`,
      outcome: { kind: "agent" as const, outcome, providerReceiptsComplete: true },
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
  assert.deepEqual(store.transitions.map(({ from, to }) => [from, to]), [
    ["implement", "review"],
    ["review", "approval"],
    ["approval", "verify"],
    ["verify", "done"],
  ]);
  assert.equal(store.transitions[2].actorType, "user");
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
  assert.equal(store.transitions.filter(({ from }) => from === "approval").length, 1);
});
