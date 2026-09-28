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
