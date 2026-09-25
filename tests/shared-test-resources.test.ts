import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestResourceStore} from '../src/shared-test-resources.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','task-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','task-1','SAC-1','Test','team-1',
      'shared_test_demo','preparing',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='preparing',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at)
    VALUES ('lease-1',1,'run-1','grant',1,'now')`).run();
  const plan={resourceId:'resource-1',runId:'run-1',leaseId:'lease-1',fence:1,
    kind:'test_worker',providerKey:'test-lease-1-worker',workId:'create-worker-1'};
  return {db,store:new SharedTestResourceStore(db as unknown as D1Database),plan};
}

test('resource plan precedes an uncertain remote create and cleanup uses fence history',async()=>{
  const {db,store,plan}=fixture();
  try {
    assert.equal((await store.plan(plan)).plan_state,'planned');
    assert.equal((await store.plan(plan)).work_id,plan.workId);
    assert.equal((await store.beginCreate(plan)).plan_state,'creating');
    await store.uncertain(plan,'read-by-fixed-provider-name');
    await store.created(plan,'remote-version-1');
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2 WHERE site_id=1`).run();
    db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
      (lease_id,fence,run_id,reason,transition_revision,created_at)
      VALUES ('lease-1',2,'run-1','quiesce',2,'now')`).run();
    await assert.rejects(store.beginCreate(plan),/fenced/);
    assert.equal((await store.cleanupScope({resourceId:plan.resourceId,runId:plan.runId,
      leaseId:plan.leaseId,fence:2})).remote_id,'remote-version-1');
    await assert.rejects(store.cleanupScope({resourceId:plan.resourceId,runId:'another-run',
      leaseId:plan.leaseId,fence:2}),/fenced/);
    await store.absent({resourceId:plan.resourceId,runId:plan.runId,leaseId:plan.leaseId,
      fence:2,removeWorkId:'remove-worker-1',providerAbsent:true});
    await store.absent({resourceId:plan.resourceId,runId:plan.runId,leaseId:plan.leaseId,
      fence:2,removeWorkId:'remove-worker-1',providerAbsent:true});
    assert.equal(db.sqlite.prepare("SELECT plan_state FROM test_resources WHERE resource_id='resource-1'").get()?.plan_state,
      'absent');
  } finally {db.close();}
});
