import {sha256Hex} from './implementation-hash.ts';
import {SharedTestLeaseStore,type StableStagingBase} from './shared-test-lease.ts';
import {sharedTestServicePlans} from './shared-test-service-plan.ts';

interface IdentityRow {
  identity_id:string;
  run_id:string;
  lease_id:string;
  resource_id:string;
  origin:string;
  audience:string;
  policy_id:string;
  principal_sha256:string;
  revoked_at:string|null;
  absent_at:string|null;
}

/** A lease-specific right to use the operator-owned Access service identity. */
export class SharedTestAccessIdentityStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async provision(input:{runId:string;attemptId:string;leaseId:string;
    fence:number;base:StableStagingBase},config:{audience:string;
    policyId:string;clientId:string},at=new Date()):Promise<void> {
    if(!/^[a-f0-9]{64}$/i.test(config.audience) ||
        !/^[a-f0-9-]{36}$/i.test(config.policyId) ||
        !config.clientId)
      throw new Error('shared_test_access_identity_unconfigured');
    await new SharedTestLeaseStore(this.db).assertWrite(input.runId,
      input.attemptId,input.leaseId,input.fence,at);
    const principal=await sha256Hex(`service:${config.clientId}`);
    for(const plan of sharedTestServicePlans(input.leaseId,input.base)) {
      const origin=`https://${plan.canonicalHost}`;
      const identityId=await sha256Hex(JSON.stringify([
        input.leaseId,origin,config.audience,config.policyId,principal]));
      const resourceId=`test-access:${input.leaseId}:${plan.serviceName}`;
      await this.db.prepare(`INSERT OR IGNORE INTO test_access_identities
        (identity_id,run_id,lease_id,resource_id,origin,audience,policy_id,
         principal_sha256,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment e
          JOIN test_leases l ON l.lease_id=e.owner_lease_id
          WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=?
            AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
            AND l.run_id=? AND l.attempt_id=? AND l.state='active'
            AND l.fence=?)`)
        .bind(identityId,input.runId,input.leaseId,resourceId,origin,
          config.audience,config.policyId,principal,at.toISOString(),
          input.runId,input.leaseId,input.fence,at.toISOString(),
          input.runId,input.attemptId,input.fence).run();
      const row=await this.db.prepare(`SELECT * FROM test_access_identities
        WHERE identity_id=?`).bind(identityId).first<IdentityRow>();
      if(!row || row.run_id!==input.runId || row.lease_id!==input.leaseId ||
          row.resource_id!==resourceId || row.origin!==origin ||
          row.audience!==config.audience || row.policy_id!==config.policyId ||
          row.principal_sha256!==principal || row.revoked_at || row.absent_at)
        throw new Error('shared_test_access_identity_conflict');
      const conflicts=await this.db.prepare(`SELECT identity_id FROM test_access_identities
        WHERE lease_id=? AND origin=? AND identity_id<>? LIMIT 1`)
        .bind(input.leaseId,origin,identityId).first<{identity_id:string}>();
      if(conflicts)throw new Error('shared_test_access_identity_conflict');
    }
  }
}
