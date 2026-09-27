import type {StableStagingBase,StagingServiceRead} from './shared-test-lease.ts';

export interface SharedTestServicePlan {
  serviceName:string;
  resourceId:string;
  workId:string;
  workerName:string;
  canonicalHost:string;
  base:StagingServiceRead;
}

const leasePattern=/^[a-f0-9]{64}$/;
const servicePattern=/^[a-z][a-z0-9-]{0,19}$/;

/** Fixed names let retries find only the resources planned for this lease. */
export function sharedTestServicePlans(leaseId:string,base:StableStagingBase):SharedTestServicePlan[] {
  if (!leasePattern.test(leaseId) || !base || !base.revision ||
      !Array.isArray(base.services) || !base.services.length ||
      new Set(base.services.map(service=>service.serviceName)).size!==base.services.length ||
      base.services.some(service=>!servicePattern.test(service.serviceName) ||
        !/^[a-f0-9]{40}$/.test(service.sourceCommit) || !service.deployVersion ||
        !/^[a-f0-9]{64}$/.test(service.buildInputSha256)))
    throw new Error('invalid_shared_test_service_base');
  return [...base.services].sort((a,b)=>a.serviceName.localeCompare(b.serviceName))
    .map(service=>({
      serviceName:service.serviceName,
      resourceId:`test-worker:${leaseId}:${service.serviceName}`,
      workId:`test-worker-create:${leaseId}:${service.serviceName}`,
      workerName:`deos-test-${service.serviceName}-${leaseId.slice(0,32)}`,
      canonicalHost:`${service.serviceName}-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`,
      base:service,
    }));
}
