import assert from "node:assert/strict";
import test from "node:test";
import { ImplementationStore, type ImplementationInput } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { sha256Hex } from "../src/implementation-hash.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket();
  seedRun(db); seedAttempt(db,"failed-task");
  const store = new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  const input: ImplementationInput = {version:1,runId:"run-1",repository:"owner/repo",change:"sample",
    branch:"deos/agent/SAC-182/run-1",approvedDesignSha:"a".repeat(40),testedBaseSha:"b".repeat(40),
    policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}};
  const work = await store.allocate(input,{userId:"human",revision:1},"SAC-182",1);
  const patch = "saved task patch\n", patchSha = await sha256Hex(patch);
  const candidate = {version:1,kind:"tasks",attemptId:"failed-task",change:"sample",approvedDesignSha:input.approvedDesignSha,
    testedBaseSha:input.testedBaseSha,patchSha,treeSha:"c".repeat(40),
    files:[{path:"openspec/changes/sample/tasks.md",mode:"100644",contentBase64:Buffer.from("- [ ] Keep this work\n").toString("base64")}],
    sources:[{url:"https://docs.github.com",claimLocator:"tasks.md:1"}]};
  db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest','run-1','failed-task','manifest-key','complete','now');
    UPDATE agent_attempts SET node_id='implementation_tasks',state='failed',cleanup_state='destroyed',
      manifest_id='manifest',result_class='post_collection_validation_failed',result_detail='missing claim' WHERE attempt_id='failed-task';`);
  for (const [name,bytes] of [["implementation-candidate.json",JSON.stringify(candidate)],["patch.diff",patch]]) {
    await bucket.put(name,bytes);
    db.sqlite.prepare(`INSERT INTO artifacts (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,policy_outcome)
      VALUES ('manifest',?,?, 'text/plain',?,?,'now','accepted')`).run(name,name,Buffer.byteLength(bytes),await sha256Hex(bytes));
  }
  return {db,bucket,store,work,candidate};
}

test("a fresh retry recovers hash-verified failed output without accepting or rewriting the old attempt", async () => {
  const f = await fixture();
  try {
    const recovery = await f.store.failedCandidate(f.work,"implementation_tasks");
    assert.equal(recovery?.candidate.attemptId,"failed-task");
    assert.equal(recovery?.failure.detail,"missing claim");
    assert.equal(recovery?.patch.r2Key,"patch.diff");
    seedAttempt(f.db,"new-task");
    await f.store.beginTry(f.work,{attempt_id:"new-task",sandbox_id:"impl-new-task",visit_sequence:3},"tasks",recovery!.patch.sha256);
    assert.equal(f.db.sqlite.prepare("SELECT input_patch_sha FROM implementation_tries WHERE attempt_id='new-task'").get()!.input_patch_sha,recovery!.candidate.patchSha);
    assert.equal((await f.store.requireRun("run-1")).candidate_key,null);
    assert.equal(f.db.sqlite.prepare("SELECT state FROM agent_attempts WHERE attempt_id='failed-task'").get()!.state,"failed");
    assert.equal(await f.store.failedCandidate(f.work,"implementation_build"),null);
    assert.equal(await f.store.failedCandidate({...f.work,tested_base_sha:"f".repeat(40)},"implementation_tasks"),null);
  } finally { f.db.close(); }
});

test("recovery excludes incomplete cleanup/manifests, newer attempts and corrupt saved bytes", async () => {
  for (const mutation of [
    "UPDATE agent_attempts SET cleanup_state='pending'",
    "UPDATE artifact_manifests SET state='pending'",
    "UPDATE artifacts SET policy_outcome='rejected'",
    "UPDATE artifact_manifests SET attempt_id='other'",
  ]) {
    const f=await fixture();
    try { f.db.sqlite.exec(mutation); assert.equal(await f.store.failedCandidate(f.work,"implementation_tasks"),null); }
    finally { f.db.close(); }
  }
  const f=await fixture();
  try {
    f.bucket.objects.set("patch.diff",new TextEncoder().encode("corrupt"));
    await assert.rejects(f.store.failedCandidate(f.work,"implementation_tasks"),/R2 hash mismatch/);
    seedAttempt(f.db,"new-task");
    f.db.sqlite.exec("UPDATE agent_attempts SET node_id='implementation_tasks',created_at='2026-09-15T00:00:00Z' WHERE attempt_id='new-task'");
    assert.equal(await f.store.failedCandidate(f.work,"implementation_tasks"),null);
  } finally { f.db.close(); }
});

test("an incomplete supervisor snapshot can seed a fresh author but never becomes an accepted candidate", async () => {
  const f = await fixture();
  try {
    const saved = { ...f.candidate, purpose: "recovery-only", runId: "run-1" };
    const bytes = JSON.stringify(saved);
    await f.bucket.put("recovery", bytes);
    f.db.sqlite.prepare("UPDATE artifacts SET logical_name='implementation-recovery.json',r2_key='recovery',sha256=?,byte_size=? WHERE logical_name='implementation-candidate.json'")
      .run(await sha256Hex(bytes), Buffer.byteLength(bytes));
    f.db.sqlite.exec("UPDATE artifacts SET logical_name='recovery-patch.diff' WHERE logical_name='patch.diff'");
    const recovery = await f.store.failedCandidate(f.work, "implementation_tasks");
    assert.equal(recovery?.candidate.attemptId, "failed-task");
    assert.equal((await f.store.requireRun("run-1")).candidate_key, null);
    assert.equal(f.db.sqlite.prepare("SELECT state FROM agent_attempts WHERE attempt_id='failed-task'").get()!.state, "failed");
    const invalid = JSON.stringify({ ...saved, runId: "other-run" });
    f.bucket.objects.set("recovery", new TextEncoder().encode(invalid));
    f.db.sqlite.prepare("UPDATE artifacts SET sha256=? WHERE r2_key='recovery'").run(await sha256Hex(invalid));
    await assert.rejects(f.store.failedCandidate(f.work, "implementation_tasks"), /does not match its run/);
  } finally { f.db.close(); }
});

test("an unchanged failed checkout cannot replace a saved cumulative implementation", async () => {
  const f = await fixture();
  try {
    const patch = "# No repository changes in this attempt.\n";
    const patchSha = await sha256Hex(patch);
    const candidate = {...f.candidate, files: [], patchSha};
    const bytes = JSON.stringify(candidate);
    f.bucket.objects.set("implementation-candidate.json",new TextEncoder().encode(bytes));
    f.bucket.objects.set("patch.diff",new TextEncoder().encode(patch));
    f.db.sqlite.prepare("UPDATE artifacts SET sha256=?,byte_size=? WHERE logical_name='implementation-candidate.json'")
      .run(await sha256Hex(bytes),Buffer.byteLength(bytes));
    f.db.sqlite.prepare("UPDATE artifacts SET sha256=?,byte_size=? WHERE logical_name='patch.diff'")
      .run(patchSha,Buffer.byteLength(patch));
    const saved = {...f.work,patch_key:"saved-cumulative-patch",patch_sha:"a".repeat(64)};
    const recovery = await f.store.failedCandidate(saved,"implementation_tasks");
    assert.equal(recovery?.restoreSavedPatch,true);
    assert.equal(recovery?.failure.detail,"missing claim");
    assert.equal(recovery?.candidate.attemptId,"failed-task");
    assert.equal((await f.store.failedCandidate(f.work,"implementation_tasks"))?.restoreSavedPatch,false);
    assert.equal((await f.store.failedCandidate({...saved,patch_sha:patchSha},"implementation_tasks"))?.restoreSavedPatch,false);
  } finally { f.db.close(); }
});
