import assert from "node:assert/strict";
import test from "node:test";
import {
  ImplementationBrowserAllocator,
  CloudflareBrowserProvider,
  browserCommand,
  BrowserCapacityWait,
  type BrowserProvider,
} from "../src/implementation-browser.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import {
  ImplementationTestDatabase,
  ImplementationTestBucket,
  seedRun,
  seedAttempt,
} from "./helpers/implementation-fixture.ts";
class Provider implements BrowserProvider {
  live: string[] = [];
  creates = 0;
  available = true;
  ambiguous = false;
  keptAlive: string[] = [];
  async inventory() {
    return [...this.live];
  }
  async capacity() {
    return { available: this.available, retryAfterMs: 3000 };
  }
  async create(_host: string) {
    const id = `browser-${++this.creates}`;
    this.live.push(id);
    if (this.ambiguous) throw new Error("allocation response lost");
    return { id, disconnect: async () => {} };
  }
  async close(id: string) {
    this.live = this.live.filter((value) => value !== id);
  }
  async keepAlive(id: string) { this.keptAlive.push(id); }
}
async function fixture() {
  const db = new ImplementationTestDatabase(),
    bucket = new ImplementationTestBucket(),
    provider = new Provider();
  seedRun(db);
  const store = new ImplementationStore(
    db as unknown as D1Database,
    bucket as unknown as R2Bucket,
  );
  const run = await store.allocate(
    {
      version: 1,
      runId: "run-1",
      repository: "owner/repo",
      change: "sample",
      branch: "deos/agent/SAC-172/run-1",
      approvedDesignSha: "a".repeat(40),
      testedBaseSha: "b".repeat(40),
      policy: implementationPolicy,
      approvedFiles: [],
      issue: {},
      receipts: {},
      requirements: { kinds: [], reasons: [], blockedProviders: [] },
    },
    { userId: "human", revision: 1 },
    "SAC-172",
    1,
  );
  for (const id of ["one", "two"]) {
    seedAttempt(db, id);
    await store.beginTry(
      run,
      { attempt_id: id, sandbox_id: `impl-${id}`, visit_sequence: 1 },
      "build",
    );
  }
  let millis = Date.parse("2026-09-14T01:00:00Z");
  const allocator = new ImplementationBrowserAllocator(
    store,
    provider,
    "test-account",
    () => new Date(millis),
  );
  return {
    db,
    store,
    provider,
    allocator,
    advance: () => {
      millis += 91_000;
    },
  };
}
test("browser capacity waits without allocation; one browser is reused within only its own try", async () => {
  const f = await fixture();
  try {
    f.provider.available = false;
    await assert.rejects(
      f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com"),
      BrowserCapacityWait,
    );
    assert.equal(f.provider.creates, 0);
    f.provider.available = true;
    const one = await f.allocator.acquire(
      "run-1",
      "one",
      "https://one.trycloudflare.com",
    );
    assert.equal(
      (
        await f.allocator.acquire(
          "run-1",
          "one",
          "https://one.trycloudflare.com",
        )
      ).provider_resource_id,
      one.provider_resource_id,
    );
    assert.equal(f.provider.creates, 1);
    const two = await f.allocator.acquire(
      "run-1",
      "two",
      "https://two.trycloudflare.com",
    );
    assert.notEqual(one.provider_resource_id, two.provider_resource_id);
    await f.allocator.cleanup(one);
    assert.deepEqual(f.provider.live, [two.provider_resource_id]);
    await assert.rejects(
      f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com"),
      /ended/,
    );
  } finally {
    f.db.close();
  }
});
test("reconciliation refreshes only the active try's existing browser and throttles repeat observations", async () => {
  const f = await fixture();
  try {
    const one = await f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com");
    await f.allocator.acquire("run-1", "two", "https://two.trycloudflare.com");
    await f.allocator.keepAlive("run-1", "one");
    assert.deepEqual(f.provider.keptAlive, []);
    f.advance();
    await f.allocator.keepAlive("other-run", "one");
    assert.deepEqual(f.provider.keptAlive, []);
    await f.allocator.keepAlive("run-1", "one");
    await f.allocator.keepAlive("run-1", "one");
    assert.deepEqual(f.provider.keptAlive, [one.provider_resource_id]);
    assert.equal(f.provider.creates, 2);
    f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
    f.advance();
    await f.allocator.keepAlive("run-1", "one");
    assert.deepEqual(f.provider.keptAlive, [one.provider_resource_id]);
    await f.allocator.cleanup((await f.store.resource("two", "browser"))!);
    await f.allocator.keepAlive("run-1", "two");
    assert.deepEqual(f.provider.keptAlive, [one.provider_resource_id]);
  } finally { f.db.close(); }
});

test("provider maintenance avoids connected sessions, detects expiry and disconnects after an actual command", async () => {
  const calls: string[] = [];
  let sessions: Array<{sessionId:string;connectionId?:string}> = [{sessionId:"owned"}];
  let failure: Error | undefined;
  let disconnectFailure: Error | undefined;
  const provider = new CloudflareBrowserProvider({} as never, {
    sessions: async () => sessions,
    launch: async (_binding: unknown, options: {keep_alive:number;guardrails:{allowedDomains:string[]}}) => {
      assert.equal(options.keep_alive, 600_000);
      assert.deepEqual(options.guardrails.allowedDomains, ["owned.trycloudflare.com"]);
      return {sessionId:()=>"owned",disconnect:async()=>{calls.push("launch-disconnect");}};
    },
    connect: async (_binding: unknown, id: string) => {
      calls.push(`connect:${id}`);
      return {
        version: async () => { calls.push("version"); if(failure)throw failure; return "Chrome"; },
        disconnect: async () => { calls.push("disconnect"); if(disconnectFailure)throw disconnectFailure; },
      };
    },
  } as never);
  await (await provider.create("owned.trycloudflare.com")).disconnect();
  calls.length = 0;
  await provider.keepAlive("owned");
  assert.deepEqual(calls, ["connect:owned","version","disconnect"]);
  calls.length = 0;
  sessions = [{sessionId:"owned",connectionId:"busy"}];
  await provider.keepAlive("owned");
  assert.deepEqual(calls, []);
  sessions = [];
  await assert.rejects(provider.keepAlive("owned"), /assigned browser session has ended/);
  assert.deepEqual(calls, []);
  sessions = [{sessionId:"owned"}];
  failure = new Error("original protocol failure");
  await assert.rejects(provider.keepAlive("owned"), error => error===failure);
  assert.deepEqual(calls, ["connect:owned","version","disconnect"]);
  disconnectFailure = new Error("disconnect failed too");
  await assert.rejects(provider.keepAlive("owned"), error => error instanceof AggregateError && error.cause===failure && error.errors[1]===disconnectFailure);
});

test("a real navigation status follows the browser across commands and failed documents cannot become visual proof", async () => {
  let status = 401;
  let screenshots = 0;
  let disconnects = 0;
  const frame = {};
  let onResponse: (response: unknown) => void = () => {};
  const response = () => ({status:()=>status,request:()=>({isNavigationRequest:()=>true}),frame:()=>frame});
  const page = {
    on: (name: string, callback: (response: unknown) => void) => { if(name==='response')onResponse=callback; },
    goto: async () => response(),
    click: async () => { onResponse(response()); },
    mainFrame: () => frame,
    url: () => 'https://owned.trycloudflare.com/settings',
    title: async () => 'Settings',
    content: async () => status===401 ? '{"error":"unauthorized"}' : '<h1>Settings</h1>',
    addStyleTag: async () => {},
    screenshot: async () => { screenshots++; return new Uint8Array([1,2,3]); },
  };
  const api = {connect:async()=>({pages:async()=>[page],disconnect:async()=>{disconnects++;}})} as never;
  const navigate = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'navigate',url:'/settings'},api);
  assert.equal(navigate.documentStatus,401);
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:navigate.documentStatus},api),/HTTP 401/);
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot'},api),/unknown HTTP status/);
  assert.equal(screenshots,0);
  status=200;
  const repaired = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'navigate',url:'/settings'},api);
  const proof = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:repaired.documentStatus},api);
  assert.equal(proof.documentStatus,200);
  assert.equal(screenshots,1);
  status=503;
  const clicked = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'click',selector:'button',documentStatus:200},api);
  assert.equal(clicked.documentStatus,503);
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:clicked.documentStatus},api),/HTTP 503/);
  assert.equal(screenshots,1);
  assert.equal(disconnects,7);
});
test("lost allocation response quarantines this try and never creates a replacement browser", async () => {
  const f = await fixture();
  try {
    f.provider.ambiguous = true;
    await assert.rejects(
      f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com"),
      /response lost/,
    );
    await assert.rejects(
      f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com"),
      /reconciliation/,
    );
    assert.equal(f.provider.creates, 1);
    f.advance();
    await f.allocator.reconcile((await f.store.resource("one", "browser"))!);
    assert.equal(
      f.db.sqlite
        .prepare(
          "SELECT status FROM implementation_tries WHERE attempt_id='one'",
        )
        .get()?.status,
      "manual_reconciliation_required",
    );
    assert.equal(
      f.db.sqlite
        .prepare(
          "SELECT status FROM implementation_tries WHERE attempt_id='two'",
        )
        .get()?.status,
      "running",
    );
    f.provider.live = [];
    await f.allocator.reconcile((await f.store.resource("one", "browser"))!);
    assert.equal(
      (await f.store.resource("one", "browser"))?.status,
      "destroyed",
    );
    assert.equal(f.provider.creates, 1);
  } finally {
    f.db.close();
  }
});
