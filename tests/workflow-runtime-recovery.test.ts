import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  D1WorkflowRuntimeRecoveryStore,
  WorkflowRuntimeRecoveryController,
  type WorkflowRuntimeRecoveryRecord,
} from "../src/workflow-runtime-recovery.ts";
import { ImplementationTestDatabase } from "./helpers/implementation-fixture.ts";
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

const request = (secret = "operator-secret", retryNode = "design_self_review"): Request =>
  new Request("https://example.test/workflow-runtime-recoveries", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: 1,
      runId: "run-1",
      sourceWorkflowInstanceId: "wf-v1-source",
      retryNode,
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

test("the recovery endpoint accepts a design revision author node", async () => {
  const store = new FakeStore();
  store.record.retry_node = "design_revision_author";
  const controller = new WorkflowRuntimeRecoveryController(
    store, new FakeWorkflow(), "operator-secret", () => NOW,
  );
  assert.equal((await controller.handle(request("operator-secret", "design_revision_author"))).status, 202);
});

test("the migration keeps existing recovery records", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON; CREATE TABLE orchestration_runs (run_id TEXT PRIMARY KEY); INSERT INTO orchestration_runs VALUES ('run-1')");
    db.exec(readFileSync("migrations/0025_workflow_runtime_recovery.sql", "utf8"));
    db.prepare(
      `INSERT INTO workflow_runtime_recoveries
       (recovery_id, run_id, retry_node, from_visit_sequence, to_visit_sequence,
        transition_id, state, requested_by, source_workflow_instance_id,
        target_workflow_instance_id, source_delivery_id, created_at, updated_at)
       VALUES ('old', 'run-1', 'design_self_review', 20, 21,
               'transition', 'established', 'operator', 'wf-v1-old',
               'wf-v1-new', 'delivery', '2026-09-03T07:30:00Z', '2026-09-03T07:30:00Z')`,
    ).run();
    db.exec(readFileSync("migrations/0054_general_pre_attempt_recovery.sql", "utf8"));
    assert.deepEqual({ ...db.prepare(
      "SELECT recovery_id, retry_node, state FROM workflow_runtime_recoveries WHERE recovery_id = 'old'",
    ).get() }, { recovery_id: "old", retry_node: "design_self_review", state: "established" });
  } finally {
    db.close();
  }
});

const sourceInstanceId = "wf-v1-source";
const recoveryRunId = "recovery-run";
const entryAt = "2026-09-23T11:10:18.989Z";

const recoveryDatabase = (nodeId: string, nodeType: "agent" | "system_action") => {
  const db = new ImplementationTestDatabase();
  const definition = JSON.stringify({ nodes: { [nodeId]: { type: nodeType } } });
  const digest = "a".repeat(64);
  db.sqlite.prepare(
    `INSERT INTO workflow_definitions
     (definition_id, version, project_id, name, canonical_json, digest, created_at)
     VALUES ('recovery', 1, 'project', 'recovery', ?, ?, ?)`,
  ).run(definition, digest, "2026-09-23T10:00:00Z");
  db.sqlite.prepare(
    `INSERT INTO orchestration_runs
     (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
      definition_version, definition_digest, workflow_instance_id, current_node,
      current_visit_sequence, status, created_at, updated_at)
     VALUES (?, ?, 1, 'project', 'issue', 'recovery', 1, ?, ?, ?, 28, 'active', ?, ?)`,
  ).run(recoveryRunId, recoveryRunId, digest, sourceInstanceId, nodeId,
    "2026-09-23T10:00:00Z", entryAt);
  db.sqlite.prepare(
    `INSERT INTO dispatch_intents
     (run_id, source_delivery_id, workflow_instance_id, state, created_at, updated_at)
     VALUES (?, 'delivery', ?, 'established', ?, ?)`,
  ).run(recoveryRunId, sourceInstanceId, entryAt, entryAt);
  db.sqlite.prepare(
    `INSERT INTO workflow_transitions_v2
     (transition_id, run_id, from_node, to_node, from_visit_sequence,
      to_visit_sequence, cause_type, cause_reference, occurred_at)
     VALUES ('entry', ?, 'previous', ?, 27, 28, 'workflow', 'entry', ?)`,
  ).run(recoveryRunId, nodeId, entryAt);
  return db;
};

const prepareRecovery = (db: ImplementationTestDatabase, retryNode: string) =>
  new D1WorkflowRuntimeRecoveryStore(db as unknown as D1Database).prepare({
    runId: recoveryRunId,
    sourceWorkflowInstanceId: sourceInstanceId,
    retryNode,
    visitSequence: 28,
    requestedBy: "operator@example.com",
    now: "2026-09-23T11:20:00Z",
  });

test("a stopped author node can resume from its frozen definition without a node allowlist", async () => {
  const db = recoveryDatabase("design_revision_author", "agent");
  try {
    const recovery = await prepareRecovery(db, "design_revision_author");
    assert.equal(recovery.retry_node, "design_revision_author");
    assert.equal(recovery.from_visit_sequence, 28);
    assert.equal(recovery.to_visit_sequence, 29);
    assert.deepEqual({ ...db.sqlite.prepare(
      "SELECT current_node, current_visit_sequence, workflow_instance_id FROM orchestration_runs WHERE run_id = ?",
    ).get(recoveryRunId) }, {
      current_node: "design_revision_author",
      current_visit_sequence: 29,
      workflow_instance_id: recovery.target_workflow_instance_id,
    });
    assert.equal(db.sqlite.prepare(
      "SELECT COUNT(*) AS count FROM workflow_transitions_v2 WHERE transition_id = ?",
    ).get(recovery.transition_id)?.count, 1);
    assert.equal((await prepareRecovery(db, "design_revision_author")).recovery_id, recovery.recovery_id);
  } finally {
    db.close();
  }
});

test("pre-attempt recovery keeps the existing self-review node eligible", async () => {
  const db = recoveryDatabase("design_self_review", "agent");
  try {
    assert.equal((await prepareRecovery(db, "design_self_review")).retry_node, "design_self_review");
  } finally {
    db.close();
  }
});

test("recovery refuses non-agent nodes, attempts, and unresolved provider actions", async () => {
  for (const unsafe of ["system_action", "attempt", "provider_action", "unresolved_prior_action"] as const) {
    const nodeType = unsafe === "system_action" ? "system_action" : "agent";
    const db = recoveryDatabase("design_revision_author", nodeType);
    try {
      if (unsafe === "attempt") {
        db.sqlite.prepare(
          `INSERT INTO agent_attempts
           (attempt_id, sandbox_id, run_id, node_id, job_spec_json, job_spec_digest,
            state, absolute_deadline, created_at, updated_at, visit_sequence)
           VALUES ('attempt', 'sandbox', ?, 'design_revision_author', '{}', ?,
                   'failed', ?, ?, ?, 28)`,
        ).run(recoveryRunId, "b".repeat(64), "2026-09-24T00:00:00Z", entryAt, entryAt);
      }
      if (unsafe === "provider_action" || unsafe === "unresolved_prior_action") {
        const operationAt = unsafe === "provider_action" ? entryAt : "2026-09-23T11:00:00Z";
        db.sqlite.prepare(
          `INSERT INTO provider_operations
           (operation_id, run_id, capability, action, sanitized_target, request_digest,
            state, started_at, updated_at)
           VALUES ('operation', ?, 'system_action', 'write', 'target', ?,
                   'pending', ?, ?)`,
        ).run(recoveryRunId, "c".repeat(64), operationAt, operationAt);
      }
      await assert.rejects(prepareRecovery(db, "design_revision_author"),
        /workflow_runtime_recovery_not_eligible/);
      assert.equal(db.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM workflow_runtime_recoveries",
      ).get()?.count, 0);
      assert.equal(db.sqlite.prepare(
        "SELECT current_visit_sequence FROM orchestration_runs WHERE run_id = ?",
      ).get(recoveryRunId)?.current_visit_sequence, 28);
    } finally {
      db.close();
    }
  }
});
