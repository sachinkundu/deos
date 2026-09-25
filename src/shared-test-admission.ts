import type {ImplementationRun} from './implementation-store.ts';
import type {ImplementationPull} from './implementation-github.ts';
import type {OrchestrationRunRecord} from './orchestration-store.ts';
import type {TestPathDecision} from './shared-test-path-rule.ts';
import {SharedTestLeaseStore,type SharedTestRequest,type StagingTrafficRead} from './shared-test-lease.ts';
import type {LinearTestIssue} from './linear-capability.ts';

export interface AdmissionGitHub {
  repository:string;
  current(work:ImplementationRun):Promise<void>;
  ref(branch:string):Promise<string|null>;
  matches(sha:string,base:string,tree:string):Promise<boolean>;
  json<T>(path:string):Promise<T>;
}

interface Pointer {
  state:string;
  manifest_id:string|null;
  manifest_revision:number|null;
  traffic_revision:string|null;
  revision:number;
}

export class SharedTestAdmission {
  readonly db:D1Database;
  readonly linear:{readTestIssue(taskId:string):Promise<LinearTestIssue>};
  readonly github:AdmissionGitHub;
  readonly traffic:()=>Promise<StagingTrafficRead>;
  readonly teamId:string;
  constructor(db:D1Database,linear:{readTestIssue(taskId:string):Promise<LinearTestIssue>},
    github:AdmissionGitHub,traffic:()=>Promise<StagingTrafficRead>,teamId:string) {
    this.db=db;this.linear=linear;this.github=github;this.traffic=traffic;this.teamId=teamId;
  }

  async grant(run:OrchestrationRunRecord,work:ImplementationRun,decision:TestPathDecision,
    request:SharedTestRequest & {requestId:string},at=new Date()) {
    if (!this.teamId || run.run_id!==work.run_id || !work.pr_head_sha ||
        work.pr_head_sha!==decision.candidateCommit || !work.patch_sha ||
        work.patch_sha!==decision.patchSha256 || !work.pr_number || !work.tree_sha ||
        run.issue_id!==request.taskId || request.runId!==run.run_id ||
        request.candidateCommit!==work.pr_head_sha || request.patchSha256!==work.patch_sha ||
        decision.choice!=='test_required')
      throw new Error('shared_test_admission_subject_changed');
    const issue=await this.linear.readTestIssue(run.issue_id);
    if (issue.id!==run.issue_id || issue.teamId!==this.teamId ||
        issue.identifier!==work.linear_identifier || !issue.title)
      throw new Error('shared_test_admission_team_or_issue_changed');
    await this.github.current(work);
    const pull=await this.github.json<ImplementationPull>(`/pulls/${work.pr_number}`);
    if (pull.number!==work.pr_number || pull.draft!==true || pull.state!=='open' ||
        pull.head.sha!==work.pr_head_sha || pull.head.ref!==work.branch ||
        pull.base.ref!=='main' || pull.base.repo.full_name!==this.github.repository ||
        (await this.github.ref(work.branch))!==work.pr_head_sha ||
        !(await this.github.matches(work.pr_head_sha,work.tested_base_sha,work.tree_sha)))
      throw new Error('shared_test_admission_github_scope_changed');
    const pointer=await this.db.prepare(`SELECT state,manifest_id,manifest_revision,
      traffic_revision,revision FROM staging_release_pointer WHERE site_id=1`).first<Pointer>();
    if (pointer?.state!=='stable' || pointer.manifest_id!==decision.manifestId ||
        pointer.manifest_revision!==decision.manifestRevision || !pointer.traffic_revision)
      throw new Error('shared_test_admission_staging_manifest_changed');
    return new SharedTestLeaseStore(this.db).grantChecked({
      requestId:request.requestId,runId:run.run_id,nodeVisit:request.nodeVisit,
      attemptId:request.attemptId,taskId:run.issue_id,candidateCommit:work.pr_head_sha,
      patchSha256:work.patch_sha,taskKey:issue.identifier,taskTitle:issue.title,
      teamId:this.teamId,stage:'shared_test_demo',repository:this.github.repository,
      branch:work.branch,pullRequestNumber:work.pr_number,
      baseManifestId:decision.manifestId,baseTrafficRevision:pointer.traffic_revision,
      pointerRevision:pointer.revision,
    },this.traffic,at,true);
  }
}
