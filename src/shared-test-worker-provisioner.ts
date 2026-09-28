import {SharedTestResourceStore,type SharedTestResourcePlan} from './shared-test-resources.ts';
import {sharedTestServicePlans,type SharedTestServicePlan} from './shared-test-service-plan.ts';
import type {StableStagingBase} from './shared-test-lease.ts';
import type {SharedTestBuildStore} from './shared-test-build-store.ts';

export interface TestWorkerPlan extends SharedTestResourcePlan {
  kind:'test_worker';
  service:SharedTestServicePlan;
}

export interface TestWorkerIdentity {
  workerName:string;
  sourceCommit:string;
  baseVersionId:string;
  buildInputSha256:string;
}

type VerifiedBuild=Awaited<ReturnType<SharedTestBuildStore['read']>>;

export interface TestWorkerProvider {
  lookup(plan:TestWorkerPlan):Promise<TestWorkerIdentity|null>;
  create(plan:TestWorkerPlan,build:VerifiedBuild):Promise<void>;
  /** Finish a fixed-name route after an uncertain script upload or attach. */
  complete?(plan:TestWorkerPlan):Promise<void>;
}

function same(identity:TestWorkerIdentity,plan:TestWorkerPlan):boolean {
  return identity.workerName===plan.service.workerName &&
    identity.sourceCommit===plan.service.base.sourceCommit &&
    identity.baseVersionId===plan.service.base.deployVersion &&
    identity.buildInputSha256===plan.service.base.buildInputSha256;
}

/** A lost upload response can only reconcile to this lease's exact fixed Worker. */
export class SharedTestWorkerProvisioner {
  readonly resources:SharedTestResourceStore;
  readonly provider:TestWorkerProvider;
  constructor(db:D1Database,provider:TestWorkerProvider) {
    this.resources=new SharedTestResourceStore(db);this.provider=provider;
  }

  async provision(input:{runId:string;leaseId:string;fence:number;base:StableStagingBase},
    builds:ReadonlyMap<string,VerifiedBuild>):Promise<void> {
    const plans:TestWorkerPlan[]=sharedTestServicePlans(input.leaseId,input.base)
      .map(service=>({resourceId:service.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.fence,kind:'test_worker' as const,
        providerKey:service.canonicalHost,workId:service.workId,service}))
      // BettaView binds the lease portal, so that Worker must exist first.
      .sort((a,b)=>Number(b.service.serviceName==='portal')-
        Number(a.service.serviceName==='portal'));
    if (plans.some(plan=>!builds.has(plan.service.serviceName)) ||
        builds.size!==plans.length)
      throw new Error('shared_test_worker_builds_incomplete');
    for (const plan of plans) await this.resources.plan(plan);
    for (const plan of plans) {
      const row=await this.resources.plan(plan);
      const found=await this.provider.lookup(plan);
      if (found && !same(found,plan))
        throw new Error(`shared_test_worker_identity_changed:${plan.resourceId}`);
      if (row.plan_state==='created') {
        if (!found || row.remote_id!==found.workerName)
          throw new Error(`shared_test_worker_missing:${plan.resourceId}`);
        await this.provider.complete?.(plan);
        continue;
      }
      if (row.plan_state==='creating' || row.plan_state==='uncertain') {
        if (!found) throw new Error(`shared_test_worker_reconcile_pending:${plan.resourceId}`);
        await this.provider.complete?.(plan);
        await this.resources.created(plan,found.workerName);
        continue;
      }
      if (row.plan_state!=='planned' || found)
        throw new Error(`shared_test_worker_name_conflict:${plan.resourceId}`);
      await this.resources.beginCreate(plan);
      try {await this.provider.create(plan,builds.get(plan.service.serviceName)!);}
      catch (error) {
        try {await this.resources.uncertain(plan,plan.service.workerName);}
        catch (secondary) {
          throw new AggregateError([error,secondary],
            `Test Worker create and uncertainty save failed: ${plan.resourceId}`,{cause:error});
        }
        throw error;
      }
      const created=await this.provider.lookup(plan);
      if (!created || !same(created,plan))
        throw new Error(`shared_test_worker_create_unconfirmed:${plan.resourceId}`);
      await this.resources.created(plan,created.workerName);
    }
  }
}
