import assert from 'node:assert/strict';
import test from 'node:test';
import {SharedTestLeaseDriver} from '../src/shared-test-lease-driver.ts';

function driver(owner:Record<string,unknown>) {
  let fetches=0;
  const db={prepare:()=>({first:async()=>owner})} as unknown as D1Database;
  const fetcher:typeof fetch=async()=>{fetches++;throw new Error('provider must not be called');};
  return {value:new SharedTestLeaseDriver({DB:db,ARTIFACTS:{} as R2Bucket,
    IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'c68856288112af7698f5be52ea94b96e',
    TEST_APP_ACCESS_AUD:'a'.repeat(64),
    TEST_APP_ACCESS_POLICY_ID:'12345678-1234-1234-1234-123456789abc',
    TEST_APP_SERVICE_CLIENT_ID:'client-1'},fetcher),
    fetches:()=>fetches};
}

test('preparation stays idle without a lease',async()=>{
  const item=driver({state:'free'});
  assert.equal(await item.value.resume(),'idle');
  assert.equal(item.fetches(),0);
});

test('an expired or credential-less lease never calls the provider',async()=>{
  const owner={state:'preparing',owner_run_id:'run-1',owner_lease_id:'b'.repeat(64),
    attempt_id:'attempt-1',fence:1,base_json:'{}',
    candidate_commit:'c'.repeat(40),patch_sha256:'d'.repeat(64),
    base_manifest_id:'manifest-1',base_traffic_revision:'traffic-1',
    heartbeat_due_at:'9999-01-01T00:00:00Z'};
  const item=driver(owner);
  await assert.rejects(item.value.resume(),/credentials_missing/);
  assert.equal(item.fetches(),0);
  const expired=driver({...owner,heartbeat_due_at:'2000-01-01T00:00:00Z'});
  await assert.rejects(expired.value.resume(),/owner_expired/);
  assert.equal(expired.fetches(),0);
});
