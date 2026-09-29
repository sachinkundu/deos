import assert from "node:assert/strict";
import test from "node:test";

import {
  D1WorkflowRuntimeRecoveryStore,
  WorkflowRuntimeRecoveryController,
  type WorkflowRuntimeRecoveryRecord,
} from "../src/workflow-runtime-recovery.ts";
import type {
  WorkflowBinding,
  WorkflowInstanceHandle,
  WorkflowStartParameters,
} from "../src/queue-consumer-core.ts";
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';

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

for(const terminal of [false,true])test(`demo recovery requires a closed, proved abort (${terminal?'fenced terminal':'active'} run)`,async()=>{
  const db=new ImplementationTestDatabase();
  const now=NOW.toISOString(),sha='a'.repeat(40),patch='b'.repeat(64);
  try {
    db.sqlite.prepare(`INSERT INTO workflow_definitions
      (definition_id,version,project_id,name,canonical_json,digest,created_at)
      VALUES ('implementation',44,'project','implementation','{}',?,?)`)
      .run('c'.repeat(64),now);
    db.sqlite.prepare(`INSERT INTO orchestration_runs
      (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,
       definition_version,definition_digest,workflow_instance_id,current_node,
       current_visit_sequence,status,created_at,updated_at)
      VALUES ('run-1','correlation-1',1,'project','issue-1','implementation',44,?,
        'wf-v1-source','shared_test_demo',20,'active',?,?)`)
      .run('c'.repeat(64),now,now);
    db.sqlite.prepare(`INSERT INTO dispatch_intents
      (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
      VALUES ('run-1','delivery-1','wf-v1-source','established',?,?)`)
      .run(now,now);
    db.sqlite.prepare(`INSERT INTO implementation_runs
      (run_id,linear_identifier,issue_run_sequence,change_id,approved_design_sha,
       tested_base_sha,branch,allowed_linear_user_id,human_binding_revision,
       input_key,input_sha,approved_files_json,requirements_json,pr_head_sha,
       patch_sha,created_at,updated_at)
      VALUES ('run-1','SAC-182',1,'sac-182',?,?,'codex/test','human',1,
        'input','input-sha','[]','{}',?,?,?,?)`)
      .run(sha,sha,sha,patch,now,now);
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,
       patch_sha256,state,created_at,updated_at)
      VALUES ('request-1','run-1',3,'attempt-1','issue-1',?,?,'granted',?,?)`)
      .run(sha,patch,now,now);
    const store=new D1WorkflowRuntimeRecoveryStore(db as unknown as D1Database);
    const input={runId:'run-1',sourceWorkflowInstanceId:'wf-v1-source',
      retryNode:'shared_test_demo',visitSequence:20,requestedBy:'operator',now};
    await assert.rejects(store.prepare(input),/not_eligible/);
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,
       team_id,stage,state,fence,base_manifest_id,base_traffic_revision,
       base_json,repository,branch,pull_request_number,candidate_commit,
       patch_sha256,created_at)
      VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-182',
        'Test','team-1','shared_test_demo','closed',1,'manifest','traffic',
        '{}','owner/repo','codex/test',137,?,?,?)`)
      .run(sha,patch,now);
    db.sqlite.prepare(`INSERT INTO test_failures
      (fault_id,run_id,lease_id,phase,safe_code,first_message,
       causes_json,context_json,occurred_at)
      VALUES ('fault-1','run-1','lease-1','preparing','setup_failed',
        'HTTP 302','[]','{}',?)`).run(now);
    db.sqlite.prepare(`INSERT INTO test_lease_aborts
      (lease_id,run_id,first_fault_id,proof_body_sha256,proof_read_at,
       cleanup_sha256,absence_sha256,closed_at,receipt_json)
      VALUES ('lease-1','run-1','fault-1',?,?,?, ?,?,'{}')`)
      .run('d'.repeat(64),now,'e'.repeat(64),'f'.repeat(64),now);
    db.sqlite.prepare(`INSERT INTO test_lease_abort_guards
      (lease_id,ready,checked_at) VALUES ('lease-1',1,?)`).run(now);
    if(terminal) {
      db.sqlite.prepare(`INSERT INTO workflow_transitions_v2
        (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,
          cause_type,cause_reference,actor_type,occurred_at)
        VALUES ('failure','run-1','shared_test_demo','implementation_failed',19,20,
          'workflow','system:implementation.shared_test_demo:failed','workflow',?)`).run(now);
      db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='implementation_failed',
        previous_node='shared_test_demo',status='failed',last_transition_id='failure'
        WHERE run_id='run-1'`).run();
      await assert.rejects(store.prepare(input),/not_eligible/);
      db.sqlite.prepare(`UPDATE test_failures SET safe_code='shared_test_failed',
        first_message='shared_test_heartbeat_fenced' WHERE fault_id='fault-1'`).run();
      db.sqlite.prepare(`UPDATE workflow_transitions_v2 SET cause_reference='another_failure'
        WHERE transition_id='failure'`).run();
      await assert.rejects(store.prepare(input),/not_eligible/);
      db.sqlite.prepare(`UPDATE workflow_transitions_v2
        SET cause_reference='system:implementation.shared_test_demo:failed'
        WHERE transition_id='failure'`).run();
      db.sqlite.prepare(`UPDATE test_leases SET candidate_commit=? WHERE lease_id='lease-1'`)
        .run('9'.repeat(40));
      await assert.rejects(store.prepare(input),/not_eligible/);
      db.sqlite.prepare(`UPDATE test_leases SET candidate_commit=? WHERE lease_id='lease-1'`).run(sha);
      db.sqlite.prepare(`DELETE FROM test_lease_abort_guards WHERE lease_id='lease-1'`).run();
      await assert.rejects(store.prepare(input),/not_eligible/);
      db.sqlite.prepare(`INSERT INTO test_lease_abort_guards VALUES ('lease-1',1,?)`).run(now);
      assert.equal(db.sqlite.prepare(`SELECT status FROM orchestration_runs WHERE run_id='run-1'`).get()?.status,'failed');
      assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM workflow_runtime_recoveries`).get()?.n,0);
    }
    const recovery=await store.prepare(input);
    assert.equal(recovery.retry_node,'shared_test_demo');
    assert.equal(recovery.to_visit_sequence,21);
    assert.equal(db.sqlite.prepare(`SELECT current_visit_sequence FROM orchestration_runs
      WHERE run_id='run-1'`).get()?.current_visit_sequence,21);
    assert.deepEqual({...db.sqlite.prepare(`SELECT current_node,status FROM orchestration_runs
      WHERE run_id='run-1'`).get()},{current_node:'shared_test_demo',status:'active'});
    assert.equal(db.sqlite.prepare(`SELECT from_node FROM workflow_transitions_v2
      WHERE transition_id=?`).get(recovery.transition_id)?.from_node,
      terminal?'implementation_failed':'shared_test_demo');
  }finally{db.close();}
});
