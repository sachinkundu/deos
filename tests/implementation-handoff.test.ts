import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { ImplementationHandoffController, implementationHandoffDefinition, type HandoffInput } from "../src/implementation-handoff.ts";
import { loadWorkflowDefinition, restoreWorkflowDefinition } from "../src/workflow-definition.ts";
import { D1OrchestrationStore } from "../src/orchestration-store.ts";
import { ImplementationTestDatabase, seedRun } from "./helpers/implementation-fixture.ts";
import type { ImplementationPull } from "../src/implementation-github.ts";

const bundle = {
  prompts: Object.fromEntries(readdirSync("config/prompts").map(name => [`prompts/${name}`, readFileSync(`config/prompts/${name}`, "utf8")])),
  schemas: Object.fromEntries(readdirSync("config/schemas").map(name => [`schemas/${name}`, readFileSync(`config/schemas/${name}`, "utf8")])),
};
const source = await loadWorkflowDefinition(readFileSync("config/workflow.simple-traceability-claude.yaml", "utf8"), {
  ...bundle, prompts: { ...bundle.prompts, "prompts/openspec-design-author.md": `${bundle.prompts["prompts/openspec-design-author.md"]}\nFrozen canary-specific instruction.` },
});
const tail = await loadWorkflowDefinition(readFileSync("config/workflow.implementation.yaml", "utf8"), bundle);
const stamp = "2026-09-14T11:32:00Z", sourceId = `wf-v1-${"a".repeat(52)}`, head = "a".repeat(40);

async function fixture() {
  const db = new ImplementationTestDatabase(), store = new D1OrchestrationStore(db as unknown as D1Database);
  await store.registerDefinition({ definition: source, projectId: "project", now: stamp });
  seedRun(db);
  db.sqlite.prepare(`UPDATE orchestration_runs SET definition_id=?,definition_version=?,definition_digest=?,
    workflow_instance_id=?,current_node='design_review',current_visit_sequence=28,allowed_linear_user_id=NULL,
    human_binding_revision=NULL,route_repository='owner/repo',route_human_gate_state_id='review' WHERE run_id='run-1'`)
    .run(source.name, source.version, source.digest, sourceId);
  db.sqlite.prepare(`INSERT INTO human_gate_visits (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,
    round,state,repository,pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
    VALUES ('run-1',28,'design_review','design','design','design',1,'open','owner/repo','136',136,
      'https://github.com/owner/repo/pull/136','design','main',?,?)`).run(head, stamp);
  db.sqlite.prepare(`INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run-1','source-delivery',?,'established',?,?)`).run(sourceId, stamp, stamp);
  const calls: string[] = [], states = new Map([[sourceId, "waiting"]]);
  let pauseHook = () => {}, loseCreate = false;
  const workflows = {
    async get(id: string) { return {
      id, async status() { if (!states.has(id)) throw new Error("instance absent"); return { status: states.get(id) }; },
      async pause() { calls.push("pause"); states.set(id, "paused"); pauseHook(); },
      async resume() { calls.push("resume"); states.set(id, "waiting"); },
      async terminate() { calls.push("terminate"); states.set(id, "terminated"); },
    }; },
    async createBatch(items: Array<{ id: string }>) {
      calls.push("create");
      for (const item of items) states.set(item.id, "waiting");
      if (loseCreate) throw new Error("lost create response");
      return Promise.all(items.map(item => this.get(item.id)));
    },
  };
  const issue = { state: { id: "review" } }, human = { id: "human", email: "operator@example.com", active: true, isMe: false };
  const pull = { state: "open", merged: false, head: { sha: head }, base: { ref: "main" } } as ImplementationPull;
  const env = { DB: db, ORCHESTRATION_WORKFLOW: workflows, STAGE_RETRY_SECRET: "secret",
    ROUTE_ADMIN_ALLOWED_EMAIL: "access-account@gmail.com" } as unknown as Env;
  const controller = new ImplementationHandoffController(env, tail, {
    issue: async () => issue, human: async () => human, pull: async () => pull,
  });
  const input: HandoffInput = { version: 1, runId: "run-1", sourceWorkflowInstanceId: sourceId,
    sourceDefinitionDigest: source.digest, visitSequence: 28, designHeadSha: head,
    humanUserId: "human", targetVersion: 26, requestedBy: "operator@example.com" };
  const request = (extra: Partial<HandoffInput> = {}) => new Request("https://worker/implementation-handoffs", {
    method: "POST", headers: { Authorization: "Bearer secret" }, body: JSON.stringify({ ...input, ...extra }),
  });
  const plan = async () => await (await controller.handle(request())).json() as { planDigest: string };
  return { db, store, controller, request, plan, input, calls, states, issue, human, pull,
    setPauseHook: (hook: () => void) => { pauseHook = hook; }, loseCreate: () => { loseCreate = true; } };
}

test("handoff preserves every frozen planning/design job and node and only attaches the implementation tail", async () => {
  const target = await implementationHandoffDefinition(source, tail, 26);
  assert.deepEqual(await restoreWorkflowDefinition(JSON.stringify(target), target.digest), target);
  for (const [id, job] of Object.entries(source.jobs)) assert.deepEqual(target.jobs[id], job);
  for (const [id, node] of Object.entries(source.nodes))
    if (id !== "merge_design_pr") assert.deepEqual(target.nodes[id], node);
  assert.equal(target.nodes.merge_design_pr.edges.completed, "implementation_prepare");
  assert.equal(target.nodes.implementation_merge.edges.completed, "code_merged");
  assert.deepEqual(target.nodes.design_review, source.nodes.design_review);
  await assert.rejects(implementationHandoffDefinition(target, tail, 27), /incompatible_definition/);
});

test("preflight is read-only; applying freezes the checked human and preserves the pending design approval", async () => {
  const f = await fixture();
  try {
    const p = await f.plan();
    assert.deepEqual(f.calls, []);
    assert.equal(f.db.sqlite.prepare("SELECT COUNT(*) n FROM implementation_handoffs").get()!.n, 0);
    const response = await f.controller.handle(f.request({ execute: true, planDigest: p.planDigest }));
    assert.equal(response.status, 200);
    const run = (await f.store.findRun("run-1"))!;
    assert.equal(run.current_node, "design_review"); assert.equal(run.status, "awaiting_human");
    assert.equal(run.current_visit_sequence, 29); assert.equal(run.allowed_linear_user_id, "human");
    assert.equal(run.definition_id, "implementation");
    const gates = f.db.sqlite.prepare("SELECT * FROM human_gate_visits ORDER BY visit_sequence").all();
    assert.equal(gates.length, 2);
    for (const g of gates) { assert.equal(g.state, "open"); assert.equal(g.approved_head_sha, head); assert.equal(g.decision_delivery_id, null); }
    assert.deepEqual(f.calls, ["pause", "terminate", "create"]);
    assert.equal(f.states.get(sourceId), "terminated"); assert.equal(f.states.get(run.workflow_instance_id), "waiting");
    await f.controller.handle(f.request({ execute: true, planDigest: p.planDigest }));
    assert.deepEqual(f.calls, ["pause", "terminate", "create"]);
    assert.equal(f.db.sqlite.prepare("SELECT COUNT(*) n FROM workflow_transitions_v2").get()!.n, 1);
  } finally { f.db.close(); }
});

test("a human decision racing the handoff aborts its compare-and-set and resumes the original instance", async () => {
  const f = await fixture();
  try {
    const p = await f.plan();
    f.setPauseHook(() => {
      f.db.sqlite.prepare(`INSERT INTO workflow_event_inbox (delivery_id,run_id,correlation_id,event_kind,actor_id,actor_type,
        provider_time,to_state_name,payload_digest,state,created_at)
        VALUES ('approval','run-1','run-1','Issue.update','human','user',?,'Merging',?,'pending',?)`).run(stamp, source.digest, stamp);
    });
    await assert.rejects(f.controller.handle(f.request({ execute: true, planDigest: p.planDigest })), /compare_and_set_failed/);
    assert.equal((await f.store.findRun("run-1"))!.definition_digest, source.digest);
    assert.deepEqual(f.calls, ["pause", "resume"]);
    assert.equal(f.db.sqlite.prepare("SELECT COUNT(*) n FROM workflow_transitions_v2").get()!.n, 0);
  } finally { f.db.close(); }
});

test("lost create response reconciles one replacement and keeps the original error observable", async () => {
  const f = await fixture();
  try {
    const p = await f.plan(); f.loseCreate();
    assert.equal((await f.controller.handle(f.request({ execute: true, planDigest: p.planDigest }))).status, 200);
    assert.equal(f.calls.filter(x => x === "create").length, 1);
  } finally { f.db.close(); }
});

test("stale provider head, Linear state, unchecked human and wrong plan cannot pause a run", async () => {
  for (const change of [
    (f: Awaited<ReturnType<typeof fixture>>) => { f.pull.head.sha = "b".repeat(40); },
    (f: Awaited<ReturnType<typeof fixture>>) => { f.issue.state.id = "merging"; },
    (f: Awaited<ReturnType<typeof fixture>>) => { f.human.active = false; },
  ]) {
    const f = await fixture();
    try { const p = await f.plan(); change(f);
      await assert.rejects(f.controller.handle(f.request({ execute: true, planDigest: p.planDigest })));
      assert.deepEqual(f.calls, []);
    } finally { f.db.close(); }
  }
  const f = await fixture();
  try { await assert.rejects(f.controller.handle(f.request({ execute: true, planDigest: "wrong" })), /plan_mismatch/);
    assert.deepEqual(f.calls, []);
  } finally { f.db.close(); }
});
