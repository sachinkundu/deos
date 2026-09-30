import {sha256Hex} from './implementation-hash.ts';
import type {StagingTrafficRead,StagingServiceRead} from './shared-test-lease.ts';

export interface StagingWorkerTarget {
  serviceName:string;
  host:string;
}

interface HostVersion {
  canonicalHost:string;
  sourceSha:string;
  versionId:string;
  buildInputSha256:string;
}

const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Read the version served by each staging app. The caller assumes it has 100% traffic. */
export class StagingVersionReader {
  readonly targets:readonly StagingWorkerTarget[];
  readonly versionRequest:(target:StagingWorkerTarget)=>Promise<Response>;
  constructor(targets:readonly StagingWorkerTarget[],
    versionRequest:(target:StagingWorkerTarget)=>Promise<Response>) {
    if (!targets.length || new Set(targets.map(target=>target.serviceName)).size!==targets.length ||
        targets.some(target=>!target.serviceName || !/^[a-z0-9.-]+$/.test(target.host)))
      throw new Error('invalid_staging_version_reader');
    this.targets=targets;
    this.versionRequest=versionRequest;
  }

  async read():Promise<StagingTrafficRead> {
    const services=await Promise.all(this.targets.map(async target=>{
      let response:Response;
      try {response=await this.versionRequest(target);}
      catch(error) {
        throw new Error(`staging_host_version_request_failed:${target.serviceName}:${target.host}`,
          {cause:error});
      }
      if (!response.ok)
        throw new Error(`staging_host_version_http_${response.status}:${target.serviceName}:${target.host}`);
      let host:Partial<HostVersion>;
      try {host=await response.json() as Partial<HostVersion>;}
      catch(error) {
        throw new Error(`staging_host_version_json_invalid:${target.serviceName}:${target.host}`,
          {cause:error});
      }
      if (host.canonicalHost!==target.host || !host.versionId || !uuid.test(host.versionId) ||
          !host.sourceSha || !sha40.test(host.sourceSha) ||
          !host.buildInputSha256 || !sha64.test(host.buildInputSha256))
        throw new Error(`staging_host_version_invalid:${target.serviceName}:${target.host}`);
      const service:StagingServiceRead={serviceName:target.serviceName,
        sourceCommit:host.sourceSha,deployVersion:host.versionId,
        buildInputSha256:host.buildInputSha256,
        // Explicit policy assumption, not a Cloudflare traffic measurement.
        trafficPercent:100};
      return service;
    }));
    services.sort((a,b)=>a.serviceName.localeCompare(b.serviceName));
    return {revision:await sha256Hex(JSON.stringify(services.map(service=>[
      service.serviceName,service.sourceCommit,service.deployVersion,service.buildInputSha256]))),
      services};
  }
}
