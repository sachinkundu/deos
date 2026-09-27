import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestAppSessionStore} from '../src/shared-test-app-session.ts';
import {SharedTestAppLauncher} from '../src/shared-test-app-launcher.ts';
import {sharedTestServicePlans} from '../src/shared-test-service-plan.ts';

const leaseId='a'.repeat(64),origin=`https://portal-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`;
const clientId='client-1';
const subject={runId:'run-1',attemptId:'attempt-1',leaseId,fence:1,origin,
  accessIdentityId:'identity-1',principalSha256:createHash('sha256')
    .update(`service:${clientId}`).digest('hex')};

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('c'.repeat(40),'d'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','version-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`)
    .run(leaseId,'c'.repeat(40),'d'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(leaseId);
  db.sqlite.prepare(`INSERT INTO test_access_identities
    (identity_id,run_id,lease_id,resource_id,origin,audience,policy_id,
     principal_sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run('identity-1','run-1',leaseId,'access-resource-1',origin,'audience-1',
      'policy-1',subject.principalSha256,'now');
  return db;
}

test('one-use launch creates a host-only session that checks the live fence',async()=>{
  const db=fixture();
  try {
    const store=new SharedTestAppSessionStore(db as unknown as D1Database);
    const {code}=await store.issue(subject);
    const {cookie}=await store.redeemCode(code,origin,subject.principalSha256);
    assert.match(cookie,/^__Host-deos_test=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly;/);
    const session=cookie.match(/^__Host-deos_test=([^;]+)/)![1];
    assert.equal(await store.authorize({session,origin,
      principalSha256:subject.principalSha256}),true);
    await assert.rejects(store.redeem(subject,code));
    await assert.rejects(store.redeemCode(code,origin,'e'.repeat(64)),
      /launch_code_missing/);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_app_sessions').get()?.n,1);
    assert.equal(await store.authorize({session,origin,
      principalSha256:'e'.repeat(64)}),false);
    db.sqlite.prepare(`UPDATE test_environment SET fence=2,state='quiescing'
      WHERE site_id=1`).run();
    assert.equal(await store.authorize({session,origin,
      principalSha256:subject.principalSha256}),false);
  } finally {db.close();}
});

test('launch cannot use another origin or a revoked identity',async()=>{
  const db=fixture();
  try {
    const store=new SharedTestAppSessionStore(db as unknown as D1Database);
    await assert.rejects(store.issue({...subject,origin:'https://deos.voxdez.com'}),
      /subject_invalid/);
    await assert.rejects(store.issue({...subject,origin:
      'https://other.apps.deos-test.voxdez.com'}),/test_app_launch_fenced/);
    db.sqlite.prepare(`UPDATE test_access_identities SET revoked_at='now'
      WHERE identity_id='identity-1'`).run();
    await assert.rejects(store.issue(subject),/test_app_launch_fenced/);
  } finally {db.close();}
});

test('expired code cannot leave a used code or session after the guarded batch',async()=>{
  const db=fixture();
  try {
    const store=new SharedTestAppSessionStore(db as unknown as D1Database);
    const at=new Date('2026-01-01T00:00:00Z');
    const {code}=await store.issue(subject,at);
    await assert.rejects(store.redeem(subject,code,new Date('2026-01-01T00:06:00Z')));
    assert.equal(db.sqlite.prepare(`SELECT used_at FROM test_app_launch_codes`).get()?.used_at,null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_app_sessions').get()?.n,0);
  } finally {db.close();}
});

test('trusted launcher redeems code without giving it to the agent or page',async()=>{
  const db=fixture();
  try {
    const plan=sharedTestServicePlans(leaseId,{revision:'traffic-1',services:[{
      serviceName:'portal',sourceCommit:'c'.repeat(40),deployVersion:'base-1',
      buildInputSha256:'d'.repeat(64),trafficPercent:100,
    }]})[0];
    let calls=0;
    const fetcher:typeof fetch=async (url,init)=>{
      calls++;
      assert.equal(String(url),`${origin}/__deos/launch`);
      assert.equal((init!.headers as Record<string,string>)['CF-Access-Client-Secret'],
        'secret-1');
      const request=JSON.parse(String(init!.body));
      const result=await new SharedTestAppSessionStore(db as unknown as D1Database)
        .redeemCode(request.code,origin,subject.principalSha256);
      return new Response(null,{status:204,headers:{'Set-Cookie':result.cookie}});
    };
    const launched=await new SharedTestAppLauncher(db as unknown as D1Database,
      clientId,'secret-1',fetcher).launch({...subject,plan});
    assert.equal(launched.origin,origin);
    assert.equal(launched.cookie.domain,new URL(origin).hostname);
    assert.equal(launched.cookie.httpOnly,true);
    assert.equal('code' in launched,false);
    assert.equal(calls,1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_app_sessions').get()?.n,1);
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2
      WHERE site_id=1`).run();
    await assert.rejects(new SharedTestAppLauncher(db as unknown as D1Database,
      clientId,'secret-1',fetcher).launch({...subject,plan}),/shared_test_write_fenced/);
    assert.equal(calls,1);
  }finally{db.close();}
});
