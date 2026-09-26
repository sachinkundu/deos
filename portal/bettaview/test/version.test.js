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
});
