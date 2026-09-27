import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {SharedTestBuildStore,sharedTestBuildKey} from '../src/shared-test-build-store.ts';

const sourceCommit='c'.repeat(40);
const worker=Buffer.from('export default {}');
const asset=Buffer.from('<html>test</html>');
const hash=createHash('sha256').update(sourceCommit);
for (const [path,content] of [
  ['portal/dist/index.html',asset],['portal-worker/worker.js',worker],
] as const) {
  const name=Buffer.from(path),length=Buffer.alloc(4),size=Buffer.alloc(8);
  length.writeUInt32BE(name.byteLength);
  size.writeBigUInt64BE(BigInt(content.byteLength));
  hash.update(length).update(name).update(size).update(content);
}
const base={serviceName:'portal',sourceCommit,deployVersion:'version-1',
  buildInputSha256:hash.digest('hex'),trafficPercent:100};
const payload=JSON.stringify({serviceName:'portal',sourceCommit,files:[
  {path:'portal-worker/worker.js',contentBase64:worker.toString('base64')},
  {path:'portal/dist/index.html',contentBase64:asset.toString('base64')},
]});

test('reads the fixed R2 key and verifies every byte against the staging digest',async()=>{
  let readKey='';
  const bucket={get:async(key:string)=>{readKey=key;return {
    size:Buffer.byteLength(payload),text:async()=>payload,
  };}} as unknown as R2Bucket;
  const built=await new SharedTestBuildStore(bucket).read(base);
  assert.equal(readKey,sharedTestBuildKey(base));
  assert.equal(Buffer.from(built.worker).toString(),worker.toString());
});

test('missing or changed build artifact keeps provisioning closed',async()=>{
  const missing={get:async()=>null} as unknown as R2Bucket;
  await assert.rejects(new SharedTestBuildStore(missing).read(base),
    /test_build_artifact_missing/);
  const tampered=JSON.stringify({...JSON.parse(payload),files:[
    {path:'portal-worker/worker.js',contentBase64:Buffer.from('changed').toString('base64')},
    {path:'portal/dist/index.html',contentBase64:asset.toString('base64')},
  ]});
  const changed={get:async()=>({size:Buffer.byteLength(tampered),
    text:async()=>tampered})} as unknown as R2Bucket;
  await assert.rejects(new SharedTestBuildStore(changed).read(base),
    /test_build_input_digest_mismatch/);
});
