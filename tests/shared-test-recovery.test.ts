import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
import {SharedTestRecovery} from '../src/shared-test-recovery.ts';
import {testIssueMarker} from '../src/shared-test-marker.ts';

async function fixture() {
  const db=new ImplementationTestDatabase();
  const subject={expectationId:'expectation-1',runId:'run-1',leaseId:'lease-1',
    taskId:'issue-1',fence:1};
  const marker=await testIssueMarker(subject,'test-secret');
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','quiescing',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=2 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at) VALUES
    ('lease-1',1,'run-1','grant',1,'now'),
    ('lease-1',2,'run-1','heartbeat_expired',2,'now')`).run();
  db.sqlite.prepare(`INSERT INTO test_access_identities
    (identity_id,run_id,lease_id,resource_id,origin,audience,policy_id,
     principal_sha256,created_at) VALUES
    ('identity-1','run-1','lease-1','identity-resource',
     'https://portal.apps.deos-test.voxdez.com','audience','policy',?,'now')`)
    .run('c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_app_sessions
    (session_sha256,run_id,attempt_id,lease_id,fence,origin,cookie_class,
     access_identity_id,principal_sha256,expires_at) VALUES
    (?, 'run-1','attempt-1','lease-1',1,
     'https://portal.apps.deos-test.voxdez.com','browser','identity-1',?,
     '9999-01-01T00:00:00.000Z')`).run('d'.repeat(64),'c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_expected_events
    (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
     key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
     valid_from_ms,valid_until_ms,state,created_at)
    VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue','update',
      'actor-1',1,?,?,?,?,1,9999999999999,'disabled','now')`)
    .run(...Array(4).fill('f'.repeat(64)));
  let description=`Human text\n${marker}\n`;
  let writes=0;
  const linear={
    readTestIssue:async()=>({id:'issue-1',identifier:'SAC-1',title:'Test',
      teamId:'team-1',description}),
    updateTestIssueDescription:async(_id:string,next:string)=>{
      writes++;description=next;
      return {id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',description};
    },
    testActorId:async()=> 'actor-1',
  };
  const env={DB:db as unknown as D1Database,LINEAR_API_URL:'',
    LINEAR_APP_ACCESS_TOKEN:'',TEST_MARKER_KEY_V1:'test-secret'} as unknown as Env;
  return {db,env,linear,description:()=>description,writes:()=>writes};
}

test('scheduled recovery removes only the saved marker and does not need the dead Workflow',async()=>{
  const f=await fixture();
  try {
    const recovery=new SharedTestRecovery(f.env,f.linear);
    await recovery.resume();
    await recovery.resume();
    assert.equal(f.description(),'Human text\n');
    assert.equal(f.writes(),1);
    assert.equal(f.db.sqlite.prepare(`SELECT state FROM test_operations
      WHERE work_id='test-marker:expectation-1:remove'`).get()?.state,'done');
    assert.equal(f.db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'quiescing');
    const identity=f.db.sqlite.prepare(`SELECT revoked_at,absent_at FROM test_access_identities
      WHERE identity_id='identity-1'`).get() as {revoked_at:string|null;absent_at:string|null};
    assert.ok(identity.revoked_at);
    assert.ok(identity.absent_at);
    assert.ok(f.db.sqlite.prepare(`SELECT revoked_at FROM test_app_sessions`).get()?.revoked_at);
  } finally {f.db.close();}
});

test('missing cleanup key leaves the owned site quiescing',async()=>{
  const f=await fixture();
  try {
    const recovery=new SharedTestRecovery({...f.env,TEST_MARKER_KEY_V1:undefined},f.linear);
    await assert.rejects(recovery.resume(),/cleanup_key_missing/);
    assert.equal(f.writes(),0);
    assert.equal(f.db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'quiescing');
  } finally {f.db.close();}
});

test('recovery revokes browser admission before waiting on browser cleanup',async()=>{
  const f=await fixture();
  try {
    f.db.sqlite.prepare(`INSERT INTO test_browser_sessions
      (lease_id,service_name,run_id,attempt_id,fence,origin,state,
       operation_id,created_at,updated_at) VALUES
      ('lease-1','portal','run-1','attempt-1',1,
       'https://portal.apps.deos-test.voxdez.com','creating',
       'test-browser:lease-1:portal','now','now')`).run();
    await assert.rejects(new SharedTestRecovery(f.env,f.linear).resume(),
      /shared_test_browser_cleanup_unconfigured/);
    assert.ok(f.db.sqlite.prepare(`SELECT revoked_at FROM test_access_identities
      WHERE identity_id='identity-1'`).get()?.revoked_at);
    assert.ok(f.db.sqlite.prepare(`SELECT revoked_at FROM test_app_sessions`).get()?.revoked_at);
    assert.equal(f.db.sqlite.prepare(`SELECT state FROM test_environment`).get()?.state,
      'quiescing');
  }finally{f.db.close();}
});


test('blocked demo snapshot finishes before scheduled cleanup touches retained state',async()=>{
  const f=await fixture();
  try {
    seedRun(f.db);seedAttempt(f.db,'attempt-1');
    f.db.sqlite.exec("UPDATE agent_attempts SET node_id='shared_test_demo',state='blocked',cleanup_state='destroyed',ended_at='now'");
    await new SharedTestRecovery(f.env,f.linear).resume();
    assert.equal(f.writes(),0);
    assert.equal(f.db.sqlite.prepare('SELECT revoked_at FROM test_access_identities').get()?.revoked_at,null);
    assert.equal(f.db.sqlite.prepare('SELECT revoked_at FROM test_app_sessions').get()?.revoked_at,null);
    assert.equal(f.db.sqlite.prepare('SELECT state FROM test_environment').get()?.state,'quiescing');
  }finally{f.db.close();}
});
