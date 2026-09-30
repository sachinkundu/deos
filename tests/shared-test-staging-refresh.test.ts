import assert from 'node:assert/strict';
import {test} from 'node:test';
import {refreshSharedTestStaging} from '../src/shared-test-staging-refresh.ts';

test('staging refresh requires the operator capability and POST',async()=>{
  const env={STAGE_RETRY_SECRET:'operator-secret'} as Env;
  let calls=0;
  const sync=async()=>{
    calls++;
    return {state:'stable',manifest_id:'manifest:one',manifest_revision:3};
  };
  const url='https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/staging-refresh';
  assert.equal((await refreshSharedTestStaging(new Request(url),env,sync)).status,405);
  assert.equal((await refreshSharedTestStaging(new Request(url,{method:'POST'}),env,sync)).status,401);
  assert.equal(calls,0);
  const response=await refreshSharedTestStaging(new Request(url,{method:'POST',
    headers:{Authorization:'Bearer operator-secret'}}),env,sync);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),{state:'stable',manifestId:'manifest:one',revision:3});
  assert.equal(calls,1);
});
