import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestAppLauncher} from '../src/shared-test-app-launcher.ts';
import {SharedTestAppSessionStore} from '../src/shared-test-app-session.ts';
import {SharedTestBrowser} from '../src/shared-test-browser.ts';
import {SharedTestBrowserStore} from '../src/shared-test-browser-store.ts';
import {SharedTestBrowserCleanup} from '../src/shared-test-browser-cleanup.ts';
import type {TestBrowserProvider} from '../src/shared-test-browser-provider.ts';
import {sharedTestServicePlans} from '../src/shared-test-service-plan.ts';

const leaseId='a'.repeat(64),runId='run-1',attemptId='attempt-1';
const base={revision:'traffic-1',services:[{serviceName:'portal',
  sourceCommit:'b'.repeat(40),deployVersion:'base-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100}]};
const plan=sharedTestServicePlans(leaseId,base)[0];
const origin=`https://${plan.canonicalHost}`;
const clientId='client-1';
const principal=createHash('sha256').update(`service:${clientId}`).digest('hex');
const scope={runId,attemptId,leaseId,fence:1,plan};

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at)
    VALUES ('request-1',?,1,?,'issue-1',?,?,'granted','now','now')`)
    .run(runId,attemptId,'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1',?,?,'issue-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','traffic-1',?,
      'owner/repo','codex/test',150,?,?,'now')`)
    .run(leaseId,runId,attemptId,JSON.stringify(base),'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id=?,
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(runId,leaseId);
  db.sqlite.prepare(`INSERT INTO test_access_identities
    (identity_id,run_id,lease_id,resource_id,origin,audience,policy_id,
     principal_sha256,created_at) VALUES
    ('identity-1',?,?,?,?,'audience-1','policy-1',?,'now')`)
    .run(runId,leaseId,`test-access:${leaseId}:portal`,origin,principal);
  return db;
}

function launcher(db:ImplementationTestDatabase) {
  const fetcher:typeof fetch=async (_url,init)=>{
    const {code}=JSON.parse(String(init!.body));
    const session=await new SharedTestAppSessionStore(db as unknown as D1Database)
      .redeemCode(code,origin,principal);
    return new Response(null,{status:204,headers:{'Set-Cookie':session.cookie}});
  };
  return new SharedTestAppLauncher(db as unknown as D1Database,clientId,
    'secret-1',fetcher);
}

test('owned browser starts after trusted launch and rejects a later fence',async()=>{
  const db=fixture();
  try {
    const sessions:string[]=[];
    let prepared=false,prepares=0,creates=0;
    const provider={
      inventory:async()=>[...sessions],
      capacity:async()=>({available:true,retryAfterMs:1000}),
      create:async(host:string)=>{
        assert.equal(host,plan.canonicalHost);
        creates++;sessions.push('browser-1');
        return {id:'browser-1',disconnect:async()=>{}};
      },
      prepare:async(_id:string,_origin:string,cookie:{httpOnly:boolean})=>{
        assert.equal(cookie.httpOnly,true);prepared=true;prepares++;
      },
      command:async()=>({url:origin,title:'Test',content:'<html>ready</html>'}),
      close:async(id:string)=>{sessions.splice(sessions.indexOf(id),1);},
    } as unknown as TestBrowserProvider;
    const browser=new SharedTestBrowser(new SharedTestBrowserStore(db as unknown as D1Database),
      provider,launcher(db),async()=>true);
    assert.equal((await browser.open(scope)).state,'ready');
    assert.equal(prepared,true);
    assert.equal((await browser.open(scope)).session_id,'browser-1');
    assert.equal(creates,1);
    assert.deepEqual(await browser.command(scope,{operation:'state'}),{
      url:origin,title:'Test',content:'<html>ready</html>'});
    db.sqlite.prepare(`UPDATE test_browser_sessions SET prepared_until=?
      WHERE lease_id=?`).run(new Date(Date.now()+30_000).toISOString(),leaseId);
    await browser.command(scope,{operation:'state'});
    assert.equal(prepares,2);
    assert.ok(Date.parse(String(db.sqlite.prepare(`SELECT prepared_until
      FROM test_browser_sessions WHERE lease_id=?`).get(leaseId)?.prepared_until))
      >Date.now()+12*60_000);
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2
      WHERE site_id=1`).run();
    await assert.rejects(browser.command(scope,{operation:'state'}),/shared_test_write_fenced/);
    await new SharedTestBrowserCleanup(new SharedTestBrowserStore(db as unknown as D1Database),
      provider).resume(leaseId,runId);
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'absent');
  }finally{db.close();}
});

test('unknown browser create outcome is retained and never retried as new',async()=>{
  const db=fixture();
  try {
    let creates=0;
    const provider={
      inventory:async()=>[],capacity:async()=>({available:true,retryAfterMs:1000}),
      create:async()=>{creates++;throw new Error('socket lost after create');},
    } as unknown as TestBrowserProvider;
    const browser=new SharedTestBrowser(new SharedTestBrowserStore(db as unknown as D1Database),
      provider,launcher(db),async()=>true);
    await assert.rejects(browser.open(scope),/provider_create_failed/);
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'creating');
    await assert.rejects(browser.open(scope),/create_outcome_uncertain/);
    assert.equal(creates,1);
    const cleanup=new SharedTestBrowserCleanup(new SharedTestBrowserStore(db as unknown as D1Database),
      provider);
    await assert.rejects(cleanup.resume(leaseId,runId),/create_outcome_pending/);
    await cleanup.resume(leaseId,runId,new Date(Date.now()+11*60_000));
    assert.equal((await new SharedTestBrowserStore(db as unknown as D1Database)
      .row(leaseId,'portal'))?.state,'absent');
  }finally{db.close();}
});
