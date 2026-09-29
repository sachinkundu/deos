import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestCloseStore} from '../src/shared-test-close.ts';
import {SharedTestLeaseStore} from '../src/shared-test-lease.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,
     patch_sha256,state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,
     team_id,stage,state,fence,base_manifest_id,base_traffic_revision,
     base_json,repository,branch,pull_request_number,candidate_commit,
     patch_sha256,created_at) VALUES
    ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test',
     'team-1','shared_test_demo','quiescing',1,'manifest-1','traffic-1',
     '{}','owner/repo','codex/test',150,?,?,'now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',
    saved_phase='preparing',owner_run_id='run-1',owner_lease_id='lease-1',
    fence=2,revision=2 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_failures
    (fault_id,run_id,lease_id,phase,safe_code,first_message,
     causes_json,context_json,occurred_at) VALUES
    ('fault-1','run-1','lease-1','preparing','test_setup_failed',
     'HTTP 302','[]','{}','now')`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_aborts
    (lease_id,run_id,first_fault_id,proof_body_sha256,proof_read_at)
    VALUES ('lease-1','run-1','fault-1',?,'now')`).run('c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,
     provider_key,work_id,created_at,updated_at) VALUES
    ('resource-1','run-1','lease-1',1,'test_worker','created',
     'portal.apps.deos-test.voxdez.com','work-1','now','now')`).run();
  return db;
}

test('failed setup closes only after owned absence and never passes the test',async()=>{
  const db=fixture();
  try {
    const close=new SharedTestCloseStore(db as unknown as D1Database);
    const requests=new SharedTestLeaseStore(db as unknown as D1Database);
    const current=()=>requests.currentRequest('run-1','issue-1','a'.repeat(40),
      'b'.repeat(64));
    assert.equal((await current())?.request_id,'request-1');
    await close.cleaningFailedSetup('run-1','lease-1',2);
    await assert.rejects(close.abortFailedSetup('run-1','lease-1',2),
      /absence_missing/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,
      'cleaning');
    db.sqlite.prepare(`UPDATE test_resources SET plan_state='absent',
      cleanup_state='absent',absent_at='now' WHERE resource_id='resource-1'`).run();
    db.sqlite.prepare(`INSERT INTO test_cleanup_checks
      (lease_id,resource_id,remove_work_id,remove_state,read_state,checked_at)
      VALUES ('lease-1','resource-1','remove-1','done','absent','now')`).run();
    const receipt=await close.abortFailedSetup('run-1','lease-1',2);
    assert.equal(receipt.kind,'failed_setup');
    assert.deepEqual(await close.abortFailedSetup('run-1','lease-1',2),receipt);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,
      'free');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_leases').get()?.state,
      'closed');
    assert.equal(await current(),null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_attestations')
      .get()?.n,0);
    assert.equal(db.sqlite.prepare('SELECT ready FROM test_lease_abort_guards')
      .get()?.ready,1);
  } finally {db.close();}
});

test('an activated lease cannot take the failed setup path',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare(`UPDATE test_leases SET activated_at='now'`).run();
    await assert.rejects(new SharedTestCloseStore(db as unknown as D1Database)
      .cleaningFailedSetup('run-1','lease-1',2),/not_ready/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,
      'quiescing');
  } finally {db.close();}
});
