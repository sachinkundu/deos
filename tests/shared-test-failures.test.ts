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
