import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentStageRetryController,
  type AgentStageRetryRecord,
  type AgentStageRetryStore,
} from "../src/stage-retry.ts";
import type {
  WorkflowBinding,
  WorkflowInstanceHandle,
  WorkflowStartParameters,
} from "../src/queue-consumer-core.ts";

const NOW = new Date("2026-08-27T19:00:00.000Z");

class FakeRetryStore implements AgentStageRetryStore {
  record: AgentStageRetryRecord = {
    retry_id: "stage-retry:attempt-1",
    run_id: "run-1",
    failed_attempt_id: "attempt-1",
    retry_node: "independent_discovery",
    from_visit_sequence: 9,
    to_visit_sequence: 10,
    transition_id: "transition:stage-retry:attempt-1",
    state: "pending",
    workflow_status: null,
    safe_error_category: null,
    requested_by: "operator@example.com",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    established_at: null,
    workflow_instance_id: "workflow-1",
  };
  prepares = 0;

  async prepare(): Promise<AgentStageRetryRecord> {
    this.prepares += 1;
    return this.record;
  }

  async observe(input: {
    state: AgentStageRetryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<AgentStageRetryRecord> {
    this.record = {
      ...this.record,
      state: input.state,
      workflow_status: input.workflowStatus,
      safe_error_category: input.safeErrorCategory,
      updated_at: input.now,
      established_at: input.state === "established" ? input.now : this.record.established_at,
    };
    return this.record;
  }
}

class FakeInstance implements WorkflowInstanceHandle {
  id = "workflow-1";
  restarts = 0;
  current = "errored";

  async sendEvent(): Promise<void> {}
  async restart(): Promise<void> {
    this.restarts += 1;
    this.current = "running";
  }
  async status(): Promise<{ status: string }> {
    return { status: this.current };
  }
}

class FakeWorkflow implements WorkflowBinding {
  readonly instance = new FakeInstance();
  async get(): Promise<FakeInstance> {
    return this.instance;
  }
  async createBatch(
    _batch: Array<{ id: string; params: WorkflowStartParameters }>,
  ): Promise<WorkflowInstanceHandle[]> {
    throw new Error("not used");
  }
}

const request = (secret = "operator-secret"): Request => new Request("https://example.test/stage-retries", {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    version: 1,
    runId: "run-1",
    failedAttemptId: "attempt-1",
    retryNode: "independent_discovery",
    requestedBy: "operator@example.com",
  }),
});

test("failed agent stage restart is authenticated, audited, and idempotent", async () => {
  const store = new FakeRetryStore();
  const workflows = new FakeWorkflow();
  const controller = new AgentStageRetryController(store, workflows, "operator-secret", () => NOW);

  const unauthorized = await controller.handle(request("wrong"));
  assert.equal(unauthorized.status, 401);
  assert.equal(store.prepares, 0);

  const started = await controller.handle(request());
  assert.equal(started.status, 202);
  assert.equal(workflows.instance.restarts, 1);
  assert.equal(store.record.state, "established");
  assert.equal(store.record.workflow_status, "running");

  const replay = await controller.handle(request());
  assert.equal(replay.status, 200);
  assert.equal(workflows.instance.restarts, 1);
});

test("an errored read-back stays pending and can be retried", async () => {
  const store = new FakeRetryStore();
  const workflows = new FakeWorkflow();
  workflows.instance.restart = async () => {
    workflows.instance.restarts += 1;
  };
  const controller = new AgentStageRetryController(store, workflows, "operator-secret", () => NOW);

  const response = await controller.handle(request());
  assert.equal(response.status, 502);
  assert.equal(store.record.state, "pending");
  assert.equal(store.record.safe_error_category, "workflow_restart_not_established");
});
