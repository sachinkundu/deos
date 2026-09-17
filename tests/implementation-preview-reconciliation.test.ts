import assert from "node:assert/strict";
import test from "node:test";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { previewRelaySandboxId } from "../src/implementation-preview.ts";
import { reconcileImplementationPreview } from "../src/implementation-preview-reconciliation.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

async function fixture() {
  const db = new ImplementationTestDatabase();
  const bucket = new ImplementationTestBucket();
  const store = new ImplementationStore(db as unknown as D1Database, bucket as unknown as R2Bucket);
  seedRun(db);
  const run = await store.allocate({version:1,runId:"run-1",repository:"owner/repo",change:"sample",
    branch:"deos/agent/SAC-172/run-1",approvedDesignSha:"a".repeat(40),testedBaseSha:"b".repeat(40),
    policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
    {userId:"human",revision:1},"SAC-172",1);
  seedAttempt(db, "one");
  await store.beginTry(run, {attempt_id:"one",sandbox_id:"impl-one",visit_sequence:1}, "build");
  db.sqlite.prepare("UPDATE orchestration_runs SET status='active',current_node='implementation_build' WHERE run_id='run-1'").run();
  const resource = await store.allocateResource("run-1", "one", "preview", "sandbox-tunnel");
  const relayId = await previewRelaySandboxId("one");
  const tunnel = {id:"quick-one",port:8787,url:"https://assigned.trycloudflare.com",createdAt:"2026-09-15T19:37:50.000Z"};
  db.sqlite.prepare("UPDATE implementation_resources SET status='quarantined',create_window=?,metadata_json=? WHERE resource_id=?")
    .run("2026-09-15T19:37:45.000Z", JSON.stringify({relaySandboxId:relayId}), resource.resource_id);
  return {db,bucket,store,resource,relayId,tunnel};
}

test("a delayed preview recovers the existing owned tunnel and retains its original error", async () => {
  const f = await fixture();
  try {
    await f.store.error("run-1", "one", "tool.preview", new Error("Original readiness HTTP 530: error code: 1016"));
    const before = [...f.bucket.objects.keys()];
    let lists = 0, reads = 0;
    const dependencies = {
      now: () => new Date("2026-09-15T19:44:00.000Z"),
      listTunnels: async (id: string) => {lists++; assert.equal(id, f.relayId); return [f.tunnel];},
      fetch: async (url: string | URL | Request, init?: RequestInit) => {
        reads++; assert.equal(url, `${f.tunnel.url}/__deos/preview-ready`);
        assert.equal(init?.redirect, "manual"); return new Response("deos-preview-ready");
      },
    };
    assert.deepEqual(await reconcileImplementationPreview(f.store, f.resource, dependencies), {origin:f.tunnel.url});
    assert.deepEqual(await reconcileImplementationPreview(f.store, f.resource, dependencies), {origin:f.tunnel.url});
    assert.equal(lists, 1); assert.equal(reads, 1);
    const row = await f.store.resource("one", "preview");
    assert.equal(row?.status, "ready"); assert.equal(row?.provider_resource_id, f.tunnel.url);
    assert.equal(JSON.parse(row!.metadata_json).tunnel.id, f.tunnel.id);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) AS n FROM implementation_resources WHERE kind='preview'").get()!.n, 1);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) AS n FROM implementation_effect_errors").get()!.n, 1);
    for (const key of before) assert.ok(f.bucket.objects.has(key), "original failure remains saved");
    assert.equal(f.db.sqlite.prepare("SELECT count(*) AS n FROM implementation_proof").get()!.n, 0);
  } finally { f.db.close(); }
});

test("failed or redirected readiness leaves the preview quarantined with the original response", async () => {
  for (const status of [530, 302, 200]) {
    const f = await fixture();
    try {
      await assert.rejects(reconcileImplementationPreview(f.store, f.resource, {
        now: () => new Date(), listTunnels: async () => [f.tunnel],
        fetch: async () => new Response("original unsuccessful readiness body", {status}),
      }), error => error instanceof Error && error.message.includes("original unsuccessful readiness body"));
      assert.equal((await f.store.resource("one", "preview"))!.status, "quarantined");
    } finally { f.db.close(); }
  }
});

test("missing, ambiguous, replaced and untrusted tunnels cannot be adopted", async () => {
  for (const kind of ["missing", "ambiguous", "old", "foreign", "replaced", "wrong-relay"]) {
    const f = await fixture();
    try {
      const metadata = {relaySandboxId:kind === "wrong-relay" ? "another-relay" : f.relayId,
        ...(kind === "replaced" ? {tunnel:{...f.tunnel,id:"original-tunnel"}} : {})};
      f.db.sqlite.prepare("UPDATE implementation_resources SET metadata_json=? WHERE resource_id=?")
        .run(JSON.stringify(metadata), f.resource.resource_id);
      const tunnel = {...f.tunnel,
        ...(kind === "old" ? {createdAt:"2026-09-15T18:00:00.000Z"} : {}),
        ...(kind === "foreign" ? {url:"https://foreign.example"} : {})};
      await assert.rejects(reconcileImplementationPreview(f.store, f.resource, {
        now: () => new Date(),
        listTunnels: async () => kind === "missing" ? [] : kind === "ambiguous" ? [tunnel,tunnel] : [tunnel],
        fetch: async () => assert.fail("untrusted inventory must never be probed"),
      }), /missing or ambiguous|differs/);
      assert.equal((await f.store.resource("one", "preview"))!.status, "quarantined");
    } finally { f.db.close(); }
  }
});

test("stale visits, inactive attempts and cleanup during a health check cannot revive a preview", async () => {
  for (const scenario of ["inactive", "stale-visit", "cleanup", "finished-during-read"]) {
    const f = await fixture();
    try {
      if (scenario === "inactive") f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
      if (scenario === "stale-visit") f.db.sqlite.prepare("UPDATE orchestration_runs SET current_visit_sequence=2 WHERE run_id='run-1'").run();
      await assert.rejects(reconcileImplementationPreview(f.store, f.resource, {
        now: () => new Date(), listTunnels: async () => [f.tunnel],
        fetch: async () => {
          if (scenario === "cleanup") f.db.sqlite.prepare("UPDATE implementation_resources SET status='destroyed' WHERE resource_id=?").run(f.resource.resource_id);
          else if (scenario === "finished-during-read") f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
          else assert.fail("inactive work must never be probed");
          return new Response("deos-preview-ready");
        },
      }), /current active try|ownership changed/);
      assert.notEqual((await f.store.resource("one", "preview"))!.status, "ready");
    } finally { f.db.close(); }
  }
});
