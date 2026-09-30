import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestStoreCleanup} from '../src/shared-test-store-cleanup.ts';
import {sharedTestStorePlans} from '../src/shared-test-service-plan.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';
import type {TestStoreCleanupProvider} from '../src/shared-test-store-provisioner.ts';

const leaseId='a'.repeat(64),runId='run-1',fence=2;
const base:StableStagingBase={revision:'traffic-1',services:[{
  serviceName:'portal',sourceCommit:'b'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100,
}]};
const stores=sharedTestStorePlans(leaseId,base);

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('b'.repeat(40),'c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','cleaning',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run(leaseId,'b'.repeat(40),'c'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='cleaning',owner_run_id='run-1',
    owner_lease_id=?,fence=2 WHERE site_id=1`).run(leaseId);
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at) VALUES
    (?,1,'run-1','grant',1,'now'),(?,2,'run-1','quiesce',2,'now')`)
    .run(leaseId,leaseId);
  const remote=new Map<string,string>();
  for (const store of stores) {
    const id=store.kind==='d1_database'?'11111111-1111-4111-8111-111111111111':
      store.providerName;
    remote.set(store.providerName,id);
    db.sqlite.prepare(`INSERT INTO test_resources
      (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
       remote_id,work_id,created_at,updated_at)
      VALUES (?,'run-1',?,1,?,'created',?,?,?,'now','now')`)
      .run(store.resourceId,leaseId,store.kind,store.providerName,id,store.workId);
  }
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     remote_id,work_id,cleanup_state,absent_at,created_at,updated_at)
    VALUES ('worker-1','run-1',?,1,'test_worker','absent','portal.example',
      'worker-1','worker-create-1','absent','now','now','now')`).run(leaseId);
  db.sqlite.prepare(`INSERT INTO test_cleanup_checks
    (lease_id,resource_id,remove_work_id,remove_state,read_state,checked_at)
    VALUES (?,'worker-1','worker-remove-1','done','absent','now')`).run(leaseId);
  const proofKinds=['app_screen','linear_screen','showboat','d1_read',
    'provider_receipt','github_receipt'];
  for (const [index,kind] of proofKinds.entries()) db.sqlite.prepare(`INSERT INTO test_proof_items
    (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
     sanitizer_result,source_sha256,object_key,content_type,byte_count,
     public_sha256,public_url,body_marker,read_at,projected_at)
    VALUES (?,'run-1',?,'proof',?,'public_safe','v1','passed',?,?,'image/png',1,
      ?,'https://example.com/proof','marker','now','now')`)
    .run(`proof-${index}`,leaseId,kind,'d'.repeat(64),`raw/${index}`,'e'.repeat(64));
  let removes=0;
  const provider:TestStoreCleanupProvider={
    lookup:async plan=>remote.get(plan.providerKey)??null,
    create:async()=>{throw new Error('must not create during cleanup');},
    remove:async(plan,id)=>{
      assert.equal(remote.get(plan.providerKey),id);
      removes++;remote.delete(plan.providerKey);
    },
  };
  return {db,remote,provider,removes:()=>removes};
}

test('cleanup removes only owned fixed names after proof and records two absence reads',async()=>{
  const f=fixture();
  try {
    const cleanup=new SharedTestStoreCleanup(f.db as unknown as D1Database,f.provider);
    await cleanup.remove({runId,leaseId,fence,base});
    await cleanup.remove({runId,leaseId,fence,base});
    assert.equal(f.removes(),2);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
      WHERE plan_state='absent'`).get()?.n,3);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resource_absence_guards`)
      .get()?.n,2);
    assert.equal(f.db.sqlite.prepare(`SELECT state FROM test_environment`).get()?.state,'cleaning');
  } finally {f.db.close();}
});

test('missing projected proof prevents any provider delete',async()=>{
  const f=fixture();
  try {
    f.db.sqlite.prepare(`UPDATE test_proof_items SET projected_at=NULL
      WHERE kind='linear_screen'`).run();
    await assert.rejects(new SharedTestStoreCleanup(f.db as unknown as D1Database,f.provider)
      .remove({runId,leaseId,fence,base}),/not_ready/);
    assert.equal(f.removes(),0);
  } finally {f.db.close();}
});

test('a missing Worker absence receipt prevents store deletion',async()=>{
  const f=fixture();
  try {
    f.db.sqlite.prepare(`DELETE FROM test_cleanup_checks WHERE resource_id='worker-1'`).run();
    await assert.rejects(new SharedTestStoreCleanup(f.db as unknown as D1Database,f.provider)
      .remove({runId,leaseId,fence,base}),/not_ready/);
    assert.equal(f.removes(),0);
  } finally {f.db.close();}
});

test('changed remote identity blocks deletion and retains ownership',async()=>{
  const f=fixture();
  try {
    f.remote.set(stores[0].providerName,'22222222-2222-4222-8222-222222222222');
    await assert.rejects(new SharedTestStoreCleanup(f.db as unknown as D1Database,f.provider)
      .remove({runId,leaseId,fence,base}),/remote_changed/);
    assert.equal(f.removes(),0);
    assert.equal(f.db.sqlite.prepare(`SELECT state FROM test_environment`).get()?.state,'cleaning');
  } finally {f.db.close();}
});
