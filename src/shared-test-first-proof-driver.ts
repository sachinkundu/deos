import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {D1OrchestrationStore,type OrchestrationRunRecord} from './orchestration-store.ts';
import {requiredProofKinds} from './shared-test-close.ts';
import {SharedTestFirstProofPublisher} from './shared-test-first-proof.ts';
import {SharedTestPrBodyWriter} from './shared-test-pr-body.ts';

interface PendingProof {
  run_id:string;lease_id:string;repository:string;branch:string;
  pull_request_number:number;candidate_commit:string;
}

/** Publish one immutable first proof set while the site still has an owner. */
export class SharedTestFirstProofDriver {
  readonly env:Env;
  readonly githubForRun:(run:OrchestrationRunRecord)=>{
    json<T>(path:string,init?:RequestInit):Promise<T>;
  };
  readonly fetcher:typeof fetch;
  constructor(env:Env,githubForRun:(run:OrchestrationRunRecord)=>{
    json<T>(path:string,init?:RequestInit):Promise<T>;
  }=run=>implementationGitHub(env,run),
  fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.githubForRun=githubForRun;this.fetcher=fetcher;
  }

  async resume():Promise<'idle'|'published'> {
    const kinds=requiredProofKinds.map(()=>'?').join(',');
    const pending=await this.env.DB.prepare(`SELECT l.run_id,l.lease_id,
      l.repository,l.branch,l.pull_request_number,l.candidate_commit
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state IN ('active','quiescing')
        AND e.owner_run_id=l.run_id AND l.pull_request_number IS NOT NULL
        AND (SELECT COUNT(DISTINCT kind) FROM test_proof_items p
          WHERE p.run_id=l.run_id AND p.lease_id=l.lease_id
            AND p.phase='first' AND p.kind IN (${kinds})
            AND p.classification='public_safe' AND p.sanitizer_result='passed'
            AND p.public_sha256 IS NOT NULL AND p.public_url IS NOT NULL)=?
        AND EXISTS (SELECT 1 FROM test_proof_items p
          WHERE p.run_id=l.run_id AND p.lease_id=l.lease_id
            AND p.phase='first' AND p.kind IN (${kinds})
            AND (p.body_marker IS NULL OR p.read_at IS NULL))`)
      .bind(...requiredProofKinds,requiredProofKinds.length,...requiredProofKinds)
      .first<PendingProof>();
    if(!pending)return 'idle';
    const run=await new D1OrchestrationStore(this.env.DB).findRun(pending.run_id);
    if(!run || run.route_repository!==pending.repository ||
        !run.route_github_installation_id)
      throw new Error('test_first_proof_github_route_changed');
    const github=this.githubForRun(run);
    const scopedPull=async(repository:string,number:number):Promise<ImplementationPull>=>{
      if(repository!==pending.repository || number!==pending.pull_request_number)
        throw new Error('test_first_proof_pull_scope_changed');
      const pull=await github.json<ImplementationPull>(`/pulls/${number}`);
      if(pull.number!==number || pull.state!=='open' || pull.draft!==true ||
          pull.head.sha!==pending.candidate_commit ||
          pull.head.ref!==pending.branch ||
          pull.base.repo.full_name!==pending.repository ||
          pull.base.ref!=='main')
        throw new Error('test_first_proof_pull_changed');
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
    await new SharedTestFirstProofPublisher(this.env.DB,writer,this.fetcher)
      .publish(pending.run_id,pending.lease_id);
    return 'published';
  }
}
