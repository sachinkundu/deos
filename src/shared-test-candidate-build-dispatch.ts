import {ImplementationStore} from './implementation-store.ts';
import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import type {OrchestrationRunRecord} from './orchestration-store.ts';
import {SharedTestBuildStore} from './shared-test-build-store.ts';
import {sharedTestAffectedServices,sharedTestCandidateReady} from './shared-test-candidate-ready.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';

interface Lease {
  lease_id:string;run_id:string;attempt_id:string;fence:number;
  candidate_commit:string;patch_sha256:string;base_manifest_id:string;
  base_traffic_revision:string;base_json:string;repository:string;
  branch:string;pull_request_number:number;
}

/** Existing GitHub App Contents write permission dispatches a default-branch job. */
export class SharedTestCandidateBuildDispatch {
  readonly env:Env;
  constructor(env:Env) {this.env=env;}

  async resume(at=new Date()):Promise<'idle'|'waiting'|'ready'> {
    const lease=await this.env.DB.prepare(`SELECT l.lease_id,l.run_id,l.attempt_id,
      l.fence,l.candidate_commit,l.patch_sha256,l.base_manifest_id,
      l.base_traffic_revision,l.base_json,l.repository,l.branch,l.pull_request_number
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=l.run_id
        AND e.fence=l.fence AND e.heartbeat_due_at>?
        AND l.state='active'`)
      .bind(at.toISOString()).first<Lease>();
    if(!lease)return 'idle';
    await new SharedTestLeaseStore(this.env.DB).assertWrite(lease.run_id,
      lease.attempt_id,lease.lease_id,lease.fence,at);
    if(await sharedTestCandidateReady(this.env.DB,lease))return 'ready';
    const plans=await sharedTestAffectedServices(this.env.DB,lease);
    const builds=new SharedTestBuildStore(this.env.ARTIFACTS);
    const available=await Promise.all(plans.map(plan=>
      builds.candidate(plan.serviceName,lease.candidate_commit)));
    if(available.every(Boolean))return 'ready';
    const run=await this.env.DB.prepare(`SELECT * FROM orchestration_runs WHERE run_id=?`)
      .bind(lease.run_id).first<OrchestrationRunRecord>();
    if(!run || run.status!=='active' || run.current_node!=='shared_test_demo' ||
        run.route_repository!==lease.repository)
      throw new Error('test_candidate_build_run_changed');
    const work=await new ImplementationStore(this.env.DB,this.env.ARTIFACTS)
      .requireRun(lease.run_id);
    if(work.pr_head_sha!==lease.candidate_commit ||
        work.patch_sha!==lease.patch_sha256 || work.pr_number!==lease.pull_request_number ||
        work.branch!==lease.branch)
      throw new Error('test_candidate_build_work_changed');
    const github=implementationGitHub(this.env,run);
    await github.current(work);
    const pull=await github.json<ImplementationPull>(`/pulls/${lease.pull_request_number}`);
    if(pull.state!=='open' || pull.draft!==true ||
        pull.head.sha!==lease.candidate_commit || pull.head.ref!==lease.branch ||
        pull.base.ref!=='main' || pull.base.repo.full_name!==lease.repository ||
        await github.ref(lease.branch)!==lease.candidate_commit ||
        !work.tree_sha ||
        !await github.matches(lease.candidate_commit,work.tested_base_sha,
          work.tree_sha))
      throw new Error('test_candidate_build_pull_changed');
    // repository_dispatch runs only the workflow file on the default branch.
    await github.file('.github/workflows/shared-test-candidate-build.yml','main');
    const requestId=`candidate-build:${lease.lease_id}`;
    const now=at.toISOString();
    await this.env.DB.prepare(`INSERT OR IGNORE INTO test_candidate_build_requests
      (lease_id,run_id,candidate_commit,request_id,created_at)
      SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment
        WHERE site_id=1 AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(lease.lease_id,lease.run_id,lease.candidate_commit,requestId,
        now,lease.run_id,lease.lease_id,lease.fence,now).run();
    const saved=await this.env.DB.prepare(`SELECT run_id,candidate_commit,request_id,
      dispatch_count,last_dispatch_at FROM test_candidate_build_requests
      WHERE lease_id=?`).bind(lease.lease_id).first<{run_id:string;
        candidate_commit:string;request_id:string;dispatch_count:number;
        last_dispatch_at:string|null}>();
    if(!saved || saved.run_id!==lease.run_id ||
        saved.candidate_commit!==lease.candidate_commit ||
        saved.request_id!==requestId)
      throw new Error('test_candidate_build_request_changed');
    if(saved.dispatch_count>=3)throw new Error('test_candidate_build_dispatch_exhausted');
    const retryBefore=new Date(at.getTime()-20*60_000).toISOString();
    if(saved.last_dispatch_at && saved.last_dispatch_at>retryBefore)return 'waiting';
    const reserved=await this.env.DB.prepare(`UPDATE test_candidate_build_requests
      SET dispatch_count=dispatch_count+1,last_dispatch_at=? WHERE lease_id=?
        AND run_id=? AND candidate_commit=? AND request_id=?
        AND dispatch_count<3 AND (last_dispatch_at IS NULL OR last_dispatch_at<=?)
        AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(now,lease.lease_id,lease.run_id,lease.candidate_commit,requestId,
        retryBefore,lease.run_id,lease.lease_id,lease.fence,now).run();
    if(reserved.meta.changes!==1)return 'waiting';
    await github.json('/dispatches',{method:'POST',body:JSON.stringify({
      event_type:'shared-test-candidate-build',
      client_payload:{leaseId:lease.lease_id,
        candidateCommit:lease.candidate_commit},
    })});
    return 'waiting';
  }
}
