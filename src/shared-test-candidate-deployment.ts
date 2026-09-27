import {SharedTestBuildStore} from './shared-test-build-store.ts';
import {SharedTestCloudflareSchema} from './shared-test-cloudflare-schema.ts';
import {SharedTestCloudflareWorkers} from './shared-test-cloudflare-workers.ts';
import {sharedTestAffectedServices,sharedTestCandidateReady} from './shared-test-candidate-ready.ts';
import {SharedTestLeaseStore,type StableStagingBase} from './shared-test-lease.ts';
import type {SharedTestServicePlan} from './shared-test-service-plan.ts';

interface Lease {
  lease_id:string;run_id:string;attempt_id:string;fence:number;
  candidate_commit:string;patch_sha256:string;base_manifest_id:string;
  base_traffic_revision:string;base_json:string;
}
interface CandidateVersion {
  canonicalHost:string;sourceSha:string;baseVersionId:string;
  buildInputSha256:string;versionId:string;
}
type Build=NonNullable<Awaited<ReturnType<SharedTestBuildStore['candidate']>>>;

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function sharedTestCandidateDeployment(env:Pick<Env,'DB'|'ARTIFACTS'|
  'IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID'> & {
    IMPLEMENTATION_ENVIRONMENT_TOKEN?:string;SHARED_TEST_ZONE_ID?:string;
    TEST_APP_SERVICE_CLIENT_ID?:string;TEST_APP_SERVICE_CLIENT_SECRET?:string;
  },fetcher?:typeof fetch):SharedTestCandidateDeployment {
  if(!env.IMPLEMENTATION_ENVIRONMENT_TOKEN || !env.SHARED_TEST_ZONE_ID ||
      !env.TEST_APP_SERVICE_CLIENT_ID || !env.TEST_APP_SERVICE_CLIENT_SECRET)
    throw new Error('shared_test_candidate_credentials_missing');
  return new SharedTestCandidateDeployment({db:env.DB,bucket:env.ARTIFACTS,
    accountId:env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID,
    zoneId:env.SHARED_TEST_ZONE_ID,token:env.IMPLEMENTATION_ENVIRONMENT_TOKEN,
    clientId:env.TEST_APP_SERVICE_CLIENT_ID,
    clientSecret:env.TEST_APP_SERVICE_CLIENT_SECRET},fetcher);
}

/** Reconcile only a lease-named Worker; never choose a route from agent input. */
export class SharedTestCandidateDeployment {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  readonly accountId:string;
  readonly zoneId:string;
  readonly token:string;
  readonly clientId:string;
  readonly clientSecret:string;
  readonly fetcher:typeof fetch;
  constructor(input:{db:D1Database;bucket:R2Bucket;accountId:string;zoneId:string;
    token:string;clientId:string;clientSecret:string},
    fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.db=input.db;this.bucket=input.bucket;
    this.accountId=input.accountId;this.zoneId=input.zoneId;
    this.token=input.token;this.clientId=input.clientId;
    this.clientSecret=input.clientSecret;
    this.fetcher=fetcher;
  }

  private async version(plan:SharedTestServicePlan):Promise<CandidateVersion> {
    const response=await this.fetcher(`https://${plan.canonicalHost}/api/version`,{
      headers:{Accept:'application/json','CF-Access-Client-Id':this.clientId,
        'CF-Access-Client-Secret':this.clientSecret},redirect:'manual',
      signal:AbortSignal.timeout(20_000),
    });
    if(!response.ok)throw new Error(`test_candidate_version_http_${response.status}`);
    const value=await response.json() as CandidateVersion;
    if(!value || value.canonicalHost!==plan.canonicalHost ||
        value.baseVersionId!==plan.base.deployVersion || !uuid.test(value.versionId))
      throw new Error(`test_candidate_version_identity_changed:${plan.serviceName}`);
    return value;
  }

  private async assertLease(lease:Lease):Promise<void> {
    await new SharedTestLeaseStore(this.db).assertWrite(lease.run_id,
      lease.attempt_id,lease.lease_id,lease.fence);
  }

  private async claim(lease:Lease,plan:SharedTestServicePlan,
    digest:string):Promise<string|null> {
    const now=new Date(),until=new Date(now.getTime()+120_000).toISOString();
    await this.db.prepare(`INSERT OR IGNORE INTO test_candidate_deploy_operations
      (lease_id,service_name,candidate_commit,build_input_sha256,state,updated_at)
      SELECT ?,?,?,?,'planned',? WHERE EXISTS (SELECT 1 FROM test_environment
        WHERE site_id=1 AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(lease.lease_id,plan.serviceName,lease.candidate_commit,digest,
        now.toISOString(),lease.run_id,lease.lease_id,lease.fence,
        now.toISOString()).run();
    const row=await this.db.prepare(`SELECT candidate_commit,build_input_sha256,state
      FROM test_candidate_deploy_operations WHERE lease_id=? AND service_name=?`)
      .bind(lease.lease_id,plan.serviceName)
      .first<{candidate_commit:string;build_input_sha256:string;state:string}>();
    if(!row || row.candidate_commit!==lease.candidate_commit ||
        row.build_input_sha256!==digest)
      throw new Error('test_candidate_deploy_plan_changed');
    if(row.state==='confirmed') {
      const receipt=await this.db.prepare(`SELECT 1 AS saved FROM
        test_candidate_service_readbacks WHERE lease_id=? AND service_name=?
          AND resource_id=? AND candidate_commit=? AND build_input_sha256=?
          AND fence=?`)
        .bind(lease.lease_id,plan.serviceName,plan.resourceId,
          lease.candidate_commit,digest,lease.fence)
        .first<{saved:number}>();
      if(receipt?.saved!==1)
        throw new Error('test_candidate_confirmed_without_readback');
      return null;
    }
    const id=crypto.randomUUID();
    const claimed=await this.db.prepare(`UPDATE test_candidate_deploy_operations
      SET state='deploying',operation_id=?,lease_until=?,updated_at=?
      WHERE lease_id=? AND service_name=? AND candidate_commit=?
        AND build_input_sha256=? AND state IN ('planned','deploying')
        AND (operation_id IS NULL OR lease_until<?)
        AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(id,until,now.toISOString(),lease.lease_id,plan.serviceName,
        lease.candidate_commit,digest,now.toISOString(),lease.run_id,
        lease.lease_id,lease.fence,now.toISOString()).run();
    return claimed.meta.changes===1?id:null;
  }

  private async migratePortal(lease:Lease,build:Build,
    base:StableStagingBase):Promise<void> {
    const portal=base.services.find(service=>service.serviceName==='portal');
    if(!portal)throw new Error('test_candidate_portal_base_missing');
    const pinned=await new SharedTestBuildStore(this.bucket).read(portal);
    for(const [name,bytes] of pinned.migrations) {
      const candidate=build.build.migrations.get(name);
      if(!candidate || candidate.length!==bytes.length ||
          candidate.some((byte,index)=>byte!==bytes[index]))
        throw new Error(`test_candidate_migration_changed:${name}`);
    }
    const resource=await this.db.prepare(`SELECT remote_id,provider_key FROM test_resources
      WHERE lease_id=? AND run_id=? AND create_fence=? AND kind='d1_database'
        AND plan_state='created'`)
      .bind(lease.lease_id,lease.run_id,lease.fence)
      .first<{remote_id:string;provider_key:string}>();
    if(!resource?.remote_id ||
        resource.provider_key!==`deos-test-portal-db-${lease.lease_id.slice(0,32)}`)
      throw new Error('test_candidate_portal_database_missing');
    await new SharedTestCloudflareSchema(this.accountId,this.token,this.fetcher)
      .apply({runId:lease.run_id,leaseId:lease.lease_id,fence:lease.fence,
        databaseId:resource.remote_id,databaseName:resource.provider_key},
        build.build.migrations,()=>this.assertLease(lease));
  }

  private async deployOne(lease:Lease,plan:SharedTestServicePlan,build:Build,
    base:StableStagingBase):Promise<void> {
    const operation=await this.claim(lease,plan,build.digest);
    if(!operation)return;
    const worker=new SharedTestCloudflareWorkers(this.db,this.accountId,
      this.zoneId,this.token,this.fetcher);
    const resource={resourceId:plan.resourceId,runId:lease.run_id,
      leaseId:lease.lease_id,fence:lease.fence,kind:'test_worker' as const,
      providerKey:plan.canonicalHost,workId:plan.workId,service:plan};
    const before=await this.version(plan);
    if(before.sourceSha===plan.base.sourceCommit &&
        before.buildInputSha256===plan.base.buildInputSha256) {
      if(plan.serviceName==='portal')await this.migratePortal(lease,build,base);
      await this.assertLease(lease);
      await worker.deployCandidate(resource,build.build,lease.candidate_commit);
    } else if(before.sourceSha!==lease.candidate_commit ||
        before.buildInputSha256!==build.digest)
      throw new Error(`test_candidate_unexpected_runtime:${plan.serviceName}`);
    const first=await this.version(plan),firstAt=new Date().toISOString();
    const second=await this.version(plan),secondAt=new Date().toISOString();
    if(first.sourceSha!==lease.candidate_commit ||
        first.buildInputSha256!==build.digest ||
        JSON.stringify(first)!==JSON.stringify(second))
      throw new Error(`test_candidate_version_changed:${plan.serviceName}`);
    const at=new Date().toISOString();
    const results=await this.db.batch([
      this.db.prepare(`INSERT OR REPLACE INTO test_candidate_service_readbacks
        (lease_id,service_name,resource_id,candidate_commit,build_input_sha256,
         running_version_id,fence,first_read_at,second_read_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='active' AND owner_run_id=? AND owner_lease_id=?
            AND fence=? AND heartbeat_due_at>?) AND EXISTS
          (SELECT 1 FROM test_candidate_deploy_operations WHERE lease_id=?
            AND service_name=? AND operation_id=? AND state='deploying'
            AND lease_until>?)`)
        .bind(lease.lease_id,plan.serviceName,plan.resourceId,
          lease.candidate_commit,build.digest,first.versionId,lease.fence,
          firstAt,secondAt,lease.run_id,lease.lease_id,lease.fence,at,
          lease.lease_id,plan.serviceName,operation,at),
      this.db.prepare(`UPDATE test_candidate_deploy_operations SET state='confirmed',
        operation_id=NULL,lease_until=NULL,updated_at=? WHERE lease_id=?
        AND service_name=? AND operation_id=? AND state='deploying'
        AND lease_until>? AND EXISTS (SELECT 1 FROM test_candidate_service_readbacks
          WHERE lease_id=? AND service_name=? AND candidate_commit=?
            AND build_input_sha256=? AND running_version_id=? AND fence=?)`)
        .bind(at,lease.lease_id,plan.serviceName,operation,at,
          lease.lease_id,plan.serviceName,lease.candidate_commit,build.digest,
          first.versionId,lease.fence),
    ]);
    if(results.some(result=>result.meta.changes!==1))
      throw new Error('test_candidate_readback_write_incomplete');
  }

  async verifyReady(lease:Lease):Promise<boolean> {
    await this.assertLease(lease);
    if(!await sharedTestCandidateReady(this.db,lease))return false;
    const plans=await sharedTestAffectedServices(this.db,lease);
    for(const plan of plans) {
      const row=await this.db.prepare(`SELECT build_input_sha256,running_version_id
        FROM test_candidate_service_readbacks WHERE lease_id=? AND service_name=?
          AND resource_id=? AND candidate_commit=? AND fence=?`)
        .bind(lease.lease_id,plan.serviceName,plan.resourceId,
          lease.candidate_commit,lease.fence)
        .first<{build_input_sha256:string;running_version_id:string}>();
      if(!row)throw new Error('test_candidate_readback_disappeared');
      const first=await this.version(plan),second=await this.version(plan);
      if(first.sourceSha!==lease.candidate_commit ||
          first.buildInputSha256!==row.build_input_sha256 ||
          first.versionId!==row.running_version_id ||
          JSON.stringify(first)!==JSON.stringify(second))
        throw new Error(`test_candidate_runtime_drift:${plan.serviceName}`);
    }
    await this.assertLease(lease);
    return true;
  }

  async resume(lease:Lease):Promise<'waiting'|'ready'> {
    await this.assertLease(lease);
    if(await sharedTestCandidateReady(this.db,lease))
      return await this.verifyReady(lease)?'ready':'waiting';
    const plans=await sharedTestAffectedServices(this.db,lease);
    const store=new SharedTestBuildStore(this.bucket);
    const builds=await Promise.all(plans.map(plan=>
      store.candidate(plan.serviceName,lease.candidate_commit)));
    if(builds.some(build=>!build))return 'waiting';
    const base=JSON.parse(lease.base_json) as StableStagingBase;
    for(let index=0;index<plans.length;index++)
      await this.deployOne(lease,plans[index],builds[index]!,base);
    return await this.verifyReady(lease)?'ready':'waiting';
  }
}
