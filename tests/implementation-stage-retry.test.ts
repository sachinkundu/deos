import assert from "node:assert/strict";
import test from "node:test";
import { D1AgentStageRetryStore, isAgentStageRetryNode } from "../src/stage-retry.ts";
import { ImplementationTestDatabase, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";

function fixture(node: "implementation_tasks" | "implementation_build") {
  const db = new ImplementationTestDatabase(); seedRun(db); seedAttempt(db, "failed-attempt");
  db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='implementation_failed',current_visit_sequence=2,
    status='failed',terminal_cause='implementation_failed' WHERE run_id='run-1'`).run();
  db.sqlite.prepare(`UPDATE agent_attempts SET node_id=?,state='interrupted',cleanup_state='destroyed',
    ended_at='2026-09-14T12:00:00Z' WHERE attempt_id='failed-attempt'`).run(node);
  db.sqlite.exec(`INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run-1','source-delivery','run-1','established','now','now')`);
  db.sqlite.prepare(`INSERT INTO workflow_transitions_v2
    (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
    VALUES ('failure','run-1',?,'implementation_failed',1,2,'agent',?,'now')`).run(node, `agent:${node}:failed`);
  const store = new D1AgentStageRetryStore(db as unknown as D1Database);
  const input = { runId: "run-1", failedAttemptId: "failed-attempt", retryNode: node,
    requestedBy: "operator@example.com", now: "2026-09-14T13:00:00Z",
    targetDefinition: { name: "implementation", version: 26, digest: "e".repeat(64) } as LoadedWorkflowDefinition };
  return { db, store, input };
}

test("implementation retries preserve the frozen definition and human binding with one audited transition", async () => {
  for (const node of ["implementation_tasks", "implementation_build"] as const) {
    const f = fixture(node);
    try {
      assert.equal(isAgentStageRetryNode(node), true);
      const first = await f.store.prepare(f.input);
      assert.equal(first.target_definition_version, 25);
      assert.equal(first.target_definition_digest, "d".repeat(64));
      assert.equal(first.retry_kind, "same_definition");
      const run = f.db.sqlite.prepare("SELECT * FROM orchestration_runs WHERE run_id='run-1'").get()!;
      assert.equal(run.current_node, node); assert.equal(run.status, "active");
      assert.equal(run.current_visit_sequence, 3); assert.equal(run.allowed_linear_user_id, "human");
      assert.equal(run.human_binding_revision, 1);
      assert.notEqual(run.workflow_instance_id, "run-1");
      assert.equal((await f.store.prepare(f.input)).retry_id, first.retry_id);
      assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM agent_attempts").get()!.n, 1);
      assert.equal(f.db.sqlite.prepare("SELECT from_node FROM workflow_transitions_v2 WHERE transition_id=?")
        .get(first.transition_id)!.from_node, "implementation_failed");
      assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM agent_stage_retries").get()!.n, 1);
    } finally { f.db.close(); }
  }
});

test("implementation retry rejects active attempts, unfinished cleanup, wrong failure cause and human gates", async () => {
  for (const sql of [
    "UPDATE agent_attempts SET state='running'",
    "UPDATE agent_attempts SET cleanup_state='pending'",
    "UPDATE orchestration_runs SET terminal_cause='system_action_invariant_failed'",
    "UPDATE orchestration_runs SET current_node='implementation_review',status='awaiting_human'",
    "UPDATE workflow_transitions_v2 SET cause_reference='system:implementation.prepare:failed'",
  ]) {
    const f = fixture("implementation_tasks");
    try {
      f.db.sqlite.exec(sql);
      await assert.rejects(f.store.prepare(f.input), /stage_retry_not_eligible/);
      assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM agent_stage_retries").get()!.n, 0);
    } finally { f.db.close(); }
  }
});
