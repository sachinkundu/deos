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
  async history(id: string) { return {sessionId:id, closeReasonText:'TestClosed'}; }
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

test("an explicit reset replaces one confirmed-ended browser, retains history and cannot replay actions or revive cleanup", async () => {
  const f = await fixture();
  try {
    const origin = 'https://one.trycloudflare.com';
    const first = await f.allocator.acquire('run-1','one',origin);
    assert.equal((await f.allocator.acquire('run-1','one',origin,[],true)).provider_resource_id, first.provider_resource_id);
    f.provider.live = [];
    assert.equal((await f.allocator.acquire('run-1','one',origin)).provider_resource_id, first.provider_resource_id,
      'ordinary operations must not replace a browser and replay an action');
    const cause = new Error('Protocol error: Target closed');
    const failure = await f.allocator.commandFailure(first,cause) as Error & {browserSession:{ended:boolean}};
    assert.equal(failure.cause,cause);assert.equal(failure.browserSession.ended,true);
    assert.match(failure.message,/saved demo list from zero/);
    await f.store.error('run-1','one','tool.browser',failure);
    const replacement = await f.allocator.acquire('run-1','one',origin,[],true);
    assert.notEqual(replacement.provider_resource_id,first.provider_resource_id);
    assert.equal(f.provider.creates,2);
    const metadata=JSON.parse(replacement.metadata_json);
    assert.equal(metadata.replacement.previousSessionId,first.provider_resource_id);
    assert.deepEqual(metadata.origins,[origin]);
    assert.ok(await f.store.bucket.get(metadata.replacement.receipt.key));
    await f.allocator.cleanup(first);
    assert.equal((await f.store.resource('one','browser'))!.status,'ready','stale cleanup cannot destroy replacement ownership');
    assert.deepEqual(f.provider.live,[replacement.provider_resource_id]);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM implementation_effect_errors').get()!.n,1);
    f.provider.live=[];
    await assert.rejects(f.allocator.acquire('run-1','one',origin,[],true),/replacement browser has also ended/);
    assert.equal(f.provider.creates,2,'repeated resets cannot spin up browsers forever');
  } finally {f.db.close();}
});

test("reset does not replace an unconfirmed session, change origins or restart a stopped attempt", async () => {
  for (const mode of ['inventory','origin','stopped','ambiguous-create']) {
    const f=await fixture();
    try {
      const origin='https://one.trycloudflare.com';
      await f.allocator.acquire('run-1','one',origin);
      f.provider.live=[];
      if(mode==='inventory')f.provider.inventory=async()=>{throw new Error('inventory transport failed');};
      if(mode==='stopped')f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
      if(mode==='ambiguous-create')f.provider.ambiguous=true;
      await assert.rejects(f.allocator.acquire('run-1','one',mode==='origin'?'https://foreign.example':origin,[],true));
      assert.equal(f.provider.creates,mode==='ambiguous-create'?2:1);
      if(mode==='ambiguous-create') {
        await assert.rejects(f.allocator.acquire('run-1','one',origin,[],true),/reconciliation/);
        assert.equal(f.provider.creates,2);
        assert.ok(JSON.parse((await f.store.resource('one','browser'))!.metadata_json).replacement);
      }
    } finally {f.db.close();}
  }
});

test('one browser retains its fixed local and checked hosted origins; origin changes need a fresh try', async()=>{
  const f=await fixture();
  try {
    const local='https://one.trycloudflare.com',hosted='https://a1b2c3d4.calculator.pages.dev';
    let allowed:string[]=[];
    const create=f.provider.create.bind(f.provider);
    f.provider.create=async(host:string,additional:string[]=[])=>{allowed=[host,...additional];return create(host);};
    const first=await f.allocator.acquire('run-1','one',local,[hosted]);
    assert.deepEqual(allowed,['one.trycloudflare.com','a1b2c3d4.calculator.pages.dev']);
    assert.equal((await f.allocator.acquire('run-1','one',local,[hosted])).provider_resource_id,first.provider_resource_id);
    await assert.rejects(f.allocator.acquire('run-1','one',local,['https://other.pages.dev']),/cannot change/);
    await assert.rejects(f.allocator.acquire('run-1','one',local),/cannot change/);
    assert.equal(f.provider.creates,1);
  } finally {f.db.close();}
});

test('switching preview targets requires navigation before any page interaction and resets HTTP status',async()=>{
  let clicks=0,url='https://one.trycloudflare.com/',disconnected=0;
  const page={on:()=>{},mainFrame:()=>({}),url:()=>url,click:async()=>{clicks++;},
    addStyleTag:async()=>{},screenshot:async()=>new Uint8Array([1]),
    goto:async(target:string)=>{url=target;return null;},title:async()=> 'Calculator',content:async()=> '<output>3</output>'};
  const api={connect:async()=>({pages:async()=>[page],disconnect:async()=>{disconnected++;}})} as never;
  const hosted='https://a1b2c3d4.calculator.pages.dev';
  await assert.rejects(browserCommand({} as never,'session',hosted,{operation:'click',selector:'button',documentStatus:200},api),/Navigate/);
  assert.equal(clicks,0);
  const navigated=await browserCommand({} as never,'session',hosted,{operation:'navigate',documentStatus:200},api);
  assert.equal(navigated.documentStatus,undefined,'An old successful response cannot authenticate a new page');
  await browserCommand({} as never,'session',hosted,{operation:'screenshot',documentStatus:navigated.documentStatus},api);
  assert.equal(disconnected,3);
});

test("completed browser cleanup retries an unconfirmed close without changing successful work or active browsers", async () => {
  const f = await fixture();
  try {
    const ended = await f.allocator.acquire("run-1", "one", "https://one.trycloudflare.com");
    const active = await f.allocator.acquire("run-1", "two", "https://two.trycloudflare.com");
    f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='one'").run();
    f.db.sqlite.prepare("UPDATE implementation_tries SET status='completed' WHERE attempt_id='one'").run();
    let closes = 0;
    f.provider.close = async (id: string) => {
      assert.equal(id, ended.provider_resource_id);
      closes += 1;
      // A successful close response need not remove the session from inventory immediately.
      if (closes > 1) f.provider.live = f.provider.live.filter(value => value !== id);
    };
    f.db.sqlite.prepare("UPDATE agent_attempts SET cleanup_hold_until='2026-09-15T00:00:00Z' WHERE attempt_id='one'").run();
    await f.allocator.reconcileCompletedAttempts();
    assert.equal(closes, 0);
    f.db.sqlite.prepare("UPDATE agent_attempts SET cleanup_hold_until=NULL WHERE attempt_id='one'").run();
    await f.allocator.reconcileCompletedAttempts();
    assert.equal((await f.store.resource("one", "browser"))!.status, "ready");
    const errors = f.db.sqlite.prepare("SELECT operation,r2_key FROM implementation_effect_errors WHERE attempt_id='one'").all() as Array<{operation:string;r2_key:string}>;
    assert.equal(errors.length, 1);
    assert.equal(errors[0].operation, "cleanup.browser.reconciliation");
    const originalError = await f.store.bucket.get(errors[0].r2_key);
    assert.ok(originalError);
    assert.match(await originalError.text(), /Browser close is not yet confirmed/);
    await f.allocator.reconcileCompletedAttempts();
    const cleaned = (await f.store.resource("one", "browser"))!;
    assert.equal(cleaned.status, "destroyed");
    const receipt = f.db.sqlite.prepare("SELECT cleanup_receipt FROM implementation_resources WHERE resource_id=?").get(cleaned.resource_id)!;
    assert.equal(JSON.parse(String(receipt.cleanup_receipt)).absent, ended.provider_resource_id);
    assert.deepEqual(f.provider.live, [active.provider_resource_id]);
    assert.equal((await f.store.resource("two", "browser"))!.status, "ready");
    assert.equal(f.db.sqlite.prepare("SELECT status FROM implementation_tries WHERE attempt_id='one'").get()!.status, "completed");
    assert.equal(f.db.sqlite.prepare("SELECT status FROM orchestration_runs WHERE run_id='run-1'").get()!.status, "awaiting_human");
    await f.allocator.reconcileCompletedAttempts();
    assert.equal(closes, 2);
    assert.equal(f.db.sqlite.prepare("SELECT COUNT(*) AS n FROM implementation_effect_errors WHERE attempt_id='one'").get()!.n, 1);
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

test("a real navigation status follows the browser across commands and failed documents remain available for review", async () => {
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
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:navigate.documentStatus},api);
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot'},api);
  assert.equal(screenshots,2);
  status=200;
  const repaired = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'navigate',url:'/settings'},api);
  const proof = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:repaired.documentStatus},api);
  assert.equal(proof.documentStatus,200);
  assert.equal(screenshots,3);
  status=503;
  const clicked = await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'click',selector:'button',documentStatus:200},api);
  assert.equal(clicked.documentStatus,503);
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:clicked.documentStatus},api);
  assert.equal(screenshots,4);
  assert.equal(disconnects,7);
});
test("assigned browser dispatches real keys and changes viewport while preserving document status", async () => {
  const keys:string[]=[];
  const viewports:unknown[]=[];
  let disconnects=0;
  let onResponse:(response:unknown)=>void=()=>{};
  const frame={};
  const page={
    on:(name:string,callback:(response:unknown)=>void)=>{if(name==='response')onResponse=callback;},
    mainFrame:()=>frame,
    url:()=> 'https://owned.trycloudflare.com/',
    title:async()=> 'Calculator', content:async()=> '<output>3</output>',
    addStyleTag:async()=>{},screenshot:async()=>new Uint8Array([1]),
    keyboard:{press:async(key:string)=>{keys.push(key);}},
    setViewport:async(viewport:unknown)=>{
      viewports.push(viewport);
      onResponse({status:()=>503,request:()=>({isNavigationRequest:()=>true}),frame:()=>frame});
    },
  };
  const api={connect:async()=>({pages:async()=>[page],disconnect:async()=>{disconnects++;}})} as never;
  for(const key of ['1','+','2','Enter','Escape'])
    await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'press',key,documentStatus:200},api);
  assert.deepEqual(keys,['1','+','2','Enter','Escape']);
  const resized=await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'viewport',width:320,height:640,documentStatus:200},api);
  assert.deepEqual(viewports,[{width:320,height:640,deviceScaleFactor:1}]);
  assert.equal(resized.documentStatus,503,'A viewport-triggered navigation must preserve its actual HTTP status');
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'screenshot',documentStatus:resized.documentStatus},api);
  for(const width of [0,319.5,3841])
    await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'viewport',width,height:640},api),/integers from 200 to 3840/);
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'press'},api),/key name is required/);
  assert.equal(viewports.length,1);
  assert.equal(disconnects,11);
});

test('viewport persists across reconnects through a key action and screenshot',async()=>{
  let width=800,height=600,number='';
  const captures:number[]=[];
  const page={on:()=>{},url:()=> 'https://owned.trycloudflare.com/',
    title:async()=> 'Calculator',content:async()=>number,
    setViewport:async(value:{width:number;height:number})=>{width=value.width;height=value.height;},
    keyboard:{press:async(key:string)=>{number+=key;}},
    addStyleTag:async()=>{},screenshot:async()=>{captures.push(width);return new Uint8Array([width%256]);}};
  const api={connect:async()=>{width=800;height=600;return {pages:async()=>[page],disconnect:async()=>{}};}} as never;
  const resized=await browserCommand({} as never,'owned','https://owned.trycloudflare.com',
    {operation:'viewport',width:320,height:720,documentStatus:200},api);
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',
    {operation:'press',key:'1',viewport:resized.viewport,documentStatus:200},api);
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',
    {operation:'screenshot',viewport:resized.viewport,documentStatus:200},api);
  assert.deepEqual(captures,[320]);assert.equal(height,720);assert.equal(number,'1');
});

test('browser records actual measurements and trace controls; modifier cleanup preserves the original error',async()=>{
  const commands:string[]=[];
  const events:string[]=[];
  const failure=new Error('Original key failure');let failed=false;
  const page={on:()=>{},url:()=> 'https://owned.trycloudflare.com/',title:async()=> 'Calculator',content:async()=>'<output>3</output>',
    evaluate:async(script:string)=>{commands.push(script);return script.startsWith('JSON.stringify')?JSON.stringify({viewport:{width:320},document:{scrollWidth:320,clientWidth:320}}):undefined;},
    keyboard:{down:async(key:string)=>{events.push('down:'+key);},up:async(key:string)=>{events.push('up:'+key);},
      press:async(key:string)=>{events.push('press:'+key);if(failed)throw failure;}}};
  const api={connect:async()=>({pages:async()=>[page],disconnect:async()=>{}})} as never;
  const trace=await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'trace',enabled:true,documentStatus:200},api);
  assert.equal(trace.traceEnabled,true);assert.match(commands[0],/event.isTrusted/);
  const measured=await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'measure',documentStatus:200},api);
  assert.ok('measurements' in measured);
  assert.deepEqual(measured.measurements,{viewport:{width:320},document:{scrollWidth:320,clientWidth:320}});
  await browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'measure',documentStatus:503},api);
  failed=true;
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'press',key:'/',modifiers:['Control'],documentStatus:200},api),error=>error===failure);
  assert.deepEqual(events,['down:Control','press:/','up:Control']);
  await assert.rejects(browserCommand({} as never,'owned','https://owned.trycloudflare.com',{operation:'press',key:'/',modifiers:['Invalid'],documentStatus:200},api),/Invalid keyboard modifiers/);
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
