import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestLeaseStore} from '../src/shared-test-lease.ts';
import {scanSharedTest} from '../src/shared-test-scanner.ts';

test('a failed scheduled grant preserves the original error and queue context',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    await new SharedTestLeaseStore(db as unknown as D1Database).request({
      runId:'run-1',nodeVisit:1,attemptId:'attempt-1',taskId:'issue-1',
      candidateCommit:'a'.repeat(40),patchSha256:'b'.repeat(64),
    });
    const root=new Error('staging version endpoint timed out');
    const primary=new Error('staging read failed',{cause:root});
    const env={DB:db as unknown as D1Database,ARTIFACTS:bucket as unknown as R2Bucket,
      SHARED_TEST_GRANTS_ENABLED:'true'} as unknown as Env;
    await assert.rejects(scanSharedTest(env,async()=>{throw primary;}),error=>error===primary);
    const row=db.sqlite.prepare(`SELECT * FROM test_failures WHERE run_id='run-1'`)
      .get() as Record<string,string>;
    assert.equal(row.first_message,'staging read failed');
    assert.equal(JSON.parse(row.causes_json).message,'staging version endpoint timed out');
    assert.equal(JSON.parse(row.context_json).operation,'shared_test.grant_head');
    assert.equal(row.object_sha256.length,64);
    const object=JSON.parse(await (await bucket.get(row.object_key))!.text());
    assert.equal(object.error.cause.message,'staging version endpoint timed out');
  } finally {db.close();}
});

test('an expired owner is fenced and never replaced by the same scan',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
       state,created_at,updated_at) VALUES
      ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
       stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
       branch,pull_request_number,candidate_commit,patch_sha256,created_at)
      VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-182',
        'Test','team-1','shared_test_demo','active',1,'manifest-1',
        'traffic-1','{}','owner/repo','codex/test',150,?,?,'now')`)
      .run('a'.repeat(40),'b'.repeat(64));
    db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
      owner_lease_id='lease-1',fence=1,heartbeat_due_at='2026-09-01T00:00:00Z'
      WHERE site_id=1`).run();
    const env={DB:db as unknown as D1Database,ARTIFACTS:bucket as unknown as R2Bucket,
      SHARED_TEST_GRANTS_ENABLED:'true'} as unknown as Env;
    let grants=0;
    await scanSharedTest(env,async()=>{grants++;});
    assert.equal(grants,0);
    const site=await new SharedTestLeaseStore(db as unknown as D1Database).environment();
    assert.equal(site.state,'quiescing');
    assert.equal(site.owner_lease_id,'lease-1');
    assert.equal(site.fence,2);
  } finally {db.close();}
});

test('a diagnostic write failure keeps the scheduled error as the cause',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    await new SharedTestLeaseStore(db as unknown as D1Database).request({
      runId:'run-1',nodeVisit:1,attemptId:'attempt-1',taskId:'issue-1',
      candidateCommit:'a'.repeat(40),patchSha256:'b'.repeat(64),
    });
    const faultingDb={
      prepare(query:string) {
        if (query.includes('INSERT INTO test_failures')) throw new Error('D1 index unavailable');
        return db.prepare(query);
      },
      batch:db.batch.bind(db),
    } as unknown as D1Database;
    const env={DB:faultingDb,ARTIFACTS:bucket as unknown as R2Bucket,
      SHARED_TEST_GRANTS_ENABLED:'true'} as unknown as Env;
    const primary=new Error('staging read failed');
    await assert.rejects(scanSharedTest(env,async()=>{throw primary;}),error=>{
      assert.ok(error instanceof AggregateError);
      assert.equal(error.cause,primary);
      assert.equal(error.errors[0],primary);
      assert.match(String(error.errors[1]),/shared_test_failure_index_failed/);
      return true;
    });
  } finally {db.close();}
});
