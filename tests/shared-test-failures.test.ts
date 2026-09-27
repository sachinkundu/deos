import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestFailureStore} from '../src/shared-test-failures.ts';

test('first cause, stack and operation survive in D1 and create-only object storage',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    const store=new SharedTestFailureStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    const root=new Error('remote socket closed');
    const error=new Error('deploy failed',{cause:root});
    const context={runId:'run-1',phase:'preparing',operation:'test_service.deploy',
      safeCode:'remote_failure',workId:'work-1',fence:2};
    const id=await store.record(context,error,new Date('2026-09-25T10:00:00Z'));
    const row=db.sqlite.prepare('SELECT * FROM test_failures WHERE fault_id=?').get(id) as Record<string,string>;
    assert.equal(row.first_message,'deploy failed');
    assert.match(row.first_stack,/deploy failed/);
    assert.equal(JSON.parse(row.causes_json).message,'remote socket closed');
    assert.equal(JSON.parse(row.context_json).operation,context.operation);
    assert.equal(row.object_sha256.length,64);
    assert.equal(JSON.parse(await (await bucket.get(row.object_key))!.text()).error.cause.message,
      'remote socket closed');
    assert.equal(bucket.objects.size,1);
  } finally {db.close();}
});

test('a later fault cannot replace the leased site first fault',async()=>{
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
      owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
    const store=new SharedTestFailureStore(db as unknown as D1Database,
      bucket as unknown as R2Bucket);
    const context={runId:'run-1',leaseId:'lease-1',fence:1,phase:'active',
      operation:'test_service.deploy',safeCode:'remote_failure'};
    const first=await store.record(context,new Error('first failure'));
    await store.record({...context,operation:'test_service.readback'},
      new Error('later failure'));
    const lease=db.sqlite.prepare(`SELECT first_fault_id FROM test_leases
      WHERE lease_id='lease-1'`).get() as {first_fault_id:string};
    const site=db.sqlite.prepare(`SELECT first_fault_id FROM test_environment
      WHERE site_id=1`).get() as {first_fault_id:string};
    assert.equal(lease.first_fault_id,first);
    assert.equal(site.first_fault_id,first);
  } finally {db.close();}
});

test('an object storage failure keeps full first cause in D1',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const bucket={put:async()=>{throw new Error('R2 unavailable')},get:async()=>null};
    const store=new SharedTestFailureStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    const id=await store.record({runId:'run-2',phase:'cleanup',operation:'resource.delete',
      safeCode:'delete_failed'},new Error('provider timeout'));
    const row=db.sqlite.prepare('SELECT * FROM test_failures WHERE fault_id=?').get(id) as Record<string,string>;
    assert.equal(row.first_message,'provider timeout');
    assert.equal(row.object_key,null);
    assert.match(row.later_faults_json,/R2 unavailable/);
  } finally {db.close();}
});

test('a D1 index failure leaves a read-back recovery object with the original fault',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    const faultingDb={
      prepare(query:string) {
        if (query.includes('INSERT INTO test_failures')) throw new Error('D1 index unavailable');
        return db.prepare(query);
      },
      batch:db.batch.bind(db),
    } as unknown as D1Database;
    const store=new SharedTestFailureStore(faultingDb,bucket as unknown as R2Bucket);
    await assert.rejects(store.record({runId:'run-3',phase:'cleaning',
      operation:'resource.delete',safeCode:'delete_failed'},new Error('original provider error')),
      /shared_test_failure_index_failed/);
    const recovery=[...bucket.objects.keys()].find(key=>key.endsWith('.index-failure.json'));
    assert.ok(recovery);
    const body=JSON.parse(await (await bucket.get(recovery))!.text());
    assert.equal(body.databaseError.message,'D1 index unavailable');
    const original=JSON.parse(await (await bucket.get(body.originalObjectKey))!.text());
    assert.equal(original.error.message,'original provider error');
  } finally {db.close();}
});
