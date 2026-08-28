import assert from "node:assert/strict";
import test from "node:test";

import {
  AgentStageRetryController,
  planStageRetryDefinition,
  type AgentStageRetryRecord,
  type AgentStageRetryStore,
} from "../src/stage-retry.ts";
import type {
  WorkflowBinding,
  WorkflowInstanceHandle,
  WorkflowStartParameters,
} from "../src/queue-consumer-core.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";

const NOW = new Date("2026-08-27T19:00:00.000Z");
const TARGET_DEFINITION = {
  name: "simple-traceability",
  version: 12,
  digest: "digest-v12",
} as LoadedWorkflowDefinition;

class FakeRetryStore implements AgentStageRetryStore {
  record: AgentStageRetryRecord = {
    retry_id: "stage-retry:attempt-1",
    run_id: "run-1",
    failed_attempt_id: "attempt-1",
    retry_node: "independent_discovery",
    retry_kind: "same_definition",
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
    source_definition_id: "simple-traceability",
    source_definition_version: 12,
    source_definition_digest: TARGET_DEFINITION.digest,
    target_definition_id: "simple-traceability",
    target_definition_version: 12,
    target_definition_digest: TARGET_DEFINITION.digest,
    source_workflow_instance_id: "workflow-1",
    target_workflow_instance_id: "workflow-retry-1",
    source_delivery_id: "delivery-1",
    workflow_instance_id: "workflow-retry-1",
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
  current = "errored";

  async sendEvent(): Promise<void> {}
  async status(): Promise<{ status: string }> {
    return { status: this.current };
  }
}

class FakeWorkflow implements WorkflowBinding {
  readonly instances = new Map<string, FakeInstance>();
  readonly creates: Array<{ id: string; params: WorkflowStartParameters }> = [];
  createdStatus = "running";
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
      const instance = new FakeInstance();
      instance.id = id;
      instance.current = this.createdStatus;
      this.instances.set(id, instance);
      return instance;
    });
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

test("failed agent stage retry creates a replacement and is authenticated, audited, and idempotent", async () => {
  const store = new FakeRetryStore();
  const workflows = new FakeWorkflow();
  const controller = new AgentStageRetryController(
    store,
    workflows,
    "operator-secret",
    TARGET_DEFINITION,
    () => NOW,
    () => {},
  );

  const unauthorized = await controller.handle(request("wrong"));
  assert.equal(unauthorized.status, 401);
  assert.equal(store.prepares, 0);

  const started = await controller.handle(request());
  assert.equal(started.status, 202);
  assert.deepEqual(workflows.creates, [{
    id: "workflow-retry-1",
    params: { runId: "run-1", sourceDeliveryId: "delivery-1" },
  }]);
  assert.equal(store.record.state, "established");
  assert.equal(store.record.workflow_status, "running");

  const replay = await controller.handle(request());
  assert.equal(replay.status, 200);
  assert.equal(workflows.creates.length, 1);
});

test("an errored replacement read-back stays pending", async () => {
  const store = new FakeRetryStore();
  const workflows = new FakeWorkflow();
  workflows.createdStatus = "errored";
  const controller = new AgentStageRetryController(
    store,
    workflows,
    "operator-secret",
    TARGET_DEFINITION,
    () => NOW,
    () => {},
  );

  const response = await controller.handle(request());
  assert.equal(response.status, 502);
  assert.equal(store.record.state, "pending");
  assert.equal(store.record.safe_error_category, "workflow_replacement_not_established");
});

test("a same-definition retry plans a fresh deterministic Workflow instance", async () => {
  const source = {
    run_id: "run-1",
    definition_id: "simple-traceability",
    definition_version: 12,
    definition_digest: TARGET_DEFINITION.digest,
    workflow_instance_id: "workflow-v12-old",
    current_visit_sequence: 10,
    target_registered: 1,
    has_published_product: 1,
    has_validated_candidate: 1,
    has_published_entry: 0,
    has_failed_exit: 0,
  };
  const plan = await planStageRetryDefinition(
    source,
    "independent_discovery",
    TARGET_DEFINITION,
  );
  const replay = await planStageRetryDefinition(
    source,
    "independent_discovery",
    TARGET_DEFINITION,
  );
  const nextVisit = await planStageRetryDefinition(
    { ...source, current_visit_sequence: 12 },
    "independent_discovery",
    TARGET_DEFINITION,
  );

  assert.equal(plan.retryKind, "same_definition");
  assert.equal(plan.sourceWorkflowInstanceId, "workflow-v12-old");
  assert.notEqual(plan.targetWorkflowInstanceId, "workflow-v12-old");
  assert.equal(plan.targetWorkflowInstanceId, replay.targetWorkflowInstanceId);
  assert.notEqual(plan.targetWorkflowInstanceId, nextVisit.targetWorkflowInstanceId);
});

test("the exact published v11 independent-review tail plans a new v12 instance", async () => {
  const plan = await planStageRetryDefinition({
    run_id: "run-1",
    definition_id: "simple-traceability",
    definition_version: 11,
    definition_digest: "digest-v11",
    workflow_instance_id: "workflow-v11",
    current_visit_sequence: 8,
    target_registered: 1,
    has_published_product: 1,
    has_validated_candidate: 1,
    has_published_entry: 1,
    has_failed_exit: 1,
  }, "independent_discovery", TARGET_DEFINITION);

  assert.equal(plan.retryKind, "compatible_tail");
  assert.equal(plan.sourceDefinitionVersion, 11);
  assert.equal(plan.targetDefinitionVersion, 12);
  assert.equal(plan.sourceWorkflowInstanceId, "workflow-v11");
  assert.notEqual(plan.targetWorkflowInstanceId, "workflow-v11");
  assert.equal(
    plan.targetWorkflowInstanceId,
    (await planStageRetryDefinition({
      run_id: "run-1",
      definition_id: "simple-traceability",
      definition_version: 11,
      definition_digest: "digest-v11",
      workflow_instance_id: "workflow-v11",
      current_visit_sequence: 8,
      target_registered: 1,
      has_published_product: 1,
      has_validated_candidate: 1,
      has_published_entry: 1,
      has_failed_exit: 1,
    }, "independent_discovery", TARGET_DEFINITION)).targetWorkflowInstanceId,
  );
});

test("the v11 to v12 plan rejects a missing published prefix proof", async () => {
  await assert.rejects(planStageRetryDefinition({
    run_id: "run-1",
    definition_id: "simple-traceability",
    definition_version: 11,
    definition_digest: "digest-v11",
    workflow_instance_id: "workflow-v11",
    current_visit_sequence: 8,
    target_registered: 1,
    has_published_product: 1,
    has_validated_candidate: 1,
    has_published_entry: 0,
    has_failed_exit: 1,
  }, "independent_discovery", TARGET_DEFINITION), /stage_retry_not_eligible/);
});

test("a compatible tail creates only the new v12 Workflow instance", async () => {
  const store = new FakeRetryStore();
  store.record = {
    ...store.record,
    retry_kind: "compatible_tail",
    source_definition_version: 11,
    source_definition_digest: "digest-v11",
    source_workflow_instance_id: "workflow-v11",
    target_definition_version: 12,
    target_definition_digest: TARGET_DEFINITION.digest,
    target_workflow_instance_id: "workflow-v12",
    workflow_instance_id: "workflow-v12",
  };
  const instances = new Map<string, FakeInstance>();
  const gets: string[] = [];
  const creates: Array<{ id: string; params: WorkflowStartParameters }> = [];
  const workflows: WorkflowBinding = {
    async get(id) {
      gets.push(id);
      const instance = instances.get(id);
      if (instance === undefined) throw new Error("missing");
      return instance;
    },
    async createBatch(batch) {
      creates.push(...batch);
      return batch.map(({ id }) => {
        const instance = new FakeInstance();
        instance.id = id;
        instance.current = "running";
        instances.set(id, instance);
        return instance;
      });
    },
  };
  const controller = new AgentStageRetryController(
    store,
    workflows,
    "operator-secret",
    TARGET_DEFINITION,
    () => NOW,
    () => {},
  );

  const response = await controller.handle(request());
  assert.equal(response.status, 202);
  assert.deepEqual(creates, [{
    id: "workflow-v12",
    params: { runId: "run-1", sourceDeliveryId: "delivery-1" },
  }]);
  assert.ok(gets.every((id) => id === "workflow-v12"));
  assert.equal(store.record.state, "established");
});
