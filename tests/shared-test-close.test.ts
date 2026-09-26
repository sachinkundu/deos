import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestCloseStore} from '../src/shared-test-close.ts';
import {SharedTestReportStore} from '../src/shared-test-report.ts';
import {SharedTestPrBodyWriter} from '../src/shared-test-pr-body.ts';

const now='2026-09-25T05:00:00Z';
const kinds=['app_screen','linear_screen','showboat','d1_read',
  'provider_receipt','github_receipt'];

function fixture() {
  const db=new ImplementationTestDatabase();
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
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
  db.sqlite.prepare(`INSERT INTO test_lease_fence_epochs
    (lease_id,fence,run_id,reason,transition_revision,created_at)
    VALUES ('lease-1',1,'run-1','grant',1,?)`).run(now);
  db.sqlite.prepare(`INSERT INTO test_expected_events
    (expectation_id,run_id,lease_id,fence,task_id,team_id,kind,action,actor_id,
     key_version,challenge_sha256,before_sha256,after_sha256,marker_sha256,
     valid_from_ms,valid_until_ms,state,claimed_delivery_id,created_at)
    VALUES ('expectation-1','run-1','lease-1',1,'issue-1','team-1','Issue','update',
      'app-actor-1',1,?,?,?,?,1,9999999999999,'claimed','delivery-1',?)`)
    .run('c'.repeat(64),'d'.repeat(64),'e'.repeat(64),'f'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_provider_deliveries
    (delivery_id,payload_sha256,provider_time_ms,task_id,team_id,lease_id,run_id,classification,
     route,expectation_id,received_at)
    VALUES ('delivery-1',?,1790310701176,'issue-1','team-1','lease-1','run-1',
      'accepted','test','expectation-1',?)`).run('a'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_delivery_dispatch
    (delivery_id,run_id,lease_id,expectation_id,state,queue_work_id,
     created_at,updated_at) VALUES ('delivery-1','run-1','lease-1',
      'expectation-1','done','test-delivery:delivery-1',?,?)`).run(now,now);
  db.sqlite.prepare(`INSERT INTO test_attestations
    (attestation_id,task_id,run_id,lease_id,repository,candidate_commit,
     patch_sha256,manifest_id,manifest_revision,pull_request_number,
     base_manifest_id,state,observed_at)
    VALUES ('attestation-1','issue-1','run-1','lease-1','owner/repo',?,?,'manifest-1',
      1,150,'manifest-1','observed',?)`).run('a'.repeat(40),'b'.repeat(64),now);
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
     work_id,created_at,updated_at)
    VALUES ('resource-1','run-1','lease-1',1,'test_worker','created',
      'test-lease-1-worker','create-1',?,?)`).run(now,now);
  return {db,store:new SharedTestCloseStore(db as unknown as D1Database)};
}

test('a competing owner revision cannot disable the live expectation',async()=>{
  const {db,store}=fixture();
  try {
    const originalBatch=db.batch.bind(db);
    db.batch=async statements=>{
      db.sqlite.prepare(`UPDATE test_environment SET revision=revision+1
        WHERE site_id=1`).run();
      return originalBatch(statements);
    };
    await assert.rejects(store.quiesce('run-1','lease-1',1),/write_incomplete/);
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_environment
      WHERE site_id=1`).get()?.state,'active');
    assert.equal(db.sqlite.prepare(`SELECT state FROM test_expected_events
      WHERE expectation_id='expectation-1'`).get()?.state,'claimed');
  } finally {db.close();}
});

test('close needs attached proof and owned absence before one atomic free transition',async()=>{
  const {db,store}=fixture();
  try {
    const fence=await store.quiesce('run-1','lease-1',1);
    assert.equal(fence,2);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_expected_events').get()?.state,'disabled');
    await assert.rejects(store.cleaning('run-1','lease-1',fence),/not_ready/);
    for (const kind of kinds) db.sqlite.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,source_sha256,
       object_key,content_type,byte_count,public_sha256,public_url,body_marker,
       read_at,projected_at,sanitizer_result)
      VALUES (?,'run-1','lease-1','first',?,'public_safe','allowlisted',?, ?,
       'text/plain',10,?,?,'deos-test-proof:lease-1',?,?, 'passed')`)
      .run(kind,kind,'a'.repeat(64),`proof/${kind}`,'b'.repeat(64),
        `https://example.com/${kind}`,now,now);
    db.sqlite.prepare(`INSERT INTO test_operations
      (work_id,run_id,lease_id,fence,kind,target,state,started_at,ended_at)
      VALUES ('remove-marker','run-1','lease-1',2,'linear_marker_remove',
        'issue-1','done',?,?)`).run(now,now);
    await store.cleaning('run-1','lease-1',fence);
    await assert.rejects(store.close('run-1','lease-1',fence),/absence_missing/);
    db.sqlite.prepare(`UPDATE test_resources SET plan_state='absent',absent_at=?`).run(now);
    db.sqlite.prepare(`INSERT INTO test_cleanup_checks
      (lease_id,resource_id,remove_work_id,remove_state,read_state,checked_at)
      VALUES ('lease-1','resource-1','remove-1','done','absent',?)`).run(now);
    const receipt=await store.close('run-1','lease-1',fence);
    assert.equal(receipt.leaseId,'lease-1');
    assert.equal((await store.close('run-1','lease-1',fence)).closeRevision,receipt.closeRevision);
    assert.equal(db.sqlite.prepare('SELECT state FROM test_environment WHERE site_id=1').get()?.state,'free');
    assert.equal(db.sqlite.prepare('SELECT state FROM test_attestations').get()?.state,'complete');
    assert.equal(db.sqlite.prepare('SELECT report_state FROM test_lease_closures').get()?.report_state,'pending');
    const bucket=new ImplementationTestBucket();
    let body='Human notes\n\n<!-- deos-test-proof:lease-1:start -->\nClose pending\n<!-- deos-test-proof:lease-1:end -->\n';
    const writer=new SharedTestPrBodyWriter(db as unknown as D1Database,
      {read:async()=>body,write:async(_repository,_pr,updated)=>{body=updated;}});
    const report=new SharedTestReportStore(db as unknown as D1Database,
      bucket as unknown as R2Bucket,writer);
    const url=await report.publish('run-1','lease-1');
    assert.equal(url,'https://deos-test.voxdez.com/reports/lease-1');
    assert.match(body,/Human notes/);
    assert.match(body,/Final close report/);
    assert.equal(db.sqlite.prepare('SELECT report_state FROM test_lease_closures').get()?.report_state,'complete');
    assert.equal(await report.publish('run-1','lease-1'),url);
  } finally {db.close();}
});
