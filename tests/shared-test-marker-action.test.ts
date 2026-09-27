import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestMarkerAction} from '../src/shared-test-marker-action.ts';
import {verifyCapabilityToken} from '../src/capability-auth.ts';

test('test marker action derives issue scope from the lease and stops at a new fence',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    seedRun(db,'run-1','issue-1');
    db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',
      status='active',route_repository='owner/repo' WHERE run_id='run-1'`).run();
    db.sqlite.prepare(`INSERT INTO agent_attempts
      (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,
       absolute_deadline,created_at,updated_at)
      VALUES ('attempt-1','sandbox-1','run-1','shared_test_demo','{}','digest',
        'starting','9999-01-01T00:00:00.000Z','now','now')`).run();
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
       state,created_at,updated_at) VALUES
      ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
       stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
       branch,pull_request_number,candidate_commit,patch_sha256,created_at)
      VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test',
        'team-1','shared_test_demo','active',1,'manifest-1','traffic-1','{}',
        'owner/repo','codex/test',150,?,?,'now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`UPDATE test_environment SET state='active',
      owner_run_id='run-1',owner_lease_id='lease-1',fence=1,
      heartbeat_due_at='9999-01-01T00:00:00.000Z' WHERE site_id=1`).run();
    let description='Human description\n',writes=0,reads=0;
    const linear={
      readTestIssue:async(_id:string)=>{reads++;return {id:'issue-1',identifier:'SAC-1',
        title:'Test',teamId:'team-1',description};},
      updateTestIssueDescription:async(_id:string,next:string)=>{
        writes++;description=next;
        return {id:'issue-1',identifier:'SAC-1',title:'Test',teamId:'team-1',description};
      },
      testActorId:async()=> 'actor-1',
    };
    const action=new SharedTestMarkerAction(db as unknown as D1Database,linear,'marker-key');
    const input={runId:'run-1',attemptId:'attempt-1',leaseId:'lease-1',fence:1,
      repository:'owner/repo',issueId:'issue-1'};
    const secret='s'.repeat(48);
    const token=await action.grant(input,secret);
    const claims=await verifyCapabilityToken(token,secret);
    assert.equal(claims.leaseId,'lease-1');
    assert.deepEqual(claims.actions,['github.clone_repository','test_issue_marker_patch']);
    await assert.rejects(action.handle(claims,{version:1,action:'find',
      expectationId:'expectation-1'}),/shared_test_marker_agent_inactive/);
    db.sqlite.prepare(`UPDATE agent_attempts SET state='running'
      WHERE attempt_id='attempt-1'`).run();
    const invalid=await action.handle(claims,{version:1,action:'insert',
      expectationId:'expectation-1',taskId:'other-issue'});
    assert.equal(invalid.status,400);
    assert.equal(writes,0);
    const inserted=await action.handle(claims,{version:1,action:'insert',
      expectationId:'expectation-1'});
    assert.equal(inserted.status,200);
    assert.equal(writes,1);
    assert.match(description,/<!-- deos-test-v1:expectation-1:/);
    const found=await action.handle(claims,{version:1,action:'find',
      expectationId:'expectation-1'});
    assert.deepEqual(await found.json(),{present:true});
    db.sqlite.prepare(`UPDATE agent_attempts SET state='completed'
      WHERE attempt_id='attempt-1'`).run();
    await assert.rejects(action.handle(claims,{version:1,action:'find',
      expectationId:'expectation-1'}),/shared_test_marker_agent_inactive/);
    db.sqlite.prepare(`UPDATE agent_attempts SET state='running'
      WHERE attempt_id='attempt-1'`).run();
    db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',fence=2,
      heartbeat_due_at=NULL WHERE site_id=1`).run();
    await assert.rejects(action.handle(claims,{version:1,action:'find',
      expectationId:'expectation-1'}),/shared_test_write_fenced/);
    assert.equal(reads,2);
  } finally {db.close();}
});
