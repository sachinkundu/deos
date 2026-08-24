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
  current_visit_sequence: 1,
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
    action: "enter_human_gate" | "restore_human_gate" | "delegate_and_start";
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
  startStateId: "todo-state",
  workStateId: "in-progress-state",
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

test("a later visit to the same gate gets a new provider operation", async () => {
  const store = new OperationStore();
  const calls: string[] = [];
  const controller = new LinearTransitionController(store, config, {
    fetch: successfulFetch(calls), now: () => new Date(NOW),
  });

  const first = await controller.ensureHumanGate(run, node);
  const firstRetry = await controller.ensureHumanGate(run, node);
  const laterRun = { ...run, current_visit_sequence: 4 };
  const later = await controller.ensureHumanGate(laterRun, node);
  const laterRetry = await controller.ensureHumanGate(laterRun, node);

  assert.equal(first.providerOperationId, firstRetry.providerOperationId);
  assert.equal(later.providerOperationId, laterRetry.providerOperationId);
  assert.notEqual(first.providerOperationId, later.providerOperationId);
  assert.deepEqual(calls, ["read", "mutate", "read", "mutate"]);
});

test("work start preserves the assignee, delegates to the app, and confirms In Progress", async () => {
  const store = new OperationStore();
  const calls: Array<{ kind: string; variables: Record<string, string> }> = [];
  let started = false;
  const controller = new LinearTransitionController(store, config, {
    now: () => new Date(NOW),
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: Record<string, string>;
      };
      if (request.query.includes("mutation DeosDelegateAndStart")) {
        calls.push({ kind: "mutate", variables: request.variables });
        started = true;
        return Response.json({ data: { issueUpdate: { success: true } } });
      }
      calls.push({ kind: "read", variables: request.variables });
      return Response.json({ data: { issue: {
        state: { id: started ? "in-progress-state" : "todo-state" },
        delegate: started ? { id: "app-actor-1" } : null,
        assignee: { id: "human-1" },
        updatedAt: NOW,
      } } });
    },
  });

  const outcome = await controller.ensureWorkStarted(run, "claim_issue");

  assert.deepEqual(outcome, {
    kind: "system_action",
    outcome: "completed",
    providerReceiptsComplete: true,
  });
  assert.deepEqual(calls.map((call) => call.kind), ["read", "mutate", "read"]);
  assert.deepEqual(calls[1].variables, {
    id: "issue-1",
    stateId: "in-progress-state",
    delegateId: "app-actor-1",
  });
  assert.equal(store.operations.values().next().value?.state, "succeeded");
});

test("work start replay reconciles matching provider state without another mutation", async () => {
  const store = new OperationStore();
  let calls = 0;
  const controller = new LinearTransitionController(store, config, {
    now: () => new Date(NOW),
    fetch: async () => {
      calls += 1;
      return Response.json({ data: { issue: {
        state: { id: "in-progress-state" },
        delegate: { id: "app-actor-1" },
        assignee: { id: "human-1" },
        updatedAt: NOW,
      } } });
    },
  });

  const first = await controller.ensureWorkStarted(run, "claim_issue");
  const replay = await controller.ensureWorkStarted(run, "claim_issue");

  assert.equal(first.outcome, "completed");
  assert.equal(replay.outcome, "completed");
  assert.equal(calls, 2);
  assert.equal(store.operations.values().next().value?.state, "reconciled");
});

test("ambiguous work start reconciles through provider read-back", async () => {
  const store = new OperationStore();
  let reads = 0;
  const controller = new LinearTransitionController(store, config, {
    now: () => new Date(NOW),
    fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { query: string };
      if (request.query.includes("mutation DeosDelegateAndStart")) {
        throw new Error("response lost");
      }
      reads += 1;
      const complete = reads > 1;
      return Response.json({ data: { issue: {
        state: { id: complete ? "in-progress-state" : "todo-state" },
        delegate: complete ? { id: "app-actor-1" } : null,
        assignee: null,
        updatedAt: NOW,
      } } });
    },
  });

  const outcome = await controller.ensureWorkStarted(run, "claim_issue");

  assert.equal(outcome.outcome, "completed");
  assert.equal(store.operations.values().next().value?.state, "reconciled");
});

test("conflicting human state or delegate stops work before mutation", async () => {
  for (const issue of [
    { state: "human-review-state", delegate: null },
    { state: "todo-state", delegate: "other-agent" },
  ]) {
    const store = new OperationStore();
    let calls = 0;
    const controller = new LinearTransitionController(store, config, {
      now: () => new Date(NOW),
      fetch: async () => {
        calls += 1;
        return Response.json({ data: { issue: {
          state: { id: issue.state },
          delegate: issue.delegate === null ? null : { id: issue.delegate },
          assignee: { id: "human-1" },
          updatedAt: NOW,
        } } });
      },
    });

    const outcome = await controller.ensureWorkStarted(run, "claim_issue");

    assert.equal(outcome.outcome, "failed");
    assert.equal(calls, 1);
    assert.equal(store.operations.values().next().value?.safe_error_category, "linear_claim_conflict");
  }
});
