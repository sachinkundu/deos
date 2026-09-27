import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {D1OrchestrationStore,type OrchestrationRunRecord} from './orchestration-store.ts';
import {SharedTestStructuredProofStore} from './shared-test-structured-proof.ts';

interface ReadyLease {
  run_id:string;lease_id:string;repository:string;branch:string;
  pull_request_number:number;candidate_commit:string;
}

/** Copy only checked D1, Linear, and GitHub facts into fixed public fields. */
export class SharedTestStructuredProofDriver {
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
    const lease=await this.env.DB.prepare(`SELECT l.run_id,l.lease_id,
      l.repository,l.branch,l.pull_request_number,l.candidate_commit
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state IN ('active','quiescing')
        AND e.owner_run_id=l.run_id AND l.pull_request_number IS NOT NULL
        AND EXISTS (SELECT 1 FROM test_provider_deliveries p
          JOIN test_delivery_dispatch d ON d.delivery_id=p.delivery_id
          WHERE p.run_id=l.run_id AND p.lease_id=l.lease_id
            AND p.route='test' AND d.state='done')
        AND EXISTS (SELECT 1 FROM test_candidate_service_readbacks c
          WHERE c.lease_id=l.lease_id AND c.candidate_commit=l.candidate_commit)
        AND (SELECT COUNT(DISTINCT kind) FROM test_proof_items
          WHERE run_id=l.run_id AND lease_id=l.lease_id AND phase='first'
            AND kind IN ('d1_read','provider_receipt','github_receipt')
            AND classification='public_safe' AND sanitizer_result='passed')<3`)
      .first<ReadyLease>();
    if(!lease)return 'idle';
    const run=await new D1OrchestrationStore(this.env.DB).findRun(lease.run_id);
    if(!run || run.route_repository!==lease.repository ||
        !run.route_github_installation_id)
      throw new Error('test_structured_proof_github_route_changed');
    const pull=await this.githubForRun(run).json<ImplementationPull>(
      `/pulls/${lease.pull_request_number}`);
    if(pull.number!==lease.pull_request_number || pull.state!=='open' ||
        pull.draft!==true || pull.head.sha!==lease.candidate_commit ||
        pull.head.ref!==lease.branch ||
        pull.base.repo.full_name!==lease.repository)
      throw new Error('test_structured_proof_pull_changed');
    const store=new SharedTestStructuredProofStore(this.env.DB,this.env.ARTIFACTS);
    await store.saveD1Read(lease.run_id,lease.lease_id);
    await store.saveProviderReceipt(lease.run_id,lease.lease_id);
    await store.saveGitHubReceipt(lease.run_id,lease.lease_id,pull);
    return 'published';
  }
}
