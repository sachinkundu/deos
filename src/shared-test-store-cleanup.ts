import {SharedTestResourceStore} from './shared-test-resources.ts';
import {sharedTestStorePlans} from './shared-test-service-plan.ts';
import type {StableStagingBase} from './shared-test-lease.ts';
import type {TestStoreCleanupProvider} from './shared-test-store-provisioner.ts';

const proofKinds=['app_screen','linear_screen','showboat','d1_read',
  'provider_receipt','github_receipt'];

/** Remove only planned lease stores, after the app is gone and proof is durable. */
export class SharedTestStoreCleanup {
  readonly db:D1Database;
  readonly resources:SharedTestResourceStore;
  readonly provider:TestStoreCleanupProvider;
  constructor(db:D1Database,provider:TestStoreCleanupProvider) {
    this.db=db;this.resources=new SharedTestResourceStore(db);this.provider=provider;
  }

  private async ready(runId:string,leaseId:string,fence:number,workerCount:number):Promise<void> {
    const row=await this.db.prepare(`SELECT 1 AS ready FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state='cleaning' AND e.owner_run_id=?
        AND e.owner_lease_id=? AND e.fence=? AND l.state='cleaning'
        AND (SELECT COUNT(*) FROM test_resources r WHERE r.lease_id=?
          AND r.kind='test_worker' AND r.plan_state='absent')=?
        AND NOT EXISTS (SELECT 1 FROM test_resources r WHERE r.lease_id=?
          AND r.kind='test_worker' AND (r.plan_state<>'absent' OR r.absent_at IS NULL
            OR NOT EXISTS (SELECT 1 FROM test_cleanup_checks c
              WHERE c.lease_id=r.lease_id AND c.resource_id=r.resource_id
                AND c.remove_state='done' AND c.read_state='absent')))
        AND NOT EXISTS (SELECT 1 FROM test_app_sessions s WHERE s.lease_id=?
          AND s.revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_access_identities i WHERE i.lease_id=?
          AND i.absent_at IS NULL)
        AND (SELECT COUNT(DISTINCT kind) FROM test_proof_items p
          WHERE p.lease_id=? AND p.kind IN (${proofKinds.map(()=>'?').join(',')})
            AND p.classification='public_safe' AND p.sanitizer_result='passed'
            AND p.public_sha256 IS NOT NULL AND p.public_url IS NOT NULL
            AND p.body_marker IS NOT NULL AND p.read_at IS NOT NULL
            AND p.projected_at IS NOT NULL)=?`)
      .bind(runId,leaseId,fence,leaseId,workerCount,leaseId,leaseId,leaseId,leaseId,
        ...proofKinds,proofKinds.length).first<{ready:number}>();
    if (row?.ready!==1) throw new Error('shared_test_store_cleanup_not_ready');
  }

  async remove(input:{runId:string;leaseId:string;fence:number;
    base:StableStagingBase},at=new Date()):Promise<void> {
    const workerCount=input.base.services.length;
    await this.ready(input.runId,input.leaseId,input.fence,workerCount);
    for (const store of sharedTestStorePlans(input.leaseId,input.base)) {
      const scope={resourceId:store.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.fence};
      const row=await this.resources.cleanupScope(scope);
      if (row.plan_state==='absent') continue;
      if (row.kind!==store.kind || row.provider_key!==store.providerName ||
          row.work_id!==store.workId)
        throw new Error(`shared_test_store_cleanup_identity_changed:${store.resourceId}`);
      const plan={...scope,fence:row.create_fence,kind:store.kind,
        providerKey:store.providerName,workId:store.workId};
      const found=await this.provider.lookup(plan);
      if (row.plan_state==='planned' && found)
        throw new Error(`shared_test_store_unowned_name:${store.resourceId}`);
      if (row.plan_state==='created' && found && found!==row.remote_id)
        throw new Error(`shared_test_store_cleanup_remote_changed:${store.resourceId}`);
      if (found) {
        await this.ready(input.runId,input.leaseId,input.fence,workerCount);
        await this.resources.cleanupScope(scope);
        await this.provider.remove(plan,found);
      }
      if (await this.provider.lookup(plan)!==null ||
          await this.provider.lookup(plan)!==null)
        throw new Error(`shared_test_store_removal_unconfirmed:${store.resourceId}`);
      await this.ready(input.runId,input.leaseId,input.fence,workerCount);
      await this.resources.absent({...scope,
        removeWorkId:`test-store-remove:${input.leaseId}:${store.kind}`,
        providerAbsent:true},at);
    }
  }
}
