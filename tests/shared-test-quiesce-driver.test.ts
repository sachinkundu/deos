import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestQuiesceDriver} from '../src/shared-test-quiesce-driver.ts';

test('a completed demo quiesces only after every first proof was attached and read',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    seedRun(db,'run-1','issue-1');
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,
       patch_sha256,state,created_at,updated_at)
      VALUES ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,
       team_id,stage,state,fence,base_manifest_id,base_traffic_revision,
       base_json,repository,branch,pull_request_number,candidate_commit,
       patch_sha256,created_at)
      VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1',
        'Test','team-1','shared_test_demo','active',1,'manifest-1',
        'traffic-1','{}','owner/repo','codex/test',150,?,?,'now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`UPDATE test_environment SET state='active',
      owner_run_id='run-1',owner_lease_id='lease-1',fence=1 WHERE site_id=1`)
      .run();
    db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
      (lease_id,fence,run_id,reason,transition_revision,created_at)
      VALUES ('lease-1',1,'run-1','grant',1,'now')`).run();
    db.sqlite.prepare(`INSERT INTO agent_attempts
      (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,
       state,absolute_deadline,ended_at,result_class,cleanup_state,
       created_at,updated_at)
      VALUES ('attempt-1','sandbox-1','run-1','shared_test_demo','{}',?,
        'completed','later','now','success','destroyed','now','now')`)
      .run('c'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_attestations
      (attestation_id,task_id,run_id,lease_id,repository,candidate_commit,
       patch_sha256,manifest_id,manifest_revision,pull_request_number,
       base_manifest_id,state,observed_at)
      VALUES ('attestation-1','issue-1','run-1','lease-1','owner/repo',?,
        ?,'manifest-1',1,150,'manifest-1','observed','now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_expected_events
      (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,
       actor_id,key_version,challenge_sha256,before_sha256,after_sha256,
       marker_sha256,valid_from_ms,valid_until_ms,state,claimed_delivery_id,
       created_at)
      VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1',
        'Issue','update','actor-1',1,?,?,?,?,1,9999999999999,
        'claimed','delivery-1','now')`)
      .run('d'.repeat(64),'e'.repeat(64),'f'.repeat(64),'a'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_provider_deliveries
      (delivery_id,payload_sha256,provider_time_ms,task_id,team_id,lease_id,
       run_id,classification,route,received_at)
      VALUES ('delivery-1',?,1,'issue-1','team-1','lease-1','run-1',
        'accepted','test','now')`).run('d'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_delivery_dispatch
      (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,
       created_at,updated_at)
      VALUES ('delivery-1','run-1','lease-1','expectation-1','done',
        'test-delivery:delivery-1','now','now')`).run();
    const driver=new SharedTestQuiesceDriver(db as unknown as D1Database);
    assert.equal(await driver.resume(),'idle');
    for(const kind of ['app_screen','linear_screen','showboat','d1_read',
      'provider_receipt','github_receipt']) {
      db.sqlite.prepare(`INSERT INTO test_proof_items
        (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
         sanitizer_result,source_sha256,object_key,content_type,byte_count,
         public_sha256,public_url,body_marker,read_at,projected_at)
        VALUES (?,'run-1','lease-1','first',?,'public_safe','public',
          'passed',?,?, 'text/plain',1,?,?,'body-marker','now','now')`)
        .run(kind,kind,'e'.repeat(64),`raw/${kind}`,'f'.repeat(64),
          `https://example.com/${kind}`);
    }
    assert.equal(await driver.resume(),'quiesced');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment
      WHERE site_id=1`).get()?.state,'quiescing');
    assert.equal(await driver.resume(),'idle');
  }finally{db.close();}
});
