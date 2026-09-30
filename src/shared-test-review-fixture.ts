import {ImplementationProviderTest} from './implementation-provider-test.ts';
import {ImplementationStore,type ImplementationInput,type ImplementationResource} from './implementation-store.ts';
import {SharedTestResourceStore} from './shared-test-resources.ts';
import {sharedTestReviewProfile} from './shared-test-review-profile.ts';
import type {SharedTestReviewBinding} from './shared-test-review-provider.ts';

export async function prepareSharedTestReviewFixture(env:Env,binding:SharedTestReviewBinding) {
  const assertScope=async()=>{
    const row=await env.DB.prepare(`SELECT 1 AS allowed FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id WHERE e.site_id=1
        AND e.state='active' AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=?
        AND e.heartbeat_due_at>? AND l.state='active' AND l.fence=e.fence AND l.attempt_id=?`)
      .bind(binding.runId,binding.leaseId,binding.fence,new Date().toISOString(),binding.attemptId)
      .first<{allowed:number}>();
    if(row?.allowed!==1)throw new Error('test_review_fixture_fenced');
  };
  await assertScope();
  const {row}=await sharedTestReviewProfile(env.DB,binding.runId);
  const store=new ImplementationStore(env.DB,env.ARTIFACTS);
  // The dispatched handoff inherits the source run's frozen provider approval.
  // Its new workflow policy describes the shared runner, not a new provider grant.
  const work=await store.requireRun(row.run_id);
  const input=await store.read<ImplementationInput>(work.input_key,work.input_sha);
  if(input.runId!==row.run_id || !input.policy.safeAdapters.includes(row.adapter_binding))
    throw new Error('test_review_adapter_not_approved');
  const resources=new SharedTestResourceStore(env.DB);
  const plan={resourceId:`review-fixture:${binding.leaseId}`,runId:binding.runId,
    leaseId:binding.leaseId,fence:binding.fence,kind:'review_fixture',
    providerKey:`${binding.attemptId}:safe_test`,workId:`review-fixture:${binding.leaseId}`};
  await resources.beginCreate(plan);
  const result=await new ImplementationProviderTest(env,assertScope,binding.leaseId).fixture(
    binding.runId,binding.attemptId,input.policy.safeAdapters,row.run_id);
  await resources.created(plan,result.resource.resource_id);
  return {resourceId:result.resource.resource_id,...result.fixture};
}

export async function cleanupSharedTestReviewFixtures(env:Env,
  input:{runId:string;leaseId:string;cleanupFence:number}) {
  const resources=new SharedTestResourceStore(env.DB);
  const rows=(await env.DB.prepare(`SELECT resource_id,provider_key FROM test_resources
    WHERE run_id=? AND lease_id=? AND kind='review_fixture'`)
    .bind(input.runId,input.leaseId).all<{resource_id:string;provider_key:string}>()).results;
  for(const row of rows) {
    const scope={resourceId:row.resource_id,runId:input.runId,leaseId:input.leaseId,fence:input.cleanupFence};
    const guard=async()=>{await resources.cleanupScope(scope);};
    await guard();
    const fixture=await env.DB.prepare(`SELECT * FROM test_review_fixtures
      WHERE resource_id=? AND run_id=? AND kind='safe_test' AND provider='github-linear-review-v1'`)
      .bind(row.provider_key,input.runId).first<ImplementationResource>();
    if(!fixture)throw new Error('test_review_cleanup_fixture_missing');
    await new ImplementationProviderTest(env,guard,input.leaseId).cleanup(fixture);
    const checked=await env.DB.prepare(`SELECT status,cleanup_receipt FROM test_review_fixtures
      WHERE resource_id=?`).bind(fixture.resource_id)
      .first<{status:string;cleanup_receipt:string|null}>();
    if(checked?.status!=='destroyed' || !checked.cleanup_receipt)
      throw new Error('test_review_cleanup_unproved');
    await resources.absent({...scope,removeWorkId:`review-fixture-remove:${input.leaseId}`,
      providerAbsent:true});
  }
}
