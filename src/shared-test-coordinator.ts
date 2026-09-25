import {ImplementationStore} from './implementation-store.ts';
import {D1OrchestrationStore} from './orchestration-store.ts';
import {SharedTestDecisionStore} from './shared-test-decision-store.ts';
import {SharedTestLeaseStore,type StagingTrafficRead} from './shared-test-lease.ts';
import {SharedTestAdmission} from './shared-test-admission.ts';
import {LinearCapabilityAdapter} from './linear-capability.ts';
import {implementationGitHub} from './implementation-github.ts';
import type {AdmissionGitHub} from './shared-test-admission.ts';
import type {OrchestrationRunRecord} from './orchestration-store.ts';
import type {LinearTestIssue} from './linear-capability.ts';
import {CloudflareStagingTrafficReader} from './shared-test-staging-traffic.ts';

interface WaitingRequest {
  request_id:string;
  run_id:string;
  node_visit:number;
  attempt_id:string;
  task_id:string;
  candidate_commit:string;
  patch_sha256:string;
  state:string;
}

export function sharedTestStagingTraffic(env:Env):()=>Promise<StagingTrafficRead> {
  const token=(env as Env & {IMPLEMENTATION_ENVIRONMENT_TOKEN?:string})
    .IMPLEMENTATION_ENVIRONMENT_TOKEN;
  if (!token) throw new Error('shared_test_staging_read_token_missing');
  const targets=[
    {serviceName:'bettaview',workerName:'deos-bettaview-portal-staging',
      host:'bettaview-staging.voxdez.com',binding:env.STAGING_BETTAVIEW},
    {serviceName:'portal',workerName:'deos-workflow-portal-staging',
      host:'deos-staging.voxdez.com',binding:env.STAGING_PORTAL},
  ];
  const reader=new CloudflareStagingTrafficReader(env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID,
    token,targets,globalThis.fetch.bind(globalThis),target=>{
      const binding=targets.find(item=>item.serviceName===target.serviceName)?.binding;
      if (!binding) throw new Error('shared_test_staging_binding_missing');
      return binding.fetch(new Request(`https://${target.host}/api/version`,
        {headers:{Accept:'application/json'}}));
    });
  return ()=>reader.read();
}

/** Validate one queue head immediately before the single-owner D1 grant. */
export class SharedTestCoordinator {
  readonly env:Env;
  readonly traffic:()=>Promise<StagingTrafficRead>;
  readonly providers:{linear:{readTestIssue(id:string):Promise<LinearTestIssue>};
    githubForRun(run:OrchestrationRunRecord):AdmissionGitHub};
  constructor(env:Env,traffic:()=>Promise<StagingTrafficRead>,providers?:{
    linear:{readTestIssue(id:string):Promise<LinearTestIssue>};
    githubForRun(run:OrchestrationRunRecord):AdmissionGitHub;
  }) {
    this.env=env;this.traffic=traffic;
    this.providers=providers??{
      linear:new LinearCapabilityAdapter(env.LINEAR_API_URL,env.LINEAR_APP_ACCESS_TOKEN),
      githubForRun:run=>implementationGitHub(env,run),
    };
  }

  async grantHead():Promise<{state:'empty'|'busy'|'waiting'|'granted';leaseId?:string;fence?:number}> {
    const leaseStore=new SharedTestLeaseStore(this.env.DB);
    const environment=await leaseStore.environment();
    if (environment.state!=='free') return {state:'busy'};
    const head=await this.env.DB.prepare(`SELECT * FROM test_lease_requests
      WHERE state IN ('waiting','validating') ORDER BY queue_number LIMIT 1`)
      .first<WaitingRequest>();
    if (!head) return {state:'empty'};
    const run=await new D1OrchestrationStore(this.env.DB).findRun(head.run_id);
    if (!run || run.status!=='active' || run.current_node!=='shared_test_demo' ||
        run.issue_id!==head.task_id)
      throw new Error('shared_test_queue_head_run_changed');
    const implementation=new ImplementationStore(this.env.DB,this.env.ARTIFACTS);
    const work=await implementation.requireRun(head.run_id);
    if (work.pr_head_sha!==head.candidate_commit || work.patch_sha!==head.patch_sha256 ||
        !work.pr_number || work.run_id!==run.run_id)
      throw new Error('shared_test_queue_head_candidate_changed');
    const candidate=await implementation.candidate(work);
    const decision=await new SharedTestDecisionStore(this.env.DB).saved({
      runId:head.run_id,candidateCommit:head.candidate_commit,patchSha256:head.patch_sha256,
      changedPaths:candidate.files.map(file=>file.path),
    });
    const admission=new SharedTestAdmission(this.env.DB,this.providers.linear,
      this.providers.githubForRun(run),this.traffic,
      this.env.LINEAR_TEAM_ID);
    const result=await admission.grant(run,work,decision,{
      requestId:head.request_id,runId:head.run_id,nodeVisit:head.node_visit,
      attemptId:head.attempt_id,taskId:head.task_id,candidateCommit:head.candidate_commit,
      patchSha256:head.patch_sha256,
    });
    return result.state==='granted' ? {state:'granted',leaseId:result.leaseId,fence:result.fence}
      : {state:'waiting'};
  }
}
