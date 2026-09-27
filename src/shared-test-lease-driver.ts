import {SharedTestActivation} from './shared-test-activation.ts';
import {SharedTestAccessIdentityStore} from './shared-test-access-identity.ts';
import {SharedTestCloudflareSchema} from './shared-test-cloudflare-schema.ts';
import {SharedTestCloudflareStores} from './shared-test-cloudflare-stores.ts';
import {SharedTestCloudflareWorkers} from './shared-test-cloudflare-workers.ts';
import {sharedTestCandidateDeployment} from './shared-test-candidate-deployment.ts';
import {SharedTestPreparation} from './shared-test-preparation.ts';
import type {StableStagingBase} from './shared-test-lease.ts';

interface Owner {
  state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
  heartbeat_due_at:string|null;
  attempt_id:string|null;
  base_json:string|null;
  candidate_commit:string|null;
  patch_sha256:string|null;
  base_manifest_id:string|null;
  base_traffic_revision:string|null;
}

export type SharedTestDriverEnv=Pick<Env,'DB'|'ARTIFACTS'|
  'IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID'> & {
  IMPLEMENTATION_ENVIRONMENT_TOKEN?:string;
  SHARED_TEST_ZONE_ID?:string;
  TEST_APP_SERVICE_CLIENT_ID?:string;
  TEST_APP_SERVICE_CLIENT_SECRET?:string;
  TEST_APP_ACCESS_AUD?:string;
  TEST_APP_ACCESS_POLICY_ID?:string;
};

/** Continue one saved preparation; any missing credential leaves the lease owned. */
export class SharedTestLeaseDriver {
  readonly env:SharedTestDriverEnv;
  readonly fetcher:typeof fetch;
  constructor(env:SharedTestDriverEnv,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.fetcher=fetcher;
  }

  async resume(at=new Date()):Promise<'idle'|'active'> {
    const owner=await this.env.DB.prepare(`SELECT e.state,e.owner_run_id,
      e.owner_lease_id,e.fence,e.heartbeat_due_at,l.attempt_id,l.base_json,
      l.candidate_commit,l.patch_sha256,l.base_manifest_id,l.base_traffic_revision
      FROM test_environment e LEFT JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1`).first<Owner>();
    if(!owner)throw new Error('shared_test_environment_missing');
    if(!['preparing','active'].includes(owner.state))return 'idle';
    if(!owner.owner_run_id || !owner.owner_lease_id || !owner.attempt_id ||
      !owner.base_json || !owner.candidate_commit || !owner.patch_sha256 ||
      !owner.base_manifest_id || !owner.base_traffic_revision ||
      !owner.heartbeat_due_at ||
      owner.heartbeat_due_at<=at.toISOString())
      throw new Error('shared_test_preparation_owner_expired');
    const {IMPLEMENTATION_ENVIRONMENT_TOKEN:token,
      SHARED_TEST_ZONE_ID:zoneId,
      TEST_APP_SERVICE_CLIENT_ID:clientId,
      TEST_APP_SERVICE_CLIENT_SECRET:clientSecret,
      TEST_APP_ACCESS_AUD:audience,
      TEST_APP_ACCESS_POLICY_ID:policyId}=this.env;
    if(!clientId || !audience || !policyId)
      throw new Error('shared_test_access_identity_unconfigured');
    const accountId=this.env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID;
    const base=JSON.parse(owner.base_json) as StableStagingBase;
    const input={runId:owner.owner_run_id,leaseId:owner.owner_lease_id,
      fence:owner.fence,attemptId:owner.attempt_id,base};
    const identities=new SharedTestAccessIdentityStore(this.env.DB);
    const identityConfig={audience,policyId,clientId};
    if(owner.state==='active') {
      await identities.provision(input,identityConfig,at);
      await sharedTestCandidateDeployment(this.env,this.fetcher).resume({
          lease_id:owner.owner_lease_id,run_id:owner.owner_run_id,
          attempt_id:owner.attempt_id,fence:owner.fence,
          candidate_commit:owner.candidate_commit,
          patch_sha256:owner.patch_sha256,
          base_manifest_id:owner.base_manifest_id,
          base_traffic_revision:owner.base_traffic_revision,
          base_json:owner.base_json,
        });
      return 'active';
    }
    if(!token || !zoneId || !clientSecret)
      throw new Error('shared_test_preparation_credentials_missing');
    const stores=new SharedTestCloudflareStores(accountId,token,this.fetcher);
    const workers=new SharedTestCloudflareWorkers(this.env.DB,accountId,
      zoneId,token,this.fetcher);
    const schema=new SharedTestCloudflareSchema(accountId,token,this.fetcher);
    await new SharedTestPreparation(this.env.DB,this.env.ARTIFACTS,
      stores,workers,schema).prepare(input);
    await new SharedTestActivation(this.env.DB,plan=>this.fetcher(
      `https://${plan.canonicalHost}/api/version`,{
        method:'GET',headers:{Accept:'application/json',
          'CF-Access-Client-Id':clientId,
          'CF-Access-Client-Secret':clientSecret},
        redirect:'manual',signal:AbortSignal.timeout(20_000),
      })).activate({...input,attemptId:owner.attempt_id});
    await identities.provision(input,identityConfig,at);
    return 'active';
  }
}
