import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { ImplementationProviderTest, REVIEW_TEST_ADAPTER, type ReviewTestProfile } from "../src/implementation-provider-test.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { sha256Hex } from "../src/implementation-hash.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const profile: ReviewTestProfile = { repository: "owner/test-repo", projectId: "test-project", teamId: "test-team", githubUserId: 7,
  states: { review: "review", work: "work", merge: "merge", canceled: "cancel" } };
const subject = { change: "sample", approvedDesignSha: "a".repeat(40), testedBaseSha: "b".repeat(40), treeSha: "c".repeat(40) };
async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket(); seedRun(db);
  db.sqlite.prepare("UPDATE orchestration_runs SET route_repository='owner/real-repo',route_github_installation_id='9'").run();
  const env = { DB: db, ARTIFACTS: bucket, GITHUB_API_URL: "https://github.test", GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: privateKey,
    IMPLEMENTATION_TEST_GITHUB_TOKEN: "user-token", LINEAR_API_URL: "https://linear.test", LINEAR_APP_ACCESS_TOKEN: "app-token",
    LINEAR_APP_ACTOR_ID: "app" } as unknown as Env;
  const store = new ImplementationStore(env.DB, env.ARTIFACTS), provider = new ImplementationProviderTest(env);
  const profileJson = JSON.stringify(profile), digest = await sha256Hex(profileJson), binding = `${REVIEW_TEST_ADAPTER}@${digest}`;
  db.sqlite.prepare("INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)").run("run-1", binding, profileJson, digest, "2026-09-14", "operator");
  const run = await store.allocate({ version: 1, runId: "run-1", repository: "owner/real-repo", change: "sample", branch: "deos/agent/SAC-182/run-1",
    approvedDesignSha: subject.approvedDesignSha, testedBaseSha: subject.testedBaseSha, policy: { ...implementationPolicy, safeAdapters: [binding] },
    approvedFiles: [], issue: {}, receipts: {}, requirements: { kinds: [], reasons: [], blockedProviders: [] } }, { userId: "human", revision: 1 }, "SAC-182", 1);
  for (const attempt of ["one", "two"]) { seedAttempt(db, attempt); await store.beginTry(run, { attempt_id: attempt, sandbox_id: `impl-${attempt}`, visit_sequence: 1 }, "build"); }
  const resource = await store.allocateResource("run-1", "one", "safe_test", REVIEW_TEST_ADAPTER);
  const owned = { profile, branch: "deos/canary/one", head: "d".repeat(40), heads: ["d".repeat(40)], pullNumber: 12,
    pullUrl: "https://github.test/owner/test-repo/pull/12", issueId: "test-issue", issueUrl: "https://linear.test/test-issue" };
  db.sqlite.prepare("UPDATE implementation_resources SET status='ready',provider_resource_id=?,namespace=?,metadata_json=? WHERE resource_id=?")
    .run(owned.issueId, "owner/test-repo:12", JSON.stringify(owned), resource.resource_id);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let state = "review", loseMove = false;
  const fetcher: typeof fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/access_tokens")) return Response.json({ token: "installation", expires_at: "2099-01-01T00:00:00Z" });
    if (String(url).endsWith("/user")) return Response.json({ id: 7, login: "tester", type: "User" });
    if (String(url).includes("/reviews")) return Response.json({ id: 99, user: { id: 7 }, commit_id: owned.head, state: "COMMENTED" });
    if (String(url) === "https://linear.test") {
      const vars = body.variables as Record<string, string>;
      if (String(body.query).includes("issueUpdate")) {
        assert.equal(vars.id, owned.issueId); state = vars.state;
        if (loseMove) throw new Error("Linear mutation reply lost");
        return Response.json({ data: { issueUpdate: { success: true, issue: { id: vars.id, state: { id: state } } } } });
      }
      return Response.json({ data: { issue: { id: owned.issueId, state: { id: state } } } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const call = (value: Record<string, unknown>, attempt = "one") => provider.call("run-1", attempt, [binding], {
    action: "safe_test", resourceId: resource.resource_id, subject, ...value,
  });
  return { db, env, store, provider, resource, owned, binding, calls, fetcher, call, loseMove: () => { loseMove = true; } };
}

test("provider tests reject a different resource, person, repository path or issue before any write", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await assert.rejects(f.call({ operation: "linear.move", operationId: "cross", issueId: "real-issue", stateId: "work" }), /target_denied/);
    await assert.rejects(f.call({ operation: "github.read", path: "/../../other" }), /path_denied/);
    await assert.rejects(f.call({ operation: "github.review", operationId: "head", body: { commit_id: "e".repeat(40), event: "APPROVE" } }), /review_denied/);
    await assert.rejects(f.call({ operation: "linear.read" }, "two"), /resource_mismatch/);
    assert.equal(f.calls.filter(c => c.url.includes("/reviews") || String(c.body.query).includes("issueUpdate")).length, 0);
  } finally { globalThis.fetch = original; f.db.close(); }
});

test("the same provider operation is returned once; an ambiguous mutation never repeats", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const move = { operation: "linear.move", operationId: "move", issueId: "test-issue", stateId: "work" };
    const response = await f.call(move); assert.deepEqual(await f.call(move), response);
    assert.equal(f.calls.filter(c => String(c.body.query).includes("issueUpdate")).length, 1);
    await assert.rejects(f.call({ ...move, stateId: "merge" }), /identity_mismatch/);
    f.loseMove();
    await assert.rejects(f.call({ ...move, operationId: "lost", stateId: "merge" }), /reply lost/);
    await assert.rejects(f.call({ ...move, operationId: "lost", stateId: "merge" }), /uncertain/);
    assert.equal(f.calls.filter(c => String(c.body.query).includes("issueUpdate")).length, 2);
  } finally { globalThis.fetch = original; f.db.close(); }
});

test("provider proof requires the exact signed actor/state transition and current tested tree", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await f.call({ operation: "github.review", operationId: "review", body: { commit_id: f.owned.head, event: "COMMENT", body: "Test note" } });
    await f.call({ operation: "linear.move", operationId: "move", issueId: "test-issue", stateId: "work" });
    const proof = { operation: "proof", githubOperationId: "review", linearOperationId: "move" };
    await assert.rejects(f.call(proof), /signed_delivery_pending/);
    f.db.sqlite.prepare("INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification) VALUES ('delivery',?,'2099-01-01T00:00:00Z','relevant')").run("e".repeat(64));
    f.db.sqlite.prepare("INSERT INTO implementation_test_events VALUES ('delivery',?,'test-issue','wrong','review','work','2099-01-01',?,'2099-01-01T00:00:00Z')")
      .run(f.resource.resource_id, "e".repeat(64));
    await assert.rejects(f.call(proof), /signed_delivery_pending/);
    f.db.sqlite.prepare("UPDATE implementation_test_events SET actor_id='app'").run();
    const evidence = await f.call(proof); assert.equal("providerDeliveryId" in evidence && evidence.providerDeliveryId, "delivery");
    await assert.rejects(f.call({ ...proof, subject: { ...subject, treeSha: "f".repeat(40) } }), /subject_changed/);
  } finally { globalThis.fetch = original; f.db.close(); }
});

test('event evidence requires an exact signed payload receipt and separately checks the app actor',async()=>{
  const f=await fixture();
  try {
    f.db.sqlite.prepare("INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification) VALUES ('delivery',?,'2099-01-01T00:00:00Z','relevant')").run('b'.repeat(64));
    f.db.sqlite.prepare("INSERT INTO implementation_test_events VALUES ('delivery',?,'test-issue','app','review','work','2099-01-01',?,'2099-01-01T00:00:00Z')")
      .run(f.resource.resource_id,'a'.repeat(64));
    const read=async()=>((await f.call({operation:'events'})) as {events:Array<Record<string,unknown>>}).events[0]!;
    assert.equal((await read()).signature_verified,0);
    f.db.sqlite.prepare("UPDATE deliveries SET payload_hash=? WHERE delivery_id='delivery'").run('a'.repeat(64));
    assert.equal((await read()).signature_verified,1);assert.equal((await read()).app_actor_matches,1);
    f.db.sqlite.prepare("UPDATE implementation_test_events SET actor_id='other'").run();
    assert.equal((await read()).signature_verified,1);assert.equal((await read()).app_actor_matches,0);
  } finally {f.db.close();}
});

test('a lease head advance persists the checked head for later scenario reads and is not repeated',async()=>{
  const f=await fixture(),original=globalThis.fetch,leaseId='a'.repeat(64),next='e'.repeat(40);
  let remoteHead=f.owned.head,updates=0;
  f.db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
    VALUES ('request','run-1',1,'one','issue-1',?,?,'granted','now','now')`).run(subject.treeSha,'c'.repeat(64));
  f.db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,stage,state,fence,
     base_manifest_id,base_traffic_revision,base_json,repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request','run-1','one','issue-1','SAC-182','Review','team','shared_test_demo','active',1,
      'base','base','{}','owner/real','candidate',137,?,?,'now')`).run(leaseId,subject.treeSha,'c'.repeat(64));
  f.db.sqlite.prepare(`INSERT INTO test_review_fixtures
    (resource_id,run_id,attempt_id,lease_id,kind,slot_id,allocation_op,provider,provider_resource_id,
     status,metadata_json,created_at,updated_at)
    VALUES (?,'run-1','one',?,'safe_test',?,?,'github-linear-review-v1','test-issue','ready',?,'now','now')`)
    .run(f.resource.resource_id,leaseId,f.resource.resource_id,'allocate',JSON.stringify(f.owned));
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path.endsWith('/git/ref/heads/deos/canary/one'))return Response.json({object:{sha:remoteHead}});
    if(path.endsWith('/git/commits/'+f.owned.head))return Response.json({tree:{sha:'t'.repeat(40)}});
    if(path.endsWith('/git/trees'))return Response.json({sha:'f'.repeat(40)});
    if(path.endsWith('/git/commits'))return Response.json({sha:next});
    if(path.endsWith('/git/refs/heads/deos/canary/one')){updates++;remoteHead=next;return Response.json({object:{sha:next}});}
    return f.fetcher(input,init);
  };
  try {
    const provider=new ImplementationProviderTest(f.env,async()=>{},leaseId);
    const input={operation:'github.advance_fixture_head',operationId:'s09-advance',resourceId:f.resource.resource_id};
    const result=await provider.call('run-1','one',[f.binding],input);
    assert.deepEqual(result,{response:{previousHead:f.owned.head,head:next,fixtureInput:true}});
    const saved=await provider.fixture('run-1','one',[f.binding]);
    assert.equal(saved.fixture.head,next);
    assert.deepEqual(saved.fixture.heads,[f.owned.head,next]);
    assert.deepEqual(await provider.call('run-1','one',[f.binding],input),result);
    assert.equal(updates,1);
  } finally {globalThis.fetch=original;f.db.close();}
});

test('cleanup closes both owned fixture pulls and checks that neither branch reappears',async()=>{
  const f=await fixture(),original=globalThis.fetch;
  const extra={branch:f.owned.branch+'-unlinked',head:f.owned.head,pullNumber:13,pullUrl:'https://github.test/owner/test-repo/pull/13'};
  const branches=new Map([[f.owned.branch,f.owned.head],[extra.branch,extra.head]]);
  const pulls=new Map([12,13].map(number=>[number,{number,state:'open',merged:false,
    base:{repo:{full_name:profile.repository}},head:{sha:f.owned.head,ref:number===12?f.owned.branch:extra.branch}}]));
  f.db.sqlite.prepare('UPDATE implementation_resources SET metadata_json=? WHERE resource_id=?')
    .run(JSON.stringify({...f.owned,unlinkedPull:extra}),f.resource.resource_id);
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    const pull=path.match(/\/pulls\/(12|13)$/);
    if(pull) {
      const row=pulls.get(Number(pull[1]))!;
      if(init?.method==='PATCH')row.state=JSON.parse(String(init.body)).state;
      return Response.json(row);
    }
    const ref=path.match(/\/git\/refs?\/heads\/(deos\/canary\/one(?:-unlinked)?)$/);
    if(ref) {
      if(init?.method==='DELETE'){branches.delete(ref[1]);return new Response(null,{status:204});}
      return branches.has(ref[1])?Response.json({object:{sha:branches.get(ref[1])}}):Response.json({message:'Not Found'},{status:404});
    }
    return f.fetcher(input,init);
  };
  try {
    const cleanup=new ImplementationProviderTest(f.env,async()=>{});
    await cleanup.cleanup((await f.store.resource('one','safe_test'))!);
    assert.equal(branches.size,0);assert.ok([...pulls.values()].every(p=>p.state==='closed'));
    const saved=(await f.store.resource('one','safe_test'))!;
    assert.equal(saved.status,'destroyed');
    const receipt=f.db.sqlite.prepare('SELECT cleanup_receipt FROM implementation_resources WHERE resource_id=?').get(saved.resource_id)!;
    assert.equal(JSON.parse(String(receipt.cleanup_receipt)).unlinkedPullClosed,13);
    await cleanup.cleanup(saved);
    branches.set(extra.branch,extra.head);
    await assert.rejects(cleanup.cleanup(saved),/unlinked_reappeared/);
  } finally {globalThis.fetch=original;f.db.close();}
});
