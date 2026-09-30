import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestActivation} from '../src/shared-test-activation.ts';
import {sharedTestServicePlans,sharedTestStorePlans} from '../src/shared-test-service-plan.ts';
import {SharedTestLeaseStore,type StableStagingBase} from '../src/shared-test-lease.ts';

const leaseId='a'.repeat(64),runId='run-1',attemptId='attempt-1',fence=1;
const at=new Date('2026-09-25T10:00:00Z');
const base:StableStagingBase={revision:'staging-revision',services:[
  {serviceName:'bettaview',sourceCommit:'b'.repeat(40),
    deployVersion:'11111111-1111-4111-8111-111111111111',
    buildInputSha256:'c'.repeat(64),trafficPercent:100},
  {serviceName:'portal',sourceCommit:'d'.repeat(40),
    deployVersion:'22222222-2222-4222-8222-222222222222',
    buildInputSha256:'e'.repeat(64),trafficPercent:100},
]};
const plans=sharedTestServicePlans(leaseId,base);
const stores=sharedTestStorePlans(leaseId,base);

test('isolated Worker names are fixed to the full lease and service base',()=>{
  assert.deepEqual(plans.map(plan=>plan.serviceName),['portal','bettaview']);
  assert.equal(plans[1].workerName,`deos-test-bettaview-${leaseId.slice(0,32)}`);
  assert.equal(plans[1].canonicalHost,
    `bettaview-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`);
  assert.notEqual(sharedTestServicePlans('b'.repeat(64),base)[0].workerName,
    plans[0].workerName);
  assert.throws(()=>sharedTestServicePlans(leaseId,{...base,services:[...base.services,base.services[0]]}),
    /invalid_shared_test_service_base/);
  assert.deepEqual(stores.map(store=>store.kind),['d1_database','r2_bucket']);
  assert.ok(stores.every(store=>store.providerName.includes(leaseId.slice(0,32))));
});

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES (?,?,1,?,? ,?,?,'granted','now','now')`)
    .run('request-1',runId,attemptId,'issue-1','f'.repeat(40),'1'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?, 'request-1', ?, ?, 'issue-1', 'SAC-182', 'Test', 'team-1',
      'shared_test_demo','preparing',?,'manifest-1',?,?,'owner/repo','codex/test',150,
      ?,?,'now')`)
    .run(leaseId,runId,attemptId,fence,base.revision,JSON.stringify(base),
      'f'.repeat(40),'1'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='preparing',owner_run_id=?,
    owner_lease_id=?,fence=?,heartbeat_due_at='2026-09-25T10:02:00Z' WHERE site_id=1`)
    .run(runId,leaseId,fence);
  for (const plan of plans) db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     remote_id,work_id,created_at,updated_at)
    VALUES (?,?,?,?,'test_worker','created',?,?,?,'now','now')`)
    .run(plan.resourceId,runId,leaseId,fence,plan.canonicalHost,plan.workerName,plan.workId);
  for (const store of stores) db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     remote_id,work_id,created_at,updated_at)
    VALUES (?,?,?, ?,?,'created',?,?,?,'now','now')`)
    .run(store.resourceId,runId,leaseId,fence,store.kind,store.providerName,
      store.kind==='d1_database'?'database-uuid':store.providerName,store.workId);
  return db;
}

function version(plan:typeof plans[number]) {
  return {canonicalHost:plan.canonicalHost,sourceSha:plan.base.sourceCommit,
    baseVersionId:plan.base.deployVersion,buildInputSha256:plan.base.buildInputSha256,
    versionId:'33333333-3333-4333-8333-333333333333'};
}

test('only complete matching test service readbacks activate the lease',async()=>{
  const db=fixture();
  try {
    const reads:string[]=[];
    const gate=new SharedTestActivation(db as unknown as D1Database,async plan=>{
      reads.push(plan.serviceName);
      return Response.json(version(plan));
    });
    await gate.activate({runId,attemptId,leaseId,fence},at);
    assert.deepEqual(reads,['portal','bettaview','portal','bettaview']);
    assert.equal((await new SharedTestLeaseStore(db as unknown as D1Database).environment()).state,'active');
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_service_readbacks`).get()?.n,2);
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_service_activation_guards`).get()?.n,1);
    await new SharedTestLeaseStore(db as unknown as D1Database)
      .assertWrite(runId,attemptId,leaseId,fence,at);
  } finally {db.close();}
});

test('wrong base version or a changing runtime version leaves writes fenced',async()=>{
  for (const kind of ['wrong-base','changed-version']) {
    const db=fixture();
    try {
      let reads=0;
      const gate=new SharedTestActivation(db as unknown as D1Database,async plan=>{
        reads++;
        const value=version(plan);
        if (kind==='wrong-base' && plan.serviceName==='portal') value.baseVersionId='wrong';
        if (kind==='changed-version' && reads>2) value.versionId='44444444-4444-4444-8444-444444444444';
        return Response.json(value);
      });
      await assert.rejects(gate.activate({runId,attemptId,leaseId,fence},at),
        kind==='wrong-base' ? /test_service_version_mismatch/ : /test_service_version_changed/);
      assert.equal((await new SharedTestLeaseStore(db as unknown as D1Database).environment()).state,
        'preparing');
      assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_service_readbacks`).get()?.n,0);
    } finally {db.close();}
  }
});

test('expiry during remote read rolls back every activation write',async()=>{
  const db=fixture();
  try {
    let reads=0;
    const gate=new SharedTestActivation(db as unknown as D1Database,async plan=>{
      if (++reads===2) db.sqlite.prepare(`UPDATE test_environment
        SET heartbeat_due_at='2026-09-25T09:59:00Z' WHERE site_id=1`).run();
      return Response.json(version(plan));
    });
    await assert.rejects(gate.activate({runId,attemptId,leaseId,fence},at));
    assert.equal((await new SharedTestLeaseStore(db as unknown as D1Database).environment()).state,
      'preparing');
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_service_readbacks`).get()?.n,0);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_leases WHERE lease_id=?`).get(leaseId)?.state,
      'preparing');
  } finally {db.close();}
});

test('missing isolated Worker record blocks activation before remote reads',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare(`DELETE FROM test_resources WHERE resource_id=?`).run(plans[0].resourceId);
    const gate=new SharedTestActivation(db as unknown as D1Database,async()=>{
      throw new Error('should not read');
    });
    await assert.rejects(gate.activate({runId,attemptId,leaseId,fence},at),
      /test_activation_resources_incomplete/);
  } finally {db.close();}
});

test('missing isolated data store blocks activation before remote reads',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare(`DELETE FROM test_resources WHERE resource_id=?`).run(stores[0].resourceId);
    const gate=new SharedTestActivation(db as unknown as D1Database,async()=>{
      throw new Error('should not read');
    });
    await assert.rejects(gate.activate({runId,attemptId,leaseId,fence},at),
      /test_activation_resources_incomplete/);
  } finally {db.close();}
});
