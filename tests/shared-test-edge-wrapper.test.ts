import assert from 'node:assert/strict';
import test from 'node:test';
import {sharedTestEdgeWrapper} from '../src/shared-test-edge-wrapper.ts';

async function edge() {
  const source=sharedTestEdgeWrapper('portal').replace(
    /^import candidate from .*;\n/,
    `const candidate={fetch:async request=>Response.json({gate:request.headers.get('X-Deos-Test-Gate'),access:request.headers.get('CF-Access-Jwt-Assertion'),clientId:request.headers.get('CF-Access-Client-Id'),clientSecret:request.headers.get('CF-Access-Client-Secret'),cookie:request.headers.get('Cookie')})};\n`);
  return (await import(`data:text/javascript,${encodeURIComponent(source)}`)).default;
}

test('edge checks host and session before forwarding and strips credentials',async()=>{
  const worker=await edge();
  const calls:string[]=[];
  const env={TEST_CANONICAL_HOST:'portal-test.apps.deos-test.voxdez.com',
    TEST_APP_GATE:{
      redeem:async()=>{calls.push('redeem');return {cookie:'__Host-deos_test=fresh; Path=/; Secure; HttpOnly; SameSite=Lax'};},
      authorize:async()=>{calls.push('authorize');return true;},
    }};
  const origin='https://portal-test.apps.deos-test.voxdez.com';
  assert.equal((await worker.fetch(new Request('https://other.test/'),env)).status,421);
  assert.equal((await worker.fetch(new Request(origin+'/'),env)).status,401);
  const launched=await worker.fetch(new Request(origin+'/__deos/launch',{
    method:'POST',headers:{'CF-Access-Jwt-Assertion':'access','Origin':origin},
    body:JSON.stringify({code:'one-use-code'})}),env);
  assert.equal(launched.status,204);
  assert.match(launched.headers.get('Set-Cookie')??'',/__Host-deos_test=fresh/);
  const response=await worker.fetch(new Request(origin+'/',{headers:{
    'CF-Access-Jwt-Assertion':'access',
    'Cookie':'__Host-deos_test=fresh; app=other',
    'X-Deos-Test-Gate':'forged'}}),env);
  assert.deepEqual(await response.json(),{gate:'verified',access:null,
    clientId:null,clientSecret:null,cookie:'app=other'});
  assert.deepEqual(calls,['redeem','authorize']);
});

test('edge reports its own release metadata without forwarding credentials to candidate code',async()=>{
  const worker=await edge();
  const host='portal-test.apps.deos-test.voxdez.com';
  const response=await worker.fetch(new Request(
    `https://${host}/api/version`,{headers:{
      'CF-Access-Jwt-Assertion':'assertion',
      'CF-Access-Client-Id':'client-id',
      'CF-Access-Client-Secret':'client-secret',
    }}),{TEST_CANONICAL_HOST:host,PORTAL_SOURCE_SHA:'a'.repeat(40),
      PORTAL_BUILD_INPUT_SHA256:'b'.repeat(64),
      TEST_BASE_VERSION_ID:'11111111-1111-4111-8111-111111111111',
      CF_VERSION_METADATA:{id:'22222222-2222-4222-8222-222222222222'}});
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{canonicalHost:host,sourceSha:'a'.repeat(40),
    baseVersionId:'11111111-1111-4111-8111-111111111111',
    buildInputSha256:'b'.repeat(64),
    versionId:'22222222-2222-4222-8222-222222222222'});
});

test('edge rejects a forged gate header without the session',async()=>{
  const worker=await edge();
  const env={TEST_CANONICAL_HOST:'portal-test.apps.deos-test.voxdez.com',
    TEST_APP_GATE:{authorize:async()=>{throw new Error('must not call');}}};
  const response=await worker.fetch(new Request(
    'https://portal-test.apps.deos-test.voxdez.com/',{headers:{
      'CF-Access-Jwt-Assertion':'access','X-Deos-Test-Gate':'verified'}}),env);
  assert.equal(response.status,401);
});

test('edge module selection is fixed',()=>{
  assert.match(sharedTestEdgeWrapper('bettaview'),
    /import candidate from "\.\/app\/index\.js"/);
  assert.match(sharedTestEdgeWrapper('bettaview'),
    /export \{GitHubSession\} from '\.\/app\/index\.js'/);
  assert.throws(()=>sharedTestEdgeWrapper('staging'),/service_invalid/);
});
