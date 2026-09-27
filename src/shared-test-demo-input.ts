import {ImplementationStore} from './implementation-store.ts';
import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import type {MaterializedJobInput} from './job-inputs.ts';
import type {OrchestrationRunRecord} from './orchestration-store.ts';
import type {StableStagingBase} from './shared-test-lease.ts';
import {sharedTestServicePlans} from './shared-test-service-plan.ts';
import {sharedTestCandidateReady} from './shared-test-candidate-ready.ts';

interface ActiveLease {
  lease_id:string;
  run_id:string;
  attempt_id:string;
  task_id:string;
  task_key:string;
  task_title:string;
  fence:number;
  base_json:string;
  repository:string;
  branch:string;
  pull_request_number:number;
  candidate_commit:string;
  patch_sha256:string;
  base_manifest_id:string;
  base_traffic_revision:string;
}

/** Frozen, non-secret input for the fresh demo Sandbox. */
export async function sharedTestDemoInput(env:Env,run:OrchestrationRunRecord,
  reservedAttemptId:string):Promise<MaterializedJobInput> {
  const work=await new ImplementationStore(env.DB,env.ARTIFACTS).requireRun(run.run_id);
  if(!work.pr_head_sha || !work.patch_sha || !work.pr_number ||
      !run.route_repository || !reservedAttemptId)
    throw new Error('shared_test_demo_candidate_missing');
  const lease=await env.DB.prepare(`SELECT l.lease_id,l.run_id,l.attempt_id,l.task_id,
    l.task_key,l.task_title,l.fence,l.base_json,l.repository,l.branch,
    l.pull_request_number,l.candidate_commit,l.patch_sha256,l.base_manifest_id,
    l.base_traffic_revision
    FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
    WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=?
      AND e.heartbeat_due_at>? AND l.state='active' AND l.attempt_id=?`)
    .bind(run.run_id,new Date().toISOString(),reservedAttemptId)
    .first<ActiveLease>();
  if(!lease || lease.run_id!==run.run_id || lease.task_id!==run.issue_id ||
      lease.repository!==run.route_repository || lease.branch!==work.branch ||
      lease.pull_request_number!==work.pr_number ||
      lease.candidate_commit!==work.pr_head_sha ||
      lease.patch_sha256!==work.patch_sha)
    throw new Error('shared_test_demo_lease_scope_changed');
  if(!await sharedTestCandidateReady(env.DB,lease))
    throw new Error('shared_test_candidate_not_running');
  const github=implementationGitHub(env,run);
  await github.current(work);
  const pull=await github.json<ImplementationPull>(`/pulls/${work.pr_number}`);
  if(pull.number!==work.pr_number || pull.draft!==true ||
      pull.state!=='open' || pull.head.sha!==work.pr_head_sha ||
      pull.head.ref!==work.branch || pull.base.ref!=='main' ||
      pull.base.repo.full_name!==lease.repository ||
      await github.ref(work.branch)!==work.pr_head_sha ||
      !work.tree_sha ||
      !await github.matches(work.pr_head_sha,work.tested_base_sha,work.tree_sha))
    throw new Error('shared_test_demo_branch_changed');
  const base=JSON.parse(lease.base_json) as StableStagingBase;
  const services=sharedTestServicePlans(lease.lease_id,base);
  const identities=(await env.DB.prepare(`SELECT origin FROM test_access_identities
    WHERE run_id=? AND lease_id=? AND revoked_at IS NULL AND absent_at IS NULL`)
    .bind(run.run_id,lease.lease_id).all<{origin:string}>()).results;
  if(identities.length!==services.length || services.some(service=>
    !identities.some(identity=>identity.origin===`https://${service.canonicalHost}`)))
    throw new Error('shared_test_demo_access_identity_missing');
  return {
    context:JSON.stringify({version:1,runId:run.run_id,
      leaseId:lease.lease_id,fence:lease.fence,
      task:{id:lease.task_id,key:lease.task_key,title:lease.task_title},
      repository:lease.repository,branch:lease.branch,
      pullRequestNumber:lease.pull_request_number,
      candidateCommit:lease.candidate_commit,patchSha256:lease.patch_sha256,
      stagingBase:base,apps:services.map(service=>({
        service:service.serviceName,origin:`https://${service.canonicalHost}`}))}),
    repository:lease.repository,openspecChange:'',
    continuationPatch:null,planningWorkProduct:null,
    designWorkProduct:null,checkoutCommit:work.pr_head_sha,
  };
}
