import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestResourceCleanup} from '../src/shared-test-resource-cleanup.ts';
import {sharedTestServicePlans,sharedTestStorePlans} from '../src/shared-test-service-plan.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';
import {requiredProofKinds} from '../src/shared-test-close.ts';

const leaseId='a'.repeat(64),runId='run-1';
const base:StableStagingBase={revision:'stable',services:[
  {serviceName:'portal',sourceCommit:'b'.repeat(40),
    deployVersion:'11111111-1111-4111-8111-111111111111',
    buildInputSha256:'c'.repeat(64),trafficPercent:100},
]};
const service=sharedTestServicePlans(leaseId,base)[0];
const stores=sharedTestStorePlans(leaseId,base);

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES ('request-1',?,1,'attempt-1','issue-1',
     ?,?,'granted','now','now')`).run(runId,'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1',?,'attempt-1','issue-1','SAC-182','Test','team-1',
     'shared_test_demo','cleaning',1,'manifest-1','stable',?,'owner/repo',
     'codex/test',150,?,?,'now')`)
    .run(leaseId,runId,JSON.stringify(base),'d'.repeat(40),'e'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='cleaning',owner_run_id=?,
    owner_lease_id=?,fence=2 WHERE site_id=1`).run(runId,leaseId);
  for (const fence of [1,2]) db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at)
    VALUES (?,?,?,'test',?,'now')`).run(leaseId,fence,runId,fence);
  for (const plan of [service,...stores]) db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     remote_id,work_id,created_at,updated_at) VALUES (?,?,?,1,?,'created',?,?,?,
     'now','now')`).run(plan.resourceId,runId,leaseId,
      'kind' in plan ? plan.kind : 'test_worker',
      'canonicalHost' in plan ? plan.canonicalHost : plan.providerName,
      'workerName' in plan ? plan.workerName : plan.providerName,plan.workId);
  for (const kind of requiredProofKinds) db.sqlite.prepare(`INSERT INTO test_proof_items
    (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
     source_sha256,object_key,content_type,byte_count,public_sha256,
     public_url,body_marker,read_at,projected_at,sanitizer_result)
    VALUES (?,?,?,'first',?,'public_safe','owner','x','key','text/plain',1,
      'y','https://example.com/proof','marker','now','now','passed')`)
    .run(`proof:${kind}`,runId,leaseId,kind);
  return db;
}

test('cleanup removes Worker before stores, reads each absent twice, and is repeatable',async()=>{
  const db=fixture();
  try {
    const calls:string[]=[];
    let worker=true;
    const remote=new Set(stores.map(store=>store.providerName));
    const cleanup=new SharedTestResourceCleanup(db as unknown as D1Database,{
      lookup:async()=>{calls.push('worker-read');return worker?{
        workerName:service.workerName,sourceCommit:service.base.sourceCommit,
        baseVersionId:service.base.deployVersion,
        buildInputSha256:service.base.buildInputSha256}:null;},
      remove:async()=>{calls.push('worker-remove');worker=false;},
    },{
      lookup:async plan=>{calls.push(`store-read:${plan.providerKey}`);
        return remote.has(plan.providerKey)?plan.providerKey:null;},
      create:async()=>{throw new Error('unexpected create');},
      remove:async plan=>{calls.push(`store-remove:${plan.providerKey}`);
        remote.delete(plan.providerKey);},
    });
    const input={runId,leaseId,createFence:1,cleanupFence:2};
    await cleanup.resume(input);
    assert.ok(calls.indexOf('worker-remove')<calls.findIndex(call=>call.startsWith('store-remove')));
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
      WHERE lease_id=? AND plan_state='absent'`).get(leaseId)?.n,3);
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_cleanup_checks
      WHERE lease_id=? AND read_state='absent'`).get(leaseId)?.n,3);
    const count=calls.length;
    await cleanup.resume(input);
    assert.equal(calls.length,count);
  } finally {db.close();}
});

test('cleanup refuses wrong remote identity and retains owned resource',async()=>{
  const db=fixture();
  try {
    const cleanup=new SharedTestResourceCleanup(db as unknown as D1Database,{
      lookup:async()=>({workerName:service.workerName,sourceCommit:'wrong',
        baseVersionId:service.base.deployVersion,
        buildInputSha256:service.base.buildInputSha256}),
      remove:async()=>{throw new Error('must not remove');},
    },{lookup:async()=>null,create:async()=>'',remove:async()=>{}});
    await assert.rejects(cleanup.resume({runId,leaseId,createFence:1,
      cleanupFence:2}),/worker_identity_changed/);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE resource_id=?`).get(service.resourceId)?.plan_state,'created');
  } finally {db.close();}
});

test('cleanup cannot delete before proof or after another cleanup fence takes over',async()=>{
  const db=fixture();
  try {
    let removes=0;
    const cleanup=new SharedTestResourceCleanup(db as unknown as D1Database,{
      lookup:async()=>({workerName:service.workerName,
        sourceCommit:service.base.sourceCommit,
        baseVersionId:service.base.deployVersion,
        buildInputSha256:service.base.buildInputSha256}),
      remove:async()=>{removes++;},
    },{lookup:async()=>null,create:async()=>'',remove:async()=>{removes++;}});
    db.sqlite.prepare(`DELETE FROM test_proof_items WHERE kind='app_screen'`).run();
    await assert.rejects(cleanup.resume({runId,leaseId,createFence:1,
      cleanupFence:2}),/proof_missing/);
    assert.equal(removes,0);
    db.sqlite.prepare(`UPDATE test_environment SET fence=3 WHERE site_id=1`).run();
    await assert.rejects(cleanup.resume({runId,leaseId,createFence:1,
      cleanupFence:2}),/cleanup_fenced/);
    assert.equal(removes,0);
  } finally {db.close();}
});

test('cleanup can finish after preparation stopped before any resource plan',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare('DELETE FROM test_resources WHERE lease_id=?').run(leaseId);
    let workerReads=0,storeReads=0,removes=0;
    const cleanup=new SharedTestResourceCleanup(db as unknown as D1Database,{
      lookup:async()=>{workerReads++;return null;},
      remove:async()=>{removes++;},
    },{
      lookup:async()=>{storeReads++;return null;},
      create:async()=>{throw new Error('unexpected create');},
      remove:async()=>{removes++;},
    });
    await cleanup.resume({runId,leaseId,createFence:1,cleanupFence:2});
    assert.equal(workerReads,2);
    assert.equal(storeReads,stores.length*2);
    assert.equal(removes,0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_cleanup_checks').get()?.n,0);
  } finally {db.close();}
});

test('cleanup holds the site if an unplanned remote resource exists',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare('DELETE FROM test_resources WHERE resource_id=?')
      .run(service.resourceId);
    let removes=0;
    const cleanup=new SharedTestResourceCleanup(db as unknown as D1Database,{
      lookup:async()=>({workerName:service.workerName,
        sourceCommit:service.base.sourceCommit,
        baseVersionId:service.base.deployVersion,
        buildInputSha256:service.base.buildInputSha256}),
      remove:async()=>{removes++;},
    },{lookup:async()=>null,create:async()=>'',remove:async()=>{removes++;}});
    await assert.rejects(cleanup.resume({runId,leaseId,createFence:1,
      cleanupFence:2}),/unplanned_worker/);
    assert.equal(removes,0);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'cleaning');
  } finally {db.close();}
});
