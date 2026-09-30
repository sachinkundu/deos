import type {StagingServiceRead} from './shared-test-lease.ts';
import {verifiedSharedTestBuild,type SharedTestBuildInput} from './shared-test-build-input.ts';

export type VerifiedSharedTestBuild=Awaited<ReturnType<typeof verifiedSharedTestBuild>> &
  {compiledWorker?:Uint8Array};

export function sharedTestBuildKey(base:StagingServiceRead):string {
  if (!['portal','bettaview'].includes(base.serviceName) ||
      !/^[a-f0-9]{40}$/.test(base.sourceCommit) ||
      !/^[a-f0-9]{64}$/.test(base.buildInputSha256))
    throw new Error('invalid_test_build_key');
  return `shared-test/builds/${base.serviceName}/${base.sourceCommit}/${base.buildInputSha256}.json`;
}

/** Staging saves build bytes in the coordinator's private R2 bucket before deploy. */
export class SharedTestBuildStore {
  readonly bucket:R2Bucket;
  constructor(bucket:R2Bucket) {this.bucket=bucket;}

  async read(base:StagingServiceRead):Promise<VerifiedSharedTestBuild> {
    const key=sharedTestBuildKey(base);
    const object=await this.bucket.get(key);
    if (!object) throw new Error(`test_build_artifact_missing:${key}`);
    if (object.size<1 || object.size>30_000_000)
      throw new Error(`test_build_artifact_size_invalid:${key}`);
    const raw=await object.text();
    if (new TextEncoder().encode(raw).byteLength!==object.size)
      throw new Error(`test_build_artifact_length_changed:${key}`);
    let input:SharedTestBuildInput;
    try {input=JSON.parse(raw) as SharedTestBuildInput;}
    catch (error) {throw new Error(`test_build_artifact_json_invalid:${key}`,{cause:error});}
    const build=await verifiedSharedTestBuild(input,base);
    if(base.serviceName!=='bettaview')return build;
    const prefix=`shared-test/compiled-workers/bettaview/${base.sourceCommit}/`+
      `${base.buildInputSha256}/`;
    const listed=await this.bucket.list({prefix,limit:2});
    if(listed.truncated || listed.objects.length!==1)
      throw new Error('test_compiled_worker_missing_or_ambiguous');
    const compiledKey=listed.objects[0].key;
    const match=new RegExp(`^${prefix}([a-f0-9]{64})\\.js$`).exec(compiledKey);
    if(!match)throw new Error('test_compiled_worker_key_invalid');
    const compiled=await this.bucket.get(compiledKey);
    if(!compiled || compiled.size<1 || compiled.size>5_000_000)
      throw new Error('test_compiled_worker_size_invalid');
    const bytes=new Uint8Array(await compiled.arrayBuffer());
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
      .map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(digest!==match[1] || bytes.length!==compiled.size)
      throw new Error('test_compiled_worker_hash_changed');
    return {...build,compiledWorker:bytes};
  }

  /** Only one immutable bundle may represent a candidate service build. */
  async candidate(serviceName:string,candidateCommit:string):Promise<{
    digest:string;build:Awaited<ReturnType<typeof verifiedSharedTestBuild>>}|null> {
    if(!['portal','bettaview'].includes(serviceName) ||
        !/^[a-f0-9]{40}$/.test(candidateCommit))
      throw new Error('invalid_test_candidate_build_subject');
    const prefix=`shared-test/builds/${serviceName}/${candidateCommit}/`;
    const listed=await this.bucket.list({prefix,limit:3});
    if(listed.truncated || listed.objects.length>1)
      throw new Error('test_candidate_build_ambiguous');
    if(!listed.objects.length)return null;
    const key=listed.objects[0].key;
    const match=new RegExp(`^${prefix}([a-f0-9]{64})\\.json$`).exec(key);
    if(!match)throw new Error('test_candidate_build_key_invalid');
    const digest=match[1];
    const build=await this.read({serviceName,sourceCommit:candidateCommit,
      buildInputSha256:digest,deployVersion:'candidate',trafficPercent:100});
    return {digest,build};
  }
}
