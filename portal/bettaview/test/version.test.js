import assert from 'node:assert/strict';
import test from 'node:test';
import {routeBettaViewRequest} from '../worker/index.js';

test('version readback is available without a session and contains only deployment facts',async()=>{
  const env={BETTAVIEW_CANONICAL_HOST:'bettaview-staging.voxdez.com',
    BETTAVIEW_SOURCE_SHA:'a'.repeat(40),BETTAVIEW_BUILD_INPUT_SHA256:'b'.repeat(64),
    CF_VERSION_METADATA:{id:'provider-version'}};
  const denied=async()=>{throw new Error('authentication should not run');};
  const response=await routeBettaViewRequest(
    new Request('https://bettaview-staging.voxdez.com/api/version'),env,denied);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{
    canonicalHost:env.BETTAVIEW_CANONICAL_HOST,sourceSha:env.BETTAVIEW_SOURCE_SHA,
    buildInputSha256:env.BETTAVIEW_BUILD_INPUT_SHA256,versionId:'provider-version'});
  assert.equal((await routeBettaViewRequest(new Request(
    'https://bettaview-staging.voxdez.com/api/version',{method:'POST'}),env,denied)).status,405);
  const lease=await routeBettaViewRequest(
    new Request('https://test.apps.deos-test.voxdez.com/api/version'),
    {...env,TEST_BASE_VERSION_ID:'11111111-1111-4111-8111-111111111111'},denied);
  assert.equal((await lease.json()).baseVersionId,'11111111-1111-4111-8111-111111111111');
});

test('lease BettaView needs checked authentication and blocks direct provider writes',async()=>{
  const env={BETTAVIEW_SITE:'Test',ASSETS:{fetch:async()=>new Response('test page')}};
  const url='https://bettaview-test.apps.deos-test.voxdez.com/';
  const denied=async()=>{throw new Error('unauthorized');};
  assert.equal((await routeBettaViewRequest(new Request(url),env,denied)).status,401);
  assert.equal((await routeBettaViewRequest(new Request(url,{headers:{
    'X-Deos-Test-Gate':'verified'}}),env,denied)).status,401);
  const authenticated=async()=>({email:'reviewer@example.test'});
  const page=await routeBettaViewRequest(new Request(url),env,authenticated);
  assert.equal(page.status,200);
  assert.equal(await page.text(),'test page');
  const write=await routeBettaViewRequest(new Request(url+'api/comments/reply',{
    method:'POST'}),env,authenticated);
  assert.equal(write.status,403);
  assert.deepEqual(await write.json(),{
    error:'test_provider_write_requires_trusted_adapter'});
});
