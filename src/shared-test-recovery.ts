import {LinearCapabilityAdapter} from './linear-capability.ts';
import type {LinearTestIssue} from './linear-capability.ts';
import {SharedTestMarkerStore} from './shared-test-marker-store.ts';

type RecoveryEnv=Pick<Env,'DB'|'LINEAR_API_URL'|'LINEAR_APP_ACCESS_TOKEN'> & {
  TEST_MARKER_KEY_V1?:string;
};

interface Owner {
  state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
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
    const owner=await this.env.DB.prepare(`SELECT state,owner_run_id,owner_lease_id,fence
      FROM test_environment WHERE site_id=1`).first<Owner>();
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
    if (!markers.length) return;
    if (!this.env.TEST_MARKER_KEY_V1)
      throw new Error('shared_test_marker_cleanup_key_missing');
    const linear=this.linear??new LinearCapabilityAdapter(this.env.LINEAR_API_URL,
      this.env.LINEAR_APP_ACCESS_TOKEN);
    const store=new SharedTestMarkerStore(this.env.DB,linear,this.env.TEST_MARKER_KEY_V1);
    for (const marker of markers) {
      await store.disableAndRemove({expectationId:marker.expectation_id,
        runId:marker.run_id,leaseId:marker.lease_id,taskId:marker.task_id,
        teamId:marker.team_id,fence:marker.fence,cleanupFence:owner.fence});
    }
  }
}
