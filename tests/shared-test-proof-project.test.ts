import assert from 'node:assert/strict';
import {test} from 'node:test';
import {projectSharedTestImage,sharedTestImageRecipe} from '../src/shared-test-proof-project.ts';

test('image projection rejects untrusted text before reading the proof',async()=>{
  const url='https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/proof-project';
  const env={STAGE_RETRY_SECRET:'operator-secret'} as Env;
  assert.equal((await projectSharedTestImage(new Request(url),env)).status,405);
  assert.equal((await projectSharedTestImage(new Request(url,{method:'POST'}),env)).status,401);
  const response=await projectSharedTestImage(new Request(url,{method:'POST',
    headers:{Authorization:'Bearer operator-secret','Content-Type':'application/json'},
    body:JSON.stringify({proofId:'00000000-0000-0000-0000-000000000000',
      width:640,height:480,crop:{x:0,y:0,width:640,height:480},masks:[],
      identityLine:'key',allowedText:['private account number']})}),env);
  assert.equal(response.status,400);
});

test('OCR allowlist comes only from the saved task and fixed UI labels',()=>{
  const recipe=sharedTestImageRecipe({run_id:'run',lease_id:'lease',kind:'app_screen',
    source_sha256:'a'.repeat(64),task_key:'SAC-182',
    task_title:'Continue the workflow from BettaView reviews'},
  {proofId:'00000000-0000-0000-0000-000000000000',
    width:640,height:480,crop:{x:0,y:0,width:640,height:480},masks:[],
    identityLine:'key_dot_title'});
  assert.deepEqual(recipe.requiredText,
    ['SAC-182 · Continue the workflow from BettaView reviews']);
  assert.ok(recipe.allowedText.includes('SAC-182'));
  assert.ok(!recipe.allowedText.includes('private account number'));
});

test('Settings proof admits fixed labels but never account values or another origin',()=>{
  const row={run_id:'run',lease_id:'a'.repeat(64),kind:'app_screen',source_sha256:'b'.repeat(64),
    task_key:'SAC-182',task_title:'Continue the workflow from BettaView reviews',
    capture_recipe:JSON.stringify({version:1,service:'bettaview',
      origin:`https://bettaview-${'a'.repeat(32)}.apps.deos-test.voxdez.com`})};
  const request={proofId:'00000000-0000-0000-0000-000000000000',width:1440,height:900,
    crop:{x:310,y:135,width:820,height:515},masks:[],identityLine:'settings_account' as const};
  const recipe=sharedTestImageRecipe(row,request);
  assert.deepEqual(recipe.requiredText,['Checked BettaView account']);
  for(const privateValue of ['233623','reviewer@deos-test.invalid','8efc07d8-0d85-430f-84e7-f51bc6833a0b'])
    assert.equal(recipe.allowedText.includes(privateValue),false);
  assert.throws(()=>sharedTestImageRecipe({...row,kind:'linear_screen'},request),/scope_invalid/);
  assert.throws(()=>sharedTestImageRecipe({...row,capture_recipe:JSON.stringify({version:1,
    service:'bettaview',origin:'https://bettaview.voxdez.com'})},request),/scope_invalid/);
});
