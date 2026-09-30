import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestMarkerStore} from '../src/shared-test-marker-store.ts';
import {testIssueMarker} from '../src/shared-test-marker.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
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
      'shared_test_demo','active',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=1,heartbeat_due_at='9999-01-01T00:00:00.000Z'
    WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at)
    VALUES ('lease-1',1,'run-1','grant',1,'now')`).run();
  const input={expectationId:'expectation-1',runId:'run-1',leaseId:'lease-1',
    taskId:'issue-1',teamId:'team-1',attemptId:'attempt-1',fence:1};
  return {db,input};
}

test('trusted marker insert is planned before the provider call and removal keeps human edits',async()=>{
  const {db,input}=fixture();
  let description='Task description\n';
  let sawPlan=false;
  const linear={
    readTestIssue:async()=>({id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',description}),
    testActorId:async()=> 'app-actor-1',
    updateTestIssueDescription:async(_id:string,next:string)=>{
      sawPlan=Boolean(db.sqlite.prepare(`SELECT state FROM test_expected_events
        WHERE expectation_id='expectation-1'`).get()?.state==='live');
      description=next;
      return {id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',description};
    },
  };
  try {
    const store=new SharedTestMarkerStore(db as unknown as D1Database,linear,'test-secret');
    const inserted=await store.insert(input);
    assert.equal(sawPlan,true);
    assert.equal(inserted.reconciled,false);
    db.sqlite.prepare(`UPDATE test_operations SET state='uncertain'
      WHERE work_id='test-marker:expectation-1:insert'`).run();
    assert.equal((await store.insert(input)).reconciled,true);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_operations
      WHERE work_id='test-marker:expectation-1:insert'`).get()?.state,'done');
    description=description.replace('Task description','Task description\nHuman edit');
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2 WHERE site_id=1`).run();
    db.sqlite.prepare(`UPDATE test_leases SET state='quiescing' WHERE lease_id='lease-1'`).run();
    db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
      (lease_id,fence,run_id,reason,transition_revision,created_at)
      VALUES ('lease-1',2,'run-1','quiesce',2,'now')`).run();
    await store.disableAndRemove({...input,cleanupFence:2});
    assert.equal(description,'Task description\nHuman edit\n');
    db.sqlite.prepare(`UPDATE test_operations SET state='uncertain'
      WHERE work_id='test-marker:expectation-1:remove'`).run();
    await store.disableAndRemove({...input,cleanupFence:2});
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_operations
      WHERE work_id='test-marker:expectation-1:remove'`).get()?.state,'absent');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_expected_events
      WHERE expectation_id='expectation-1'`).get()?.state,'disabled');
  } finally {db.close();}
});

test('marker insertion stops if heartbeat expires during the provider read',async()=>{
  const {db,input}=fixture();
  let wrote=false;
  const linear={
    readTestIssue:async()=>{
      db.sqlite.prepare(`UPDATE test_environment SET heartbeat_due_at=? WHERE site_id=1`)
        .run('2026-09-25T00:00:00Z');
      return {id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',
        description:'Task description\n'};
    },
    testActorId:async()=> 'app-actor-1',
    updateTestIssueDescription:async()=>{
      wrote=true;
      throw new Error('provider write must stay fenced');
    },
  };
  try {
    const store=new SharedTestMarkerStore(db as unknown as D1Database,linear,'test-secret');
    await assert.rejects(store.insert(input),/test_marker_plan_conflict/);
    assert.equal(wrote,false);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS total FROM test_expected_events').get()?.total,0);
  } finally {db.close();}
});

test('marker removal retries from the latest text after a provider failure and human edit',async()=>{
  const {db,input}=fixture();
  try {
    const marker=await testIssueMarker(input,'test-secret');
    let description=`Original text\n${marker}\n`;
    let fail=true;
    const linear={
      readTestIssue:async()=>({id:'issue-1',identifier:'SAC-1',title:'Test',
        teamId:'team-1',description}),
      testActorId:async()=> 'app-actor-1',
      updateTestIssueDescription:async(_id:string,next:string)=>{
        if (fail) {fail=false;throw new Error('Linear temporarily unavailable');}
        description=next;
        return {id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',description};
      },
    };
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2
      WHERE site_id=1`).run();
    db.sqlite.prepare(`UPDATE test_leases SET state='quiescing'
      WHERE lease_id='lease-1'`).run();
    db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
      (lease_id,fence,run_id,reason,transition_revision,created_at)
      VALUES ('lease-1',2,'run-1','quiesce',2,'now')`).run();
    db.sqlite.prepare(`INSERT INTO test_expected_events
      (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,
       actor_id,key_version,challenge_sha256,before_sha256,after_sha256,
       marker_sha256,valid_from_ms,valid_until_ms,state,created_at)
      VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue',
        'update','app-actor-1',1,?,?,?,?,1,9999999999999,'disabled','now')`)
      .run(...Array(4).fill('f'.repeat(64)));
    const store=new SharedTestMarkerStore(db as unknown as D1Database,linear,'test-secret');
    await assert.rejects(store.disableAndRemove({...input,cleanupFence:2}),
      /Linear temporarily unavailable/);
    description=description.replace('Original text','Original text\nHuman follow-up');
    await store.disableAndRemove({...input,cleanupFence:2});
    assert.equal(description,'Original text\nHuman follow-up\n');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_operations
      WHERE work_id='test-marker:expectation-1:remove'`).get()?.state,'done');
  } finally {db.close();}
});
