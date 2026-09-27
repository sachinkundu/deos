import type {StagingServiceRead} from './shared-test-lease.ts';
import {verifiedSharedTestBuild,type SharedTestBuildInput} from './shared-test-build-input.ts';

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

  async read(base:StagingServiceRead):ReturnType<typeof verifiedSharedTestBuild> {
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
    return verifiedSharedTestBuild(input,base);
  }
}
