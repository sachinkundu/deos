import type {StableStagingBase} from './shared-test-lease.ts';
import {sharedTestStorePlans} from './shared-test-service-plan.ts';
import type {SharedTestBuildStore} from './shared-test-build-store.ts';

type VerifiedBuild=Awaited<ReturnType<SharedTestBuildStore['read']>>;

export interface TestSchemaProvider {
  apply(input:{runId:string;leaseId:string;fence:number;databaseId:string;
    databaseName:string},migrations:ReadonlyMap<string,Uint8Array>):Promise<void>;
}

/** Schema is applied only to the D1 database planned for this exact lease. */
export class SharedTestSchemaProvisioner {
  readonly db:D1Database;
  readonly provider:TestSchemaProvider;
  constructor(db:D1Database,provider:TestSchemaProvider) {
    this.db=db;this.provider=provider;
  }

  async apply(input:{runId:string;leaseId:string;fence:number;base:StableStagingBase},
    portal:VerifiedBuild):Promise<void> {
    const plan=sharedTestStorePlans(input.leaseId,input.base)
      .find(store=>store.kind==='d1_database');
    if (!plan || !portal.migrations.has('migrations/0001_initial.sql'))
      throw new Error('shared_test_schema_bundle_incomplete');
    const row=await this.db.prepare(`SELECT r.remote_id FROM test_resources r
      JOIN test_environment e ON e.owner_lease_id=r.lease_id
        AND e.owner_run_id=r.run_id
      WHERE r.resource_id=? AND r.run_id=? AND r.lease_id=? AND r.kind='d1_database'
        AND r.create_fence=? AND r.provider_key=? AND r.work_id=?
        AND r.plan_state='created' AND r.remote_id IS NOT NULL
        AND e.site_id=1 AND e.state='preparing' AND e.fence=?
        AND e.heartbeat_due_at>?`)
      .bind(plan.resourceId,input.runId,input.leaseId,input.fence,
        plan.providerName,plan.workId,input.fence,new Date().toISOString())
      .first<{remote_id:string}>();
    if (!row) throw new Error('shared_test_schema_database_unconfirmed');
    await this.provider.apply({runId:input.runId,leaseId:input.leaseId,
      fence:input.fence,databaseId:row.remote_id,databaseName:plan.providerName},
      portal.migrations);
  }
}
