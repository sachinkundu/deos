import {SharedTestResourceStore,type SharedTestResourcePlan} from './shared-test-resources.ts';
import {sharedTestStorePlans} from './shared-test-service-plan.ts';
import type {StableStagingBase} from './shared-test-lease.ts';

interface StorePlan extends SharedTestResourcePlan {
  kind:'d1_database'|'r2_bucket';
}

export interface TestStoreProvider {
  lookup(plan:StorePlan):Promise<string|null>;
  create(plan:StorePlan):Promise<string>;
}

export interface TestStoreCleanupProvider extends TestStoreProvider {
  remove(plan:StorePlan,remoteId:string):Promise<void>;
}

/** Reserve every name in D1 before asking Cloudflare to create a store. */
export class SharedTestStoreProvisioner {
  readonly resources:SharedTestResourceStore;
  readonly provider:TestStoreProvider;
  constructor(db:D1Database,provider:TestStoreProvider) {
    this.resources=new SharedTestResourceStore(db);this.provider=provider;
  }

  async provision(input:{runId:string;leaseId:string;fence:number;
    base:StableStagingBase},at=new Date()):Promise<StorePlan[]> {
    const plans:StorePlan[]=sharedTestStorePlans(input.leaseId,input.base).map(plan=>({
      resourceId:plan.resourceId,runId:input.runId,leaseId:input.leaseId,
      fence:input.fence,kind:plan.kind,providerKey:plan.providerName,
      workId:plan.workId,
    }));
    for (const plan of plans) await this.resources.plan(plan,at);
    for (const plan of plans) {
      const row=await this.resources.plan(plan,at);
      const found=await this.provider.lookup(plan);
      if (row.plan_state==='created') {
        if (!found || found!==row.remote_id)
          throw new Error(`shared_test_store_identity_changed:${plan.resourceId}`);
        continue;
      }
      if (row.plan_state==='creating' || row.plan_state==='uncertain') {
        if (!found) throw new Error(`shared_test_store_reconcile_pending:${plan.resourceId}`);
        await this.resources.created(plan,found,at);
        continue;
      }
      if (row.plan_state!=='planned' || found)
        throw new Error(`shared_test_store_name_conflict:${plan.resourceId}`);
      await this.resources.beginCreate(plan,at);
      let remoteId:string;
      try {remoteId=await this.provider.create(plan);}
      catch (error) {
        try {await this.resources.uncertain(plan,plan.providerKey,at);}
        catch (secondary) {
          throw new AggregateError([error,secondary],
            `Test store create and uncertainty save failed: ${plan.resourceId}`,{cause:error});
        }
        throw error;
      }
      if (!remoteId) throw new Error(`shared_test_store_create_id_missing:${plan.resourceId}`);
      await this.resources.created(plan,remoteId,at);
    }
    return plans;
  }
}
