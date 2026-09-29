import assert from 'node:assert/strict';
import test from 'node:test';
import {probeSharedTestAccess} from '../src/shared-test-access-probe.ts';

const leaseId='a'.repeat(64);
const env={
  STAGE_RETRY_SECRET:'operator-key',
  TEST_APP_SERVICE_CLIENT_ID:'client-id',
  TEST_APP_SERVICE_CLIENT_SECRET:'client-secret',
  DB:{prepare:()=>({first:async()=>({owner_lease_id:leaseId})})},
} as unknown as Parameters<typeof probeSharedTestAccess>[1];

test('Access probe accepts only the operator and a fixed lease host',async()=>{
  let calls=0;
  const fetcher=(async(url:RequestInfo|URL,init?:RequestInit)=>{
    calls++;
    assert.equal(String(url),`https://portal-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com/api/version`);
    assert.equal((init?.headers as Record<string,string>)['CF-Access-Client-Id'],'client-id');
    assert.equal((init?.headers as Record<string,string>)['CF-Access-Client-Secret'],'client-secret');
    assert.equal(init?.redirect,'manual');
    return new Response('{}',{status:200});
  }) as typeof fetch;
  const url='https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/access-probe';
  assert.equal((await probeSharedTestAccess(new Request(url,{method:'POST'}),env,fetcher)).status,401);
  assert.equal(calls,0);
  const result=await probeSharedTestAccess(new Request(url,{method:'POST',
    headers:{Authorization:'Bearer operator-key'}}),env,fetcher);
  assert.deepEqual(await result.json(),{
    hostname:`portal-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`,
    status:200,admitted:true});
  assert.equal(calls,1);
});

test('Access probe reports a redirect as failed admission',async()=>{
  const result=await probeSharedTestAccess(new Request(
    'https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/access-probe',{
      method:'POST',headers:{Authorization:'Bearer operator-key'}}),env,
    (async()=>new Response(null,{status:302})) as typeof fetch);
  assert.equal((await result.json() as {admitted:boolean}).admitted,false);
});
