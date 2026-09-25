import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {processSharedTestDelivery} from '../src/shared-test-queue.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  const now='2026-09-25T04:31:41Z';
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',2,'traffic-1',1,?,?)`).run('f'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted',?,?)`)
    .run('a'.repeat(40),'b'.repeat(64),now,now);
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','active',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?, ?,?)`).run('a'.repeat(40),'b'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_expected_events
    (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
     key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
     valid_from_ms,valid_until_ms,state,claimed_delivery_id,created_at)
    VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue','update',
      'app-actor-1',1,?,?,?,?,1,9999999999999,'claimed','delivery-1',?)`)
    .run('c'.repeat(64),'d'.repeat(64),'e'.repeat(64),'f'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_provider_deliveries
    (delivery_id,provider_time_ms,task_id,team_id,lease_id,run_id,classification,
     route,expectation_id,received_at)
    VALUES ('delivery-1',1790310701176,'issue-1','team-1','lease-1','run-1',
      'accepted','test','expectation-1',?)`).run(now);
  db.sqlite.prepare(`INSERT INTO test_delivery_dispatch
    (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,created_at,updated_at)
    VALUES ('delivery-1','run-1','lease-1','expectation-1','pending',
      'test-delivery:delivery-1',?,?)`).run(now,now);
  const body={kind:'shared_test_delivery',delivery_id:'delivery-1',run_id:'run-1',
    lease_id:'lease-1',expectation_id:'expectation-1',work_id:'test-delivery:delivery-1'};
  return {db,body};
}

test('test Queue claims one provider delivery and records exact observed subject',async()=>{
  const {db,body}=fixture();
  try {
    await processSharedTestDelivery(db as unknown as D1Database,body,
      new Date('2026-09-25T04:31:42Z'));
    await processSharedTestDelivery(db as unknown as D1Database,body,
      new Date('2026-09-25T04:31:43Z'));
    const row=db.sqlite.prepare('SELECT state,result_json FROM test_delivery_dispatch').get() as
      {state:string;result_json:string};
    assert.equal(row.state,'done');
    const result=JSON.parse(row.result_json);
    assert.equal(result.taskId,'issue-1');
    assert.equal(result.candidateCommit,'a'.repeat(40));
    assert.equal(result.baseManifestId,'manifest-1');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_attestations').get()?.state,'observed');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_attestations').get()?.n,1);
  } finally {db.close();}
});

test('a forged Queue scope cannot claim the saved delivery',async()=>{
  const {db,body}=fixture();
  try {
    await assert.rejects(processSharedTestDelivery(db as unknown as D1Database,
      {...body,run_id:'other-run'}),/claim_missing/);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_delivery_dispatch').get()?.state,'pending');
  } finally {db.close();}
});
