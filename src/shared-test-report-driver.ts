import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {D1OrchestrationStore} from './orchestration-store.ts';
import type {OrchestrationRunRecord} from './orchestration-store.ts';
import {SharedTestPrBodyWriter} from './shared-test-pr-body.ts';
import {SharedTestReportStore} from './shared-test-report.ts';

interface PendingReport {
  run_id:string;
  lease_id:string;
  repository:string;
  branch:string;
  pull_request_number:number;
  candidate_commit:string;
}

/** A close report is retried after the site becomes free, without reclaiming it. */
export class SharedTestReportDriver {
  readonly env:Env;
  readonly githubForRun:(run:OrchestrationRunRecord)=>{
    json<T>(path:string,init?:RequestInit):Promise<T>;
  };
  constructor(env:Env,githubForRun:(run:OrchestrationRunRecord)=>{
    json<T>(path:string,init?:RequestInit):Promise<T>;
  }=run=>implementationGitHub(env,run)) {
    this.env=env;this.githubForRun=githubForRun;
  }

  async resume():Promise<'idle'|'published'> {
    const pending=await this.env.DB.prepare(`SELECT c.run_id,c.lease_id,l.repository,
      l.branch,l.pull_request_number,l.candidate_commit
      FROM test_lease_closures c JOIN test_leases l ON l.lease_id=c.lease_id
      WHERE c.report_state='pending' AND l.state='closed'
      ORDER BY c.committed_at,c.lease_id LIMIT 1`).first<PendingReport>();
    if (!pending) return 'idle';
    const run=await new D1OrchestrationStore(this.env.DB).findRun(pending.run_id);
    if (!run || run.route_repository!==pending.repository ||
        !run.route_github_installation_id)
      throw new Error('shared_test_report_github_route_changed');
    const github=this.githubForRun(run);
    const scopedPull=async(repository:string,number:number):Promise<ImplementationPull>=>{
      if (repository!==pending.repository || number!==pending.pull_request_number)
        throw new Error('shared_test_report_pull_scope_changed');
      const pull=await github.json<ImplementationPull>(`/pulls/${number}`);
      if (pull.number!==number || pull.head.sha!==pending.candidate_commit ||
          pull.head.ref!==pending.branch ||
          pull.base.repo.full_name!==pending.repository)
        throw new Error('shared_test_report_pull_changed');
      return pull;
    };
    const writer=new SharedTestPrBodyWriter(this.env.DB,{
      read:async(repository,number)=>(await scopedPull(repository,number)).body??'',
      write:async(repository,number,body)=>{
        await scopedPull(repository,number);
        await github.json<ImplementationPull>(`/pulls/${number}`,{
          method:'PATCH',body:JSON.stringify({body}),
        });
      },
    });
    await new SharedTestReportStore(this.env.DB,this.env.ARTIFACTS,writer)
      .publish(pending.run_id,pending.lease_id);
    return 'published';
  }
}
