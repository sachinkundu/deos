import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {SharedTestBuildStore,sharedTestBuildKey} from '../src/shared-test-build-store.ts';

const sourceCommit='c'.repeat(40);
const worker=Buffer.from('export default {}');
const asset=Buffer.from('<html>test</html>');
const migration=Buffer.from('CREATE TABLE example (id TEXT);');
const hash=createHash('sha256').update(sourceCommit);
for (const [path,content] of [
  ['migrations/0001_initial.sql',migration],['portal/dist/index.html',asset],
  ['portal-worker/worker.js',worker],
] as const) {
  const name=Buffer.from(path),length=Buffer.alloc(4),size=Buffer.alloc(8);
  length.writeUInt32BE(name.byteLength);
  size.writeBigUInt64BE(BigInt(content.byteLength));
  hash.update(length).update(name).update(size).update(content);
}
const base={serviceName:'portal',sourceCommit,deployVersion:'version-1',
  buildInputSha256:hash.digest('hex'),trafficPercent:100};
const payload=JSON.stringify({serviceName:'portal',sourceCommit,files:[
  {path:'migrations/0001_initial.sql',contentBase64:migration.toString('base64')},
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
    {path:'migrations/0001_initial.sql',contentBase64:migration.toString('base64')},
    {path:'portal-worker/worker.js',contentBase64:Buffer.from('changed').toString('base64')},
    {path:'portal/dist/index.html',contentBase64:asset.toString('base64')},
  ]});
  const changed={get:async()=>({size:Buffer.byteLength(tampered),
    text:async()=>tampered})} as unknown as R2Bucket;
  await assert.rejects(new SharedTestBuildStore(changed).read(base),
    /test_build_input_digest_mismatch/);
});

test('candidate discovery accepts one exact immutable bundle only',async()=>{
  const key=sharedTestBuildKey(base);
  const bucket={list:async()=>({objects:[{key}],truncated:false}),
    get:async()=>({size:Buffer.byteLength(payload),text:async()=>payload})} as unknown as R2Bucket;
  const found=await new SharedTestBuildStore(bucket).candidate('portal',sourceCommit);
  assert.equal(found?.digest,base.buildInputSha256);
  assert.equal(Buffer.from(found!.build.worker).toString(),worker.toString());
  const ambiguous={list:async()=>({objects:[{key},{key}],truncated:false})} as unknown as R2Bucket;
  await assert.rejects(new SharedTestBuildStore(ambiguous).candidate('portal',sourceCommit),
    /test_candidate_build_ambiguous/);
});

test('BettaView requires one hash-checked compiled Worker for its pinned raw build',async()=>{
  const rawWorker=Buffer.from('import "jose"; export default {}');
  const compiled=Buffer.from('export default {}; export class GitHubSession {}');
  const files=[
    {path:'portal/bettaview/dist/index.html',content:asset},
    {path:'portal/bettaview/worker/index.js',content:rawWorker},
  ];
  const digest=createHash('sha256').update(sourceCommit);
  for(const file of files) {
    const name=Buffer.from(file.path),length=Buffer.alloc(4),size=Buffer.alloc(8);
    length.writeUInt32BE(name.length);size.writeBigUInt64BE(BigInt(file.content.length));
    digest.update(length).update(name).update(size).update(file.content);
  }
  const betta={serviceName:'bettaview',sourceCommit,deployVersion:'version-1',
    buildInputSha256:digest.digest('hex'),trafficPercent:100};
  const raw=JSON.stringify({serviceName:'bettaview',sourceCommit,files:files.map(file=>({
    path:file.path,contentBase64:file.content.toString('base64')}))});
  const prefix=`shared-test/compiled-workers/bettaview/${sourceCommit}/${betta.buildInputSha256}/`;
  const compiledKey=`${prefix}${createHash('sha256').update(compiled).digest('hex')}.js`;
  const bucket={list:async()=>({objects:[{key:compiledKey}],truncated:false}),
    get:async(key:string)=>key===compiledKey?{
      size:compiled.length,arrayBuffer:async()=>compiled.buffer.slice(
        compiled.byteOffset,compiled.byteOffset+compiled.byteLength),
    }:{size:Buffer.byteLength(raw),text:async()=>raw}} as unknown as R2Bucket;
  const build=await new SharedTestBuildStore(bucket).read(betta);
  assert.equal(Buffer.from(build.compiledWorker!).toString(),compiled.toString());
  const missing={...bucket,list:async()=>({objects:[],truncated:false})} as unknown as R2Bucket;
  await assert.rejects(new SharedTestBuildStore(missing).read(betta),
    /test_compiled_worker_missing_or_ambiguous/);
});
