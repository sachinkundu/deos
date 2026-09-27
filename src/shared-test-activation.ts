import type {StableStagingBase} from './shared-test-lease.ts';
import {sharedTestServicePlans,type SharedTestServicePlan} from './shared-test-service-plan.ts';

interface LeaseRow {
  lease_id:string;
  run_id:string;
  attempt_id:string;
  state:string;
  fence:number;
  base_json:string;
}

interface ResourceRow {
  resource_id:string;
  run_id:string;
  lease_id:string;
  create_fence:number;
  kind:string;
  plan_state:string;
  provider_key:string;
  remote_id:string|null;
  work_id:string;
}

interface RunningVersion {
  canonicalHost:string;
  sourceSha:string;
  baseVersionId:string;
  buildInputSha256:string;
  versionId:string;
}

export interface SharedTestActivationInput {
  runId:string;
  attemptId:string;
  leaseId:string;
  fence:number;
}

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function sameVersion(a:RunningVersion,b:RunningVersion):boolean {
  return a.canonicalHost===b.canonicalHost && a.sourceSha===b.sourceSha &&
    a.baseVersionId===b.baseVersionId && a.buildInputSha256===b.buildInputSha256 &&
    a.versionId===b.versionId;
}

function validVersion(value:RunningVersion,plan:SharedTestServicePlan):boolean {
  return value.canonicalHost===plan.canonicalHost &&
    value.sourceSha===plan.base.sourceCommit &&
    value.baseVersionId===plan.base.deployVersion &&
    value.buildInputSha256===plan.base.buildInputSha256 &&
    typeof value.versionId==='string' && uuid.test(value.versionId);
}

export class SharedTestActivation {
  readonly db:D1Database;
  readonly readVersion:(plan:SharedTestServicePlan)=>Promise<Response>;
  constructor(db:D1Database,readVersion:(plan:SharedTestServicePlan)=>Promise<Response>) {
    this.db=db;this.readVersion=readVersion;
  }

  private async version(plan:SharedTestServicePlan):Promise<RunningVersion> {
    const response=await this.readVersion(plan);
    if (!response.ok) throw new Error(`test_service_version_http_${response.status}`);
    const value=await response.json() as RunningVersion;
    if (!value || !validVersion(value,plan))
      throw new Error(`test_service_version_mismatch:${plan.serviceName}`);
    return value;
  }

  async activate(input:SharedTestActivationInput,at=new Date()):Promise<void> {
    if (!input.runId || !input.attemptId || !input.leaseId ||
        !Number.isSafeInteger(input.fence) || input.fence<1)
      throw new Error('invalid_test_activation');
    const lease=await this.db.prepare(`SELECT lease_id,run_id,attempt_id,state,fence,base_json
      FROM test_leases WHERE lease_id=?`).bind(input.leaseId).first<LeaseRow>();
    if (!lease || lease.run_id!==input.runId || lease.attempt_id!==input.attemptId ||
        lease.fence!==input.fence || lease.state!=='preparing')
      throw new Error('test_activation_lease_fenced');
    const base=JSON.parse(lease.base_json) as StableStagingBase;
    const plans=sharedTestServicePlans(input.leaseId,base);
    const resources=(await this.db.prepare(`SELECT resource_id,run_id,lease_id,create_fence,
      kind,plan_state,provider_key,remote_id,work_id FROM test_resources
      WHERE lease_id=? AND kind='test_worker' ORDER BY resource_id`)
      .bind(input.leaseId).all<ResourceRow>()).results;
    if (resources.length!==plans.length || plans.some(plan=>{
      const row=resources.find(resource=>resource.resource_id===plan.resourceId);
      return !row || row.run_id!==input.runId || row.lease_id!==input.leaseId ||
        row.create_fence!==input.fence || row.plan_state!=='created' ||
        row.provider_key!==plan.canonicalHost || row.remote_id!==plan.workerName ||
        row.work_id!==plan.workId;
    })) throw new Error('test_activation_resources_incomplete');
    const first=await Promise.all(plans.map(plan=>this.version(plan)));
    const second=await Promise.all(plans.map(plan=>this.version(plan)));
    if (first.some((value,index)=>!sameVersion(value,second[index])))
      throw new Error('test_service_version_changed');
    const now=at.toISOString();
    const equalReadbacks=plans.map((plan,index)=>`EXISTS (SELECT 1 FROM test_service_readbacks
      WHERE lease_id=? AND service_name=? AND resource_id=? AND worker_name=?
        AND canonical_host=? AND source_commit=? AND base_version_id=?
        AND build_input_sha256=? AND running_version_id=? AND fence=?)`).join(' AND ');
    const readbackParams=plans.flatMap((plan,index)=>[
      input.leaseId,plan.serviceName,plan.resourceId,plan.workerName,plan.canonicalHost,
      first[index].sourceSha,first[index].baseVersionId,first[index].buildInputSha256,
      first[index].versionId,input.fence,
    ]);
    const resourceGuard=`(SELECT COUNT(*) FROM test_resources WHERE lease_id=?
      AND run_id=? AND kind='test_worker' AND plan_state='created' AND create_fence=?)=?`;
    const results=await this.db.batch([
      ...plans.map((plan,index)=>this.db.prepare(`INSERT OR IGNORE INTO test_service_readbacks
        (lease_id,service_name,resource_id,worker_name,canonical_host,source_commit,
         base_version_id,build_input_sha256,running_version_id,fence,read_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='preparing' AND owner_run_id=? AND owner_lease_id=?
            AND fence=? AND heartbeat_due_at>?)`)
        .bind(input.leaseId,plan.serviceName,plan.resourceId,plan.workerName,
          plan.canonicalHost,first[index].sourceSha,first[index].baseVersionId,
          first[index].buildInputSha256,first[index].versionId,input.fence,now,
          input.runId,input.leaseId,input.fence,now)),
      this.db.prepare(`UPDATE test_leases SET state='active',activated_at=? WHERE lease_id=?
        AND run_id=? AND attempt_id=? AND state='preparing' AND fence=?
        AND ${resourceGuard} AND ${equalReadbacks}`)
        .bind(now,input.leaseId,input.runId,input.attemptId,input.fence,
          input.leaseId,input.runId,input.fence,plans.length,...readbackParams),
      this.db.prepare(`UPDATE test_environment SET state='active',saved_phase='active',
        revision=revision+1,updated_at=? WHERE site_id=1 AND state='preparing'
        AND owner_run_id=? AND owner_lease_id=? AND fence=? AND heartbeat_due_at>?
        AND EXISTS (SELECT 1 FROM test_leases WHERE lease_id=? AND state='active')`)
        .bind(now,input.runId,input.leaseId,input.fence,now,input.leaseId),
      this.db.prepare(`INSERT INTO test_service_activation_guards(lease_id,ready,activated_at)
        VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='active' AND owner_run_id=? AND owner_lease_id=? AND fence=?)
          AND EXISTS (SELECT 1 FROM test_leases WHERE lease_id=? AND state='active'
            AND run_id=? AND attempt_id=? AND fence=?)
          AND ${equalReadbacks} THEN 1 ELSE 0 END,?)`)
        .bind(input.leaseId,input.runId,input.leaseId,input.fence,input.leaseId,
          input.runId,input.attemptId,input.fence,...readbackParams,now),
    ]);
    if (results.some(result=>result.meta.changes!==1))
      throw new Error('test_activation_write_incomplete');
  }
}
