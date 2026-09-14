import assert from "node:assert/strict";
import test from "node:test";
import { forwardImplementationPreview, previewRelaySandboxId } from "../src/implementation-preview.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

test("preview forwarding uses only the live try's app and preserves request and response data", async () => {
  const db = new ImplementationTestDatabase();
  try {
    seedRun(db);
    const store = new ImplementationStore(db as unknown as D1Database, new ImplementationTestBucket() as unknown as R2Bucket);
    const run = await store.allocate({version:1,runId:"run-1",repository:"owner/repo",change:"sample",
      branch:"deos/agent/SAC-172/run-1",approvedDesignSha:"a".repeat(40),testedBaseSha:"b".repeat(40),
      policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
      {userId:"human",revision:1},"SAC-172",1);
    seedAttempt(db,"one");
    db.sqlite.prepare("UPDATE agent_attempts SET sandbox_tier='basic' WHERE attempt_id='one'").run();
    await store.beginTry(run,{attempt_id:"one",sandbox_id:"impl-one",visit_sequence:1},"build");
    const row = await store.allocateResource("run-1","one","preview","sandbox-tunnel");
    const relayId = await previewRelaySandboxId("one");
    assert.notEqual(relayId, await previewRelaySandboxId("two"));
    const context = {containerId:relayId,params:{runId:"run-1",attemptId:"one"}};
    const origin = "https://assigned.trycloudflare.com";
    db.sqlite.prepare("UPDATE implementation_resources SET status='ready',preview_origin=?,metadata_json=? WHERE resource_id=?")
      .run(origin,JSON.stringify({relaySandboxId:relayId}),row.resource_id);
    let calls = 0;
    const original = new Error("source app connection reset");
    let fail = false;
    const dependencies = {relayContainerId:(id:string)=>id,forward:async(id:string,tier:string,request:Request)=>{
      calls++;
      assert.equal(id,"impl-one"); assert.equal(tier,"basic");
      if (fail) throw original;
      assert.equal(request.url,`${origin}/api/review?draft=1`);
      assert.equal(request.headers.get("Host"),"assigned.trycloudflare.com");
      assert.equal(request.method,"POST"); assert.equal(request.redirect,"manual");
      assert.equal(await request.text(),"saved review text");
      return new Response("created",{status:201,headers:{"Set-Cookie":"draft=1; Secure; HttpOnly","Location":"/review"}});
    }};
    const request = () => new Request("http://implementation-preview.internal/api/review?draft=1",{method:"POST",body:"saved review text"});
    const response = await forwardImplementationPreview(request(),db as unknown as D1Database,context,dependencies);
    assert.equal(response.status,201); assert.equal(await response.text(),"created");
    assert.equal(response.headers.get("Set-Cookie"),"draft=1; Secure; HttpOnly");
    assert.equal(response.headers.get("Location"),"/review");
    await assert.rejects(forwardImplementationPreview(request(),db as unknown as D1Database,{...context,containerId:"another-relay"},dependencies),/not owned/);
    await assert.rejects(forwardImplementationPreview(request(),db as unknown as D1Database,{...context,params:{runId:"other-run",attemptId:"one"}},dependencies),/not owned/);
    await assert.rejects(forwardImplementationPreview(new Request("http://other.internal/"),db as unknown as D1Database,context,dependencies),/identity/);
    for (const status of ["quarantined","destroyed"]) {
      db.sqlite.prepare("UPDATE implementation_resources SET status=? WHERE resource_id=?").run(status,row.resource_id);
      await assert.rejects(forwardImplementationPreview(request(),db as unknown as D1Database,context,dependencies),/not owned/);
    }
    db.sqlite.prepare("UPDATE implementation_resources SET status='ready' WHERE resource_id=?").run(row.resource_id);
    db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
    await assert.rejects(forwardImplementationPreview(request(),db as unknown as D1Database,context,dependencies),/not owned/);
    assert.equal(calls,1,"denied requests never reach a sandbox");
    db.sqlite.prepare("UPDATE agent_attempts SET state='running' WHERE attempt_id='one'").run();
    fail = true;
    await assert.rejects(forwardImplementationPreview(request(),db as unknown as D1Database,context,dependencies),error=>error===original);
  } finally { db.close(); }
});
