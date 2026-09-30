import {SharedTestBuildStore} from './shared-test-build-store.ts';
import {SharedTestResourceStore,type SharedTestResourcePlan} from './shared-test-resources.ts';
import {sharedTestServicePlans,sharedTestStorePlans} from './shared-test-service-plan.ts';
import {SharedTestStoreProvisioner,type TestStoreProvider} from './shared-test-store-provisioner.ts';
import {SharedTestWorkerProvisioner,type TestWorkerProvider} from './shared-test-worker-provisioner.ts';
import {SharedTestSchemaProvisioner,type TestSchemaProvider} from './shared-test-schema-provisioner.ts';
import type {StableStagingBase} from './shared-test-lease.ts';

export interface SharedTestPrepareInput {
  runId:string;
  leaseId:string;
  fence:number;
  base:StableStagingBase;
}

type VerifiedBuild=Awaited<ReturnType<SharedTestBuildStore['read']>>;

/** Fetch and verify all base bytes before any lease resource can be created. */
export class SharedTestPreparation {
  readonly builds:SharedTestBuildStore;
  readonly resources:SharedTestResourceStore;
  readonly stores:SharedTestStoreProvisioner;
  readonly workers:SharedTestWorkerProvisioner;
  readonly schema:SharedTestSchemaProvisioner;
  constructor(db:D1Database,bucket:R2Bucket,storeProvider:TestStoreProvider,
    workerProvider:TestWorkerProvider,schemaProvider:TestSchemaProvider) {
    this.builds=new SharedTestBuildStore(bucket);
    this.resources=new SharedTestResourceStore(db);
    this.stores=new SharedTestStoreProvisioner(db,storeProvider);
    this.workers=new SharedTestWorkerProvisioner(db,workerProvider);
    this.schema=new SharedTestSchemaProvisioner(db,schemaProvider);
  }

  async prepare(input:SharedTestPrepareInput):Promise<ReadonlyMap<string,VerifiedBuild>> {
    const services=sharedTestServicePlans(input.leaseId,input.base);
    const stores=sharedTestStorePlans(input.leaseId,input.base);
    const verified=new Map<string,VerifiedBuild>();
    for (const service of services)
      verified.set(service.serviceName,await this.builds.read(service.base));
    const plans:SharedTestResourcePlan[]=[
      ...services.map(service=>({resourceId:service.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.fence,kind:'test_worker',
        providerKey:service.canonicalHost,workId:service.workId})),
      ...stores.map(store=>({resourceId:store.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.fence,kind:store.kind,
        providerKey:store.providerName,workId:store.workId})),
    ];
    for (const plan of plans) await this.resources.plan(plan);
    await this.stores.provision(input);
    const portal=verified.get('portal');
    if (!portal) throw new Error('shared_test_portal_build_missing');
    await this.schema.apply(input,portal);
    await this.workers.provision(input,verified);
    return verified;
  }
}
