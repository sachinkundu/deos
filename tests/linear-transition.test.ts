import assert from "node:assert/strict";
import test from "node:test";

import {
  LinearTransitionController,
  type LinearOperationStore,
  type ProviderOperationRecord,
  type ProviderOperationState,
} from "../src/linear-transition.ts";
import type { OrchestrationRunRecord, WorkflowInboxRecord } from "../src/orchestration-store.ts";
import type { HumanGateWorkflowNode } from "../src/workflow-definition.ts";

const NOW = "2026-08-16T07:00:00.000Z";
const run = {
  run_id: "workflow:project-1:issue-1:run:1",
  issue_id: "issue-1",
} as OrchestrationRunRecord;
const node: HumanGateWorkflowNode = {
  id: "approval",
  type: "human_gate",
  linearState: "Human Approval",
  edges: { approved: "done", rejected: "work" },
};

class OperationStore implements LinearOperationStore {
  readonly operations = new Map<string, ProviderOperationRecord>();

  async begin(input: {
    operationId: string;
    runId: string;
    action: "enter_human_gate" | "restore_human_gate";
    targetStateId: string;
    requestDigest: string;
    observedPreState: string;
    providerUpdatedAt: string;
    latestDeliveryId: string | null;
    now: string;
  }) {
    const existing = this.operations.get(input.operationId);
    if (existing !== undefined) return { operation: existing, created: false };
    const operation: ProviderOperationRecord = {
      operation_id: input.operationId,
      run_id: input.runId,
      attempt_id: null,
      capability: "linear.transition",
      action: input.action,
      sanitized_target: input.targetStateId,
      request_digest: input.requestDigest,
      state: "pending",
      provider_resource_id: null,
      observed_pre_state: input.observedPreState,
      provider_updated_at: input.providerUpdatedAt,
      latest_delivery_id: input.latestDeliveryId,
      safe_error_category: null,
      diagnostic_id: null,
      started_at: input.now,
      updated_at: input.now,
      completed_at: null,
    };
    this.operations.set(input.operationId, operation);
    return { operation, created: true };
  }

  find(operationId: string) {
    return Promise.resolve(this.operations.get(operationId) ?? null);
  }

  setState(
    operationId: string,
    expected: ProviderOperationState,
    next: ProviderOperationState,
    now: string,
    safeErrorCategory: string | null = null,
    latestDeliveryId: string | null = null,
  ) {
    const operation = this.operations.get(operationId);
    if (operation?.state !== expected) return Promise.resolve(false);
    operation.state = next;
    operation.updated_at = now;
    operation.safe_error_category = safeErrorCategory;
    operation.latest_delivery_id = latestDeliveryId ?? operation.latest_delivery_id;
    operation.completed_at = next === "pending" ? null : now;
    return Promise.resolve(true);
  }
}

const delivery = (overrides: Partial<WorkflowInboxRecord> = {}): WorkflowInboxRecord => ({
  delivery_id: "delivery-app",
  run_id: run.run_id,
  correlation_id: "workflow:project-1:issue-1",
  event_kind: "issue-state-change",
  actor_id: "app-actor-1",
  actor_type: "user",
  provider_time: "2026-08-16T07:00:01.000Z",
  from_state_id: "in-progress-state",
  from_state_name: "In Progress",
  to_state_id: "human-state",
  to_state_name: "Human Approval",
  payload_digest: "digest",
  state: "claimed",
  ...overrides,
});

const config = {
  apiUrl: "https://api.linear.app/graphql",
  accessToken: "test-token",
  appActorId: "app-actor-1",
  humanGateStateId: "human-state",
};

const successfulFetch = (calls: string[]): typeof fetch => async (_input, init) => {
  const request = JSON.parse(String(init?.body)) as { query: string };
  calls.push(request.query.includes("query DeosIssueState") ? "read" : "mutate");
  if (request.query.includes("query DeosIssueState")) {
    return Response.json({
      data: { issue: { state: { id: "in-progress-state" }, updatedAt: NOW } },
    });
  }
  return Response.json({ data: { issueUpdate: { success: true } } });
};

test("Linear transition is written once and confirmed only by ordered app-actor delivery", async () => {
  const store = new OperationStore();
  const calls: string[] = [];
  const controller = new LinearTransitionController(store, config, {
    fetch: successfulFetch(calls), now: () => new Date(NOW),
  });
  const started = await controller.ensureHumanGate(run, node);
  assert.equal(started.state, "awaiting_delivery");
  assert.deepEqual(calls, ["read", "mutate"]);

  const duplicate = await controller.ensureHumanGate(run, node);
  assert.equal(duplicate.providerOperationId, started.providerOperationId);
  assert.deepEqual(calls, ["read", "mutate"]);

  const confirmed = await controller.observeHumanGateDelivery(started, delivery());
  assert.equal(confirmed.state, "confirmed");
  assert.equal(store.operations.get(started.providerOperationId)?.latest_delivery_id, "delivery-app");

  const replayed = await controller.ensureHumanGate(run, node);
  assert.equal(replayed.state, "confirmed");
  assert.equal(replayed.providerOperationId, started.providerOperationId);
  assert.deepEqual(calls, ["read", "mutate"]);
});

test("current provider state alone reconciles an already-satisfied gate without mutation", async () => {
  const store = new OperationStore();
  let calls = 0;
  const controller = new LinearTransitionController(store, config, {
    now: () => new Date(NOW),
    fetch: async () => {
      calls += 1;
      return Response.json({
        data: { issue: { state: { id: "human-state" }, updatedAt: NOW } },
      });
    },
  });
  const result = await controller.ensureHumanGate(run, node);
  assert.equal(result.state, "confirmed");
  assert.equal(calls, 1);
  assert.equal(store.operations.get(result.providerOperationId)?.state, "reconciled");
});

test("a later human delivery makes an ambiguous pending transition manual", async () => {
  const store = new OperationStore();
  const controller = new LinearTransitionController(store, config, {
    fetch: successfulFetch([]), now: () => new Date(NOW),
  });
  const started = await controller.ensureHumanGate(run, node);
  const result = await controller.observeHumanGateDelivery(started, delivery({
    delivery_id: "delivery-human",
    actor_id: "user-1",
    actor_type: "user",
    to_state_id: "canceled-state",
    to_state_name: "Canceled",
  }));
  assert.equal(result.state, "manual_reconciliation_required");
  assert.equal(store.operations.get(started.providerOperationId)?.safe_error_category, "newer_human_intent");
});

test("an ambiguous mutation response fails closed and is never repeated", async () => {
  const store = new OperationStore();
  let calls = 0;
  const controller = new LinearTransitionController(store, config, {
    now: () => new Date(NOW),
    fetch: async (_input, init) => {
      calls += 1;
      const request = JSON.parse(String(init?.body)) as { query: string };
      if (request.query.includes("query DeosIssueState")) {
        return Response.json({ data: { issue: { state: { id: "in-progress-state" }, updatedAt: NOW } } });
      }
      throw new Error("response lost");
    },
  });
  const first = await controller.ensureHumanGate(run, node);
  const retry = await controller.ensureHumanGate(run, node);
  assert.equal(first.state, "manual_reconciliation_required");
  assert.equal(retry.state, "manual_reconciliation_required");
  assert.equal(calls, 2);
});

test("repair uses unauthorized delivery pre-state and a stable per-delivery identity", async () => {
  const store = new OperationStore();
  const calls: string[] = [];
  const controller = new LinearTransitionController(store, config, {
    fetch: successfulFetch(calls), now: () => new Date(NOW),
  });
  const unauthorized = delivery({
    delivery_id: "delivery-bot",
    actor_id: "integration-1",
    actor_type: "integration",
    from_state_id: "human-state",
    to_state_id: "in-progress-state",
  });
  const first = await controller.restoreHumanGate(run, node, unauthorized);
  const retry = await controller.restoreHumanGate(run, node, unauthorized);
  assert.equal(first.providerOperationId, retry.providerOperationId);
  assert.deepEqual(calls, ["mutate"]);
  assert.equal(store.operations.get(first.providerOperationId)?.observed_pre_state, "in-progress-state");
});
