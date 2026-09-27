import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {verifiedSharedTestBuild} from '../src/shared-test-build-input.ts';

const sourceCommit='a'.repeat(40);
const files=[
  {path:'migrations/0001_initial.sql',content:Buffer.from('CREATE TABLE example (id TEXT);')},
  {path:'portal/dist/index.html',content:Buffer.from('<h1>test</h1>')},
  {path:'portal-worker/worker.js',content:Buffer.from('export default {fetch(){return new Response("ok")}}')},
];

function releaseDigest(values=files):string {
  const hash=createHash('sha256').update(sourceCommit);
  for (const file of [...values].sort((a,b)=>{
    const left=a.path.split('/'),right=b.path.split('/');
    for (let i=0;i<Math.min(left.length,right.length);i++)
      if (left[i]!==right[i]) return left[i]<right[i]?-1:1;
    return left.length-right.length;
  })) {
    const path=Buffer.from(file.path);
    const size=Buffer.alloc(4);size.writeUInt32BE(path.byteLength);
    const length=Buffer.alloc(8);length.writeBigUInt64BE(BigInt(file.content.byteLength));
    hash.update(size).update(path).update(length).update(file.content);
  }
  return hash.digest('hex');
}

const base={serviceName:'portal',sourceCommit,deployVersion:'version-1',
  buildInputSha256:releaseDigest(),trafficPercent:100};

test('accepts only the exact pinned release bytes, independent of input order',async()=>{
  const result=await verifiedSharedTestBuild({serviceName:'portal',sourceCommit,
    files:[...files].reverse().map(file=>({path:file.path,
      contentBase64:file.content.toString('base64')}))},base);
  assert.equal(result.sha256,base.buildInputSha256);
  assert.equal(Buffer.from(result.worker).toString(),files[2].content.toString());
  assert.equal(Buffer.from(result.assets.get('portal/dist/index.html')!).toString(),
    files[1].content.toString());
  assert.equal(Buffer.from(result.migrations.get('migrations/0001_initial.sql')!).toString(),
    files[0].content.toString());
});

test('rejects modified or out-of-scope bytes before provisioning',async()=>{
  const input={serviceName:'portal',sourceCommit,files:files.map(file=>({
    path:file.path,contentBase64:file.content.toString('base64')}))};
  await assert.rejects(verifiedSharedTestBuild({...input,files:[
    {...input.files[0],contentBase64:Buffer.from('changed').toString('base64')},
    input.files[1],input.files[2]]},base),/test_build_input_digest_mismatch/);
  await assert.rejects(verifiedSharedTestBuild({...input,files:[
    {...input.files[0],path:'portal/dist/../secret'},input.files[1],input.files[2]]},base),
  /invalid_test_build_path/);
  await assert.rejects(verifiedSharedTestBuild({...input,sourceCommit:'b'.repeat(40)},base),
    /invalid_test_build_subject/);
});
