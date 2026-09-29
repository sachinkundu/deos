import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {retryFailedSharedTestDemo} from '../src/shared-test-demo-retry.ts';

const at=new Date('2026-09-29T07:00:00.000Z');

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO workflow_definitions
    (definition_id,version,project_id,name,canonical_json,digest,created_at)
    VALUES ('implementation',45,'project','implementation','{}',?,?)`)
    .run('d'.repeat(64),at.toISOString());
  db.sqlite.prepare(`INSERT INTO orchestration_runs
    (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,
     definition_version,definition_digest,workflow_instance_id,current_node,
     current_visit_sequence,status,created_at,updated_at)
    VALUES ('run-1','correlation-1',1,'project','issue-1','implementation',45,?,
      'wf-v1-source','shared_test_demo',1,'active',?,?)`)
    .run('d'.repeat(64),at.toISOString(),at.toISOString());
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,
     patch_sha256,state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted',?,?)`)
    .run('a'.repeat(40),'b'.repeat(64),at.toISOString(),at.toISOString());
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,
     team_id,stage,state,fence,base_manifest_id,base_traffic_revision,
     base_json,repository,branch,pull_request_number,candidate_commit,
     patch_sha256,created_at) VALUES
    ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test',
     'team-1','shared_test_demo','active',1,'manifest-1','traffic-1',
     '{}','owner/repo','codex/test',150,?,?,?)`)
    .run('a'.repeat(40),'b'.repeat(64),at.toISOString());
  db.sqlite.prepare(`UPDATE test_environment SET state='active',
    owner_run_id='run-1',owner_lease_id='lease-1',fence=1,
    heartbeat_due_at=?,revision=2 WHERE site_id=1`)
    .run(new Date(at.getTime()+120_000).toISOString());
  db.sqlite.prepare(`INSERT INTO agent_attempts
    (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,
     state,absolute_deadline,ended_at,result_class,cleanup_state,created_at,updated_at)
    VALUES ('attempt-1','sandbox-1','run-1','shared_test_demo','{}',?,
      'blocked',? ,?,'blocked','destroyed',?,?)`)
    .run('c'.repeat(64),new Date(at.getTime()+100_000).toISOString(),
      at.toISOString(),at.toISOString(),at.toISOString());
  db.sqlite.prepare(`INSERT INTO test_failures
    (fault_id,run_id,lease_id,phase,safe_code,first_message,
     causes_json,context_json,occurred_at) VALUES
    ('fault-1','run-1','lease-1','active','test_browser_action_failed',
     'test_app_launch_cookie_invalid','[]','{}',?)`).run(at.toISOString());
  db.sqlite.prepare(`INSERT INTO test_browser_sessions
    (lease_id,service_name,run_id,attempt_id,fence,origin,state,
     operation_id,inventory_json,create_window,session_id,created_at,updated_at)
    VALUES ('lease-1','bettaview','run-1','attempt-1',1,
      'https://bettaview.apps.deos-test.voxdez.com','creating',
      'test-browser:lease-1:bettaview','[]',?,'session-1',?,?)`)
    .run(at.toISOString(),at.toISOString(),at.toISOString());
  return db;
}

test('terminal cookie failure rotates only after browser absence and keeps an audit row',async()=>{
  const db=fixture();
  try {
    const close=async()=>{
      db.sqlite.prepare(`UPDATE test_browser_sessions SET state='absent',
        absent_at=? WHERE lease_id='lease-1'`).run(at.toISOString());
    };
    const env={DB:db as unknown as D1Database,
      IMPLEMENTATION_BROWSER:{} as Env['IMPLEMENTATION_BROWSER']};
    assert.equal(await retryFailedSharedTestDemo(env,'run-1','lease-1',
      'attempt-1',1,at,close),true);
    const lease=db.sqlite.prepare('SELECT attempt_id FROM test_leases').get() as {attempt_id:string};
    assert.notEqual(lease.attempt_id,'attempt-1');
    assert.equal((db.sqlite.prepare('SELECT attempt_id FROM test_lease_requests')
      .get() as {attempt_id:string}).attempt_id,lease.attempt_id);
    assert.deepEqual({...db.sqlite.prepare(`SELECT attempt_id,state,session_id
      FROM test_browser_sessions`).get()},{
        attempt_id:lease.attempt_id,state:'planned',session_id:null});
    assert.equal((db.sqlite.prepare('SELECT ready FROM test_demo_retry_guards')
      .get() as {ready:number}).ready,1);
    assert.equal(await retryFailedSharedTestDemo(env,'run-1','lease-1',
      lease.attempt_id,1,at,close),false);
  }finally{db.close();}
});

test('retry refuses an undestroyed agent and leaves the lease unchanged',async()=>{
  const db=fixture();
  try {
    db.sqlite.prepare(`UPDATE agent_attempts SET cleanup_state='pending'`).run();
    const env={DB:db as unknown as D1Database,
      IMPLEMENTATION_BROWSER:{} as Env['IMPLEMENTATION_BROWSER']};
    assert.equal(await retryFailedSharedTestDemo(env,'run-1','lease-1',
      'attempt-1',1,at,async()=>{throw new Error('must not close');}),false);
    assert.equal((db.sqlite.prepare('SELECT attempt_id FROM test_leases')
      .get() as {attempt_id:string}).attempt_id,'attempt-1');
  }finally{db.close();}
});
