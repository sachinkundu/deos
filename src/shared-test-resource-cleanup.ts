import {SharedTestResourceStore} from './shared-test-resources.ts';
import {sharedTestServicePlans,sharedTestStorePlans} from './shared-test-service-plan.ts';
import type {StableStagingBase} from './shared-test-lease.ts';
import type {TestStoreCleanupProvider} from './shared-test-store-provisioner.ts';
import type {TestWorkerIdentity,TestWorkerPlan} from './shared-test-worker-provisioner.ts';
import {requiredProofKinds} from './shared-test-close.ts';
import {isBlockedDemoAbort,isUnstartedSetupAbort} from './shared-test-abort-state.ts';

export interface TestWorkerCleanupProvider {
  lookup(plan:TestWorkerPlan):Promise<TestWorkerIdentity|null>;
  remove(plan:TestWorkerPlan):Promise<void>;
}

interface Owner {
  state:string;
  lease_state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
  base_json:string;
}

interface Resource {
  resource_id:string;
  run_id:string;
  lease_id:string;
  create_fence:number;
  kind:string;
  provider_key:string;
  remote_id:string|null;
  work_id:string;
  plan_state:string;
}

/** Remove only fixed-name lease resources after the first proof is attached. */
export class SharedTestResourceCleanup {
  readonly db:D1Database;
  readonly workers:TestWorkerCleanupProvider;
  readonly stores:TestStoreCleanupProvider;
  readonly resources:SharedTestResourceStore;
  readonly cleanupFixtures?:(input:{runId:string;leaseId:string;cleanupFence:number})=>Promise<void>;
  constructor(db:D1Database,workers:TestWorkerCleanupProvider,
    stores:TestStoreCleanupProvider,
    cleanupFixtures?:(input:{runId:string;leaseId:string;cleanupFence:number})=>Promise<void>) {
    this.db=db;this.workers=workers;this.stores=stores;
    this.cleanupFixtures=cleanupFixtures;
    this.resources=new SharedTestResourceStore(db);
  }

  private async owner(runId:string,leaseId:string,fence:number):Promise<Owner> {
    const row=await this.db.prepare(`SELECT e.state,l.state AS lease_state,
      e.owner_run_id,e.owner_lease_id,e.fence,l.base_json
      FROM test_environment e JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1`)
      .first<Owner>();
    if (!row || row.state!=='cleaning' || row.lease_state!=='cleaning' ||
        row.owner_run_id!==runId ||
        row.owner_lease_id!==leaseId || row.fence!==fence)
      throw new Error('shared_test_cleanup_fenced');
    const placeholders=requiredProofKinds.map(()=>'?').join(',');
    const proof=await this.db.prepare(`SELECT COUNT(DISTINCT kind) AS ready
      FROM test_proof_items WHERE lease_id=? AND kind IN (${placeholders})
        AND classification='public_safe' AND sanitizer_result='passed'
        AND public_sha256 IS NOT NULL AND public_url IS NOT NULL
        AND body_marker IS NOT NULL AND read_at IS NOT NULL
        AND projected_at IS NOT NULL`).bind(leaseId,...requiredProofKinds)
      .first<{ready:number}>();
    if (proof?.ready!==requiredProofKinds.length) {
      const blockedDemo=await isBlockedDemoAbort(this.db,runId,leaseId);
      const activatedAbort=blockedDemo || await isUnstartedSetupAbort(this.db,runId,leaseId);
      const failedSetup=await this.db.prepare(`SELECT 1 AS ready
        FROM test_lease_aborts a JOIN test_leases l ON l.lease_id=a.lease_id
        WHERE a.lease_id=? AND a.run_id=? AND a.proof_read_at IS NOT NULL
          AND a.closed_at IS NULL AND l.activated_at IS ${activatedAbort?'NOT ':''}NULL
          AND NOT EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=? ${blockedDemo?"AND state='complete'":''})
          AND NOT EXISTS (SELECT 1 FROM test_operations WHERE lease_id=? ${blockedDemo?"AND state NOT IN ('done','absent')":''})
          AND NOT EXISTS (SELECT 1 FROM test_expected_events WHERE lease_id=? ${blockedDemo?"AND state<>'disabled'":''})
          AND NOT EXISTS (SELECT 1 FROM test_provider_deliveries WHERE lease_id=? ${blockedDemo?"AND route='test' AND NOT EXISTS (SELECT 1 FROM test_delivery_dispatch d WHERE d.delivery_id=test_provider_deliveries.delivery_id AND d.state='done')":''})`)
        .bind(leaseId,runId,leaseId,leaseId,leaseId,leaseId)
        .first<{ready:number}>();
      if(failedSetup?.ready!==1)
        throw new Error('shared_test_cleanup_proof_missing');
    }
    return row;
  }

  private async row(resourceId:string,runId:string,leaseId:string,
    fence:number):Promise<Resource|null> {
    const exists=await this.db.prepare(`SELECT run_id,lease_id FROM test_resources
      WHERE resource_id=?`).bind(resourceId)
      .first<{run_id:string;lease_id:string}>();
    if (!exists) return null;
    if (exists.run_id!==runId || exists.lease_id!==leaseId)
      throw new Error(`shared_test_cleanup_resource_identity_changed:${resourceId}`);
    return this.resources.cleanupScope({resourceId,runId,leaseId,fence});
  }

  private static owned(row:Resource,expected:{resourceId:string;runId:string;
    leaseId:string;fence:number;kind:string;providerKey:string;workId:string}):void {
    if (row.resource_id!==expected.resourceId || row.run_id!==expected.runId ||
        row.lease_id!==expected.leaseId || row.create_fence!==expected.fence ||
        row.kind!==expected.kind || row.provider_key!==expected.providerKey ||
        row.work_id!==expected.workId)
      throw new Error(`shared_test_cleanup_resource_identity_changed:${expected.resourceId}`);
  }

  async resume(input:{runId:string;leaseId:string;createFence:number;
    cleanupFence:number}):Promise<void> {
    const owner=await this.owner(input.runId,input.leaseId,input.cleanupFence);
    const base=JSON.parse(owner.base_json) as StableStagingBase;
    const services=sharedTestServicePlans(input.leaseId,base);
    const stores=sharedTestStorePlans(input.leaseId,base);
    // Remove callers before their bound services. The portal was created first.
    for (const service of [...services].reverse()) {
      await this.owner(input.runId,input.leaseId,input.cleanupFence);
      const plan:TestWorkerPlan={resourceId:service.resourceId,
        runId:input.runId,leaseId:input.leaseId,fence:input.createFence,
        kind:'test_worker',providerKey:service.canonicalHost,
        workId:service.workId,service};
      const row=await this.row(plan.resourceId,input.runId,input.leaseId,
        input.cleanupFence);
      if (!row) {
        // Preparation may have failed before this item was planned. It cannot be
        // deleted without a ledger row, and a remote collision must block close.
        for (let read=0;read<2;read++) {
          if (await this.workers.lookup(plan))
            throw new Error(`shared_test_cleanup_unplanned_worker:${service.resourceId}`);
        }
        continue;
      }
      SharedTestResourceCleanup.owned(row,plan);
      if (row.plan_state==='absent') {
        for (let read=0;read<2;read++) {
          if (await this.workers.lookup(plan))
            throw new Error(`shared_test_cleanup_worker_reappeared:${service.resourceId}`);
        }
        continue;
      }
      const found=await this.workers.lookup(plan);
      if (found && (found.workerName!==service.workerName ||
          found.sourceCommit!==service.base.sourceCommit ||
          found.baseVersionId!==service.base.deployVersion ||
          found.buildInputSha256!==service.base.buildInputSha256))
        throw new Error(`shared_test_cleanup_worker_identity_changed:${service.resourceId}`);
      if (found && row.plan_state==='planned')
        throw new Error(`shared_test_cleanup_unplanned_worker:${service.resourceId}`);
      if (row.remote_id && row.remote_id!==service.workerName)
        throw new Error(`shared_test_cleanup_remote_id_changed:${service.resourceId}`);
      if (found) {
        await this.owner(input.runId,input.leaseId,input.cleanupFence);
        await this.workers.remove(plan);
      }
      for (let read=0;read<2;read++) {
        if (await this.workers.lookup(plan))
          throw new Error(`shared_test_cleanup_worker_still_present:${service.resourceId}`);
      }
      await this.resources.absent({resourceId:service.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.cleanupFence,
        removeWorkId:`test-worker-remove:${input.leaseId}:${service.serviceName}`,
        providerAbsent:true});
    }
    // BettaView binds the candidate review runtime. Its Worker must be gone
    // before that runtime, and all runtime code must be gone before its stores.
    await this.cleanupFixtures?.(input);
    for (const store of stores) {
      await this.owner(input.runId,input.leaseId,input.cleanupFence);
      const plan={resourceId:store.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.createFence,kind:store.kind,
        providerKey:store.providerName,workId:store.workId};
      const row=await this.row(plan.resourceId,input.runId,input.leaseId,
        input.cleanupFence);
      if (!row) {
        for (let read=0;read<2;read++) {
          if (await this.stores.lookup(plan))
            throw new Error(`shared_test_cleanup_unplanned_store:${store.resourceId}`);
        }
        continue;
      }
      SharedTestResourceCleanup.owned(row,plan);
      if (row.plan_state==='absent') {
        for (let read=0;read<2;read++) {
          if (await this.stores.lookup(plan))
            throw new Error(`shared_test_cleanup_store_reappeared:${store.resourceId}`);
        }
        continue;
      }
      const found=await this.stores.lookup(plan);
      if (found && row.plan_state==='planned')
        throw new Error(`shared_test_cleanup_unplanned_store:${store.resourceId}`);
      if (row.remote_id && found && row.remote_id!==found)
        throw new Error(`shared_test_cleanup_store_identity_changed:${store.resourceId}`);
      if (found) {
        await this.owner(input.runId,input.leaseId,input.cleanupFence);
        await this.stores.remove(plan,found);
      }
      for (let read=0;read<2;read++) {
        if (await this.stores.lookup(plan))
          throw new Error(`shared_test_cleanup_store_still_present:${store.resourceId}`);
      }
      await this.resources.absent({resourceId:store.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.cleanupFence,
        removeWorkId:`test-store-remove:${input.leaseId}:${store.kind}`,
        providerAbsent:true});
    }
  }
}
