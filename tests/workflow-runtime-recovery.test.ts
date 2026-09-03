import assert from "node:assert/strict";
import test from "node:test";

import {
  WorkflowRuntimeRecoveryController,
  type WorkflowRuntimeRecoveryRecord,
} from "../src/workflow-runtime-recovery.ts";
import type {
  WorkflowBinding,
  WorkflowInstanceHandle,
  WorkflowStartParameters,
} from "../src/queue-consumer-core.ts";

const NOW = new Date("2026-09-03T07:30:00.000Z");

class FakeStore {
  prepares = 0;
  record: WorkflowRuntimeRecoveryRecord = {
    recovery_id: "workflow-runtime-recovery:wf-v1-source",
    run_id: "run-1",
    retry_node: "design_self_review",
    from_visit_sequence: 20,
    to_visit_sequence: 21,
    transition_id: "transition:workflow-runtime-recovery:wf-v1-source",
    state: "pending",
    workflow_status: null,
    safe_error_category: null,
    requested_by: "operator@example.com",
    source_workflow_instance_id: "wf-v1-source",
    target_workflow_instance_id: "wf-v1-target",
    source_delivery_id: "delivery-1",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    established_at: null,
  };

  async prepare(): Promise<WorkflowRuntimeRecoveryRecord> {
    this.prepares += 1;
    return this.record;
  }

  async observe(input: {
    state: WorkflowRuntimeRecoveryRecord["state"];
    workflowStatus: string | null;
    safeErrorCategory: string | null;
    now: string;
  }): Promise<WorkflowRuntimeRecoveryRecord> {
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
  id: string;
  current: string;

  constructor(id: string, current: string) {
    this.id = id;
    this.current = current;
  }
  async sendEvent(): Promise<void> {}
  async status(): Promise<{ status: string }> {
    return { status: this.current };
  }
}

class FakeWorkflow implements WorkflowBinding {
  readonly instances = new Map<string, FakeInstance>([
    ["wf-v1-source", new FakeInstance("wf-v1-source", "errored")],
  ]);
  readonly creates: Array<{ id: string; params: WorkflowStartParameters }> = [];

  async get(id: string): Promise<FakeInstance> {
    const instance = this.instances.get(id);
    if (instance === undefined) throw new Error("missing");
    return instance;
  }

  async createBatch(
    batch: Array<{ id: string; params: WorkflowStartParameters }>,
  ): Promise<WorkflowInstanceHandle[]> {
    this.creates.push(...batch);
    return batch.map(({ id }) => {
      const instance = new FakeInstance(id, "running");
      this.instances.set(id, instance);
      return instance;
    });
  }
}

const request = (secret = "operator-secret"): Request =>
  new Request("https://example.test/workflow-runtime-recoveries", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 1,
      runId: "run-1",
      sourceWorkflowInstanceId: "wf-v1-source",
      retryNode: "design_self_review",
      visitSequence: 20,
      requestedBy: "operator@example.com",
    }),
  });

test("an authenticated recovery replaces an errored pre-attempt workflow instance", async () => {
  const store = new FakeStore();
  const workflows = new FakeWorkflow();
  const controller = new WorkflowRuntimeRecoveryController(
    store,
    workflows,
    "operator-secret",
    () => NOW,
  );

  const response = await controller.handle(request());

  assert.equal(response.status, 202);
  assert.deepEqual(workflows.creates, [{
    id: "wf-v1-target",
    params: { runId: "run-1", sourceDeliveryId: "delivery-1" },
  }]);
  assert.equal(store.record.state, "established");
  assert.equal(store.record.workflow_status, "running");
});

test("recovery rejects unauthorized calls and a source that is not errored", async () => {
  const store = new FakeStore();
  const workflows = new FakeWorkflow();
  const controller = new WorkflowRuntimeRecoveryController(
    store,
    workflows,
    "operator-secret",
    () => NOW,
  );

  assert.equal((await controller.handle(request("wrong"))).status, 401);
  workflows.instances.get("wf-v1-source")!.current = "running";
  const response = await controller.handle(request());
  assert.equal(response.status, 409);
  assert.equal(store.prepares, 0);
});

test("an established recovery is idempotent", async () => {
  const store = new FakeStore();
  store.record.state = "established";
  const workflows = new FakeWorkflow();
  const controller = new WorkflowRuntimeRecoveryController(
    store,
    workflows,
    "operator-secret",
    () => NOW,
  );

  const response = await controller.handle(request());
  assert.equal(response.status, 200);
  assert.equal(workflows.creates.length, 0);
});
