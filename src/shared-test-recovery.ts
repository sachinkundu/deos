import {LinearCapabilityAdapter} from './linear-capability.ts';
import type {LinearTestIssue} from './linear-capability.ts';
import {SharedTestMarkerStore} from './shared-test-marker-store.ts';
import {SharedTestCloseStore,requiredProofKinds} from './shared-test-close.ts';
import {SharedTestResourceCleanup} from './shared-test-resource-cleanup.ts';
import {SharedTestCloudflareStores} from './shared-test-cloudflare-stores.ts';
import {SharedTestCloudflareWorkers} from './shared-test-cloudflare-workers.ts';

type RecoveryEnv=Pick<Env,'DB'|'LINEAR_API_URL'|'LINEAR_APP_ACCESS_TOKEN'> & {
  TEST_MARKER_KEY_V1?:string;
  IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID?:string;
  IMPLEMENTATION_ENVIRONMENT_TOKEN?:string;
  SHARED_TEST_ZONE_ID?:string;
};

interface Owner {
  state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
  create_fence:number|null;
}

interface Marker {
  expectation_id:string;
  run_id:string;
  lease_id:string;
  fence:number;
  task_id:string;
  team_id:string;
}

/** Resume cleanup from D1; the original Workflow and Sandbox are not needed. */
export class SharedTestRecovery {
  readonly env:RecoveryEnv;
  readonly linear?:{
    readTestIssue(id:string):Promise<LinearTestIssue>;
    updateTestIssueDescription(id:string,description:string):Promise<LinearTestIssue>;
    testActorId():Promise<string>;
  };
  constructor(env:RecoveryEnv,linear?:SharedTestRecovery['linear']) {
    this.env=env;this.linear=linear;
  }

  async resume():Promise<void> {
    const owner=await this.env.DB.prepare(`SELECT e.state,e.owner_run_id,e.owner_lease_id,
      e.fence,l.fence AS create_fence FROM test_environment e LEFT JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1`).first<Owner>();
    if (!owner || !['quiescing','cleaning'].includes(owner.state) ||
        !owner.owner_run_id || !owner.owner_lease_id) return;
    const markers=(await this.env.DB.prepare(`SELECT x.expectation_id,x.run_id,x.lease_id,
      x.fence,x.task_id,x.team_id FROM test_expected_events x
      WHERE x.run_id=? AND x.lease_id=? AND NOT EXISTS (
        SELECT 1 FROM test_operations o WHERE o.work_id='test-marker:' ||
          x.expectation_id || ':remove' AND o.run_id=x.run_id AND o.lease_id=x.lease_id
          AND o.kind='linear_marker_remove' AND o.state IN ('done','absent'))
      ORDER BY x.created_at,x.expectation_id`)
      .bind(owner.owner_run_id,owner.owner_lease_id).all<Marker>()).results;
    if (markers.length && !this.env.TEST_MARKER_KEY_V1)
      throw new Error('shared_test_marker_cleanup_key_missing');
    if (markers.length) {
      const linear=this.linear??new LinearCapabilityAdapter(this.env.LINEAR_API_URL,
        this.env.LINEAR_APP_ACCESS_TOKEN);
      const store=new SharedTestMarkerStore(this.env.DB,linear,this.env.TEST_MARKER_KEY_V1!);
      for (const marker of markers) {
        await store.disableAndRemove({expectationId:marker.expectation_id,
          runId:marker.run_id,leaseId:marker.lease_id,taskId:marker.task_id,
          teamId:marker.team_id,fence:marker.fence,cleanupFence:owner.fence});
      }
    }
    if(owner.state==='quiescing') {
      const placeholders=requiredProofKinds.map(()=>'?').join(',');
      const proof=await this.env.DB.prepare(`SELECT COUNT(DISTINCT kind) AS ready
        FROM test_proof_items WHERE lease_id=? AND kind IN (${placeholders})
          AND classification='public_safe' AND sanitizer_result='passed'
          AND public_sha256 IS NOT NULL AND public_url IS NOT NULL
          AND body_marker IS NOT NULL AND read_at IS NOT NULL
          AND projected_at IS NOT NULL`)
        .bind(owner.owner_lease_id,...requiredProofKinds)
        .first<{ready:number}>();
      if(proof?.ready!==requiredProofKinds.length)return;
      await new SharedTestCloseStore(this.env.DB).cleaning(owner.owner_run_id,
        owner.owner_lease_id,owner.fence);
    }
    if(!owner.create_fence || !this.env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID ||
        !this.env.IMPLEMENTATION_ENVIRONMENT_TOKEN || !this.env.SHARED_TEST_ZONE_ID)
      throw new Error('shared_test_cleanup_provider_unconfigured');
    const account=this.env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID;
    const token=this.env.IMPLEMENTATION_ENVIRONMENT_TOKEN;
    const cleanup=new SharedTestResourceCleanup(this.env.DB,
      new SharedTestCloudflareWorkers(this.env.DB,account,
        this.env.SHARED_TEST_ZONE_ID,token),
      new SharedTestCloudflareStores(account,token));
    await cleanup.resume({runId:owner.owner_run_id,leaseId:owner.owner_lease_id,
      createFence:owner.create_fence,cleanupFence:owner.fence});
    const remaining=await this.env.DB.prepare(`SELECT COUNT(*) AS count FROM test_resources
      WHERE lease_id=? AND run_id=? AND plan_state<>'absent'`)
      .bind(owner.owner_lease_id,owner.owner_run_id).first<{count:number}>();
    if(remaining?.count!==0)
      throw new Error('shared_test_cleanup_resources_remain');
    const blocked=await this.env.DB.prepare(`SELECT 1 AS blocked FROM test_access_identities
      WHERE lease_id=? AND absent_at IS NULL LIMIT 1`)
      .bind(owner.owner_lease_id).first<{blocked:number}>();
    if(!blocked) {
      const attestation=await this.env.DB.prepare(`SELECT 1 AS ready FROM test_attestations
        WHERE lease_id=? AND run_id=? AND state='observed' LIMIT 1`)
        .bind(owner.owner_lease_id,owner.owner_run_id).first<{ready:number}>();
      if(attestation?.ready===1)
        await new SharedTestCloseStore(this.env.DB).close(owner.owner_run_id,
          owner.owner_lease_id,owner.fence);
    }
  }
}
