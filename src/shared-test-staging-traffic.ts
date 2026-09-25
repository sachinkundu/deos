import {sha256Hex} from './implementation-hash.ts';
import type {StagingTrafficRead,StagingServiceRead} from './shared-test-lease.ts';

export interface StagingWorkerTarget {
  serviceName:string;
  workerName:string;
  host:string;
}

interface Deployment {
  id:string;
  created_on:string;
  versions:readonly {version_id:string;percentage:number}[];
}

interface HostVersion {
  canonicalHost:string;
  sourceSha:string;
  versionId:string;
  buildInputSha256:string;
}

const sha40=/^[a-f0-9]{40}$/;
const uuid=/^[a-f0-9-]{36}$/i;

/** Read actual routed traffic and the running host, never a desired version. */
export class CloudflareStagingTrafficReader {
  readonly accountId:string;
  readonly token:string;
  readonly targets:readonly StagingWorkerTarget[];
  readonly request:typeof fetch;
  readonly versionRequest:(target:StagingWorkerTarget)=>Promise<Response>;
  constructor(accountId:string,token:string,targets:readonly StagingWorkerTarget[],
    request:typeof fetch=(input,init)=>fetch(input,init),
    versionRequest?: (target:StagingWorkerTarget)=>Promise<Response>) {
    if (!/^[a-f0-9]{32}$/.test(accountId) || !token || !targets.length ||
        new Set(targets.map(target=>target.serviceName)).size!==targets.length ||
        targets.some(target=>!target.serviceName || !/^[a-z0-9-]+$/.test(target.workerName) ||
          !/^[a-z0-9.-]+$/.test(target.host)))
      throw new Error('invalid_staging_traffic_reader');
    this.accountId=accountId;this.token=token;this.targets=targets;this.request=request;
    this.versionRequest=versionRequest ?? (target=>this.request(`https://${target.host}/api/version`,
      {headers:{Accept:'application/json','User-Agent':'deos-shared-test'},
        redirect:'manual',signal:AbortSignal.timeout(20_000)}));
  }

  private async deployments(target:StagingWorkerTarget):Promise<Deployment> {
    const response=await this.request(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/workers/scripts/${target.workerName}/deployments`,
      {headers:{Authorization:`Bearer ${this.token}`,'User-Agent':'deos-shared-test'},
        redirect:'manual',signal:AbortSignal.timeout(20_000)});
    if (!response.ok) throw new Error(`staging_deployment_read_http_${response.status}`);
    const body=await response.json() as {success?:boolean;result?:{deployments?:Deployment[]}};
    const deployments=body.result?.deployments;
    if (body.success!==true || !Array.isArray(deployments) || !deployments.length)
      throw new Error('staging_deployment_read_invalid');
    const newest=[...deployments].sort((a,b)=>b.created_on.localeCompare(a.created_on))[0];
    if (!uuid.test(newest.id) || newest.versions.length!==1 ||
        newest.versions[0].percentage!==100 || !uuid.test(newest.versions[0].version_id))
      throw new Error('staging_deployment_traffic_incomplete');
    return newest;
  }

  private async hostVersion(target:StagingWorkerTarget):Promise<HostVersion> {
    const response=await this.versionRequest(target);
    if (!response.ok) throw new Error(`staging_host_version_http_${response.status}`);
    return await response.json() as HostVersion;
  }

  async read():Promise<StagingTrafficRead> {
    const results=await Promise.all(this.targets.map(async target=>{
      const deployment=await this.deployments(target);
      const host=await this.hostVersion(target);
      const version=deployment.versions[0].version_id;
      if (host.canonicalHost!==target.host || host.versionId!==version ||
          !sha40.test(host.sourceSha) || !/^[a-f0-9]{64}$/.test(host.buildInputSha256))
        throw new Error('staging_host_deployment_mismatch');
      const service:StagingServiceRead={serviceName:target.serviceName,
        sourceCommit:host.sourceSha,deployVersion:version,
        buildInputSha256:host.buildInputSha256,
        trafficPercent:100};
      return {service,deploymentId:deployment.id};
    }));
    results.sort((a,b)=>a.service.serviceName.localeCompare(b.service.serviceName));
    return {revision:await sha256Hex(JSON.stringify(results.map(result=>
      [result.service.serviceName,result.deploymentId]))),
      services:results.map(result=>result.service)};
  }
}
