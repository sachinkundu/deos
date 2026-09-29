import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {sha256Hex} from './implementation-hash.ts';
import {D1OrchestrationStore} from './orchestration-store.ts';
import {mergeProofSection,SharedTestPrBodyWriter} from './shared-test-pr-body.ts';

interface FailedSetup {
  run_id:string;lease_id:string;task_key:string;repository:string;branch:string;
  pull_request_number:number;candidate_commit:string;
}
interface Fault {fault_id:string;safe_code:string;occurred_at:string;}

/** Publish a durable failure note before removing setup resources. */
export class SharedTestFailedSetupProof {
  readonly env:Env;
  constructor(env:Env) {this.env=env;}

  async resume(at=new Date()):Promise<'idle'|'published'> {
    const lease=await this.env.DB.prepare(`SELECT l.run_id,l.lease_id,l.task_key,
      l.repository,l.branch,l.pull_request_number,l.candidate_commit
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state='quiescing' AND e.saved_phase='preparing'
        AND e.owner_run_id=l.run_id AND l.activated_at IS NULL
        AND l.pull_request_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM test_lease_aborts a WHERE a.lease_id=l.lease_id)
        AND NOT EXISTS (SELECT 1 FROM test_attestations a WHERE a.lease_id=l.lease_id)
        AND NOT EXISTS (SELECT 1 FROM test_operations o WHERE o.lease_id=l.lease_id)
        AND NOT EXISTS (SELECT 1 FROM test_expected_events x WHERE x.lease_id=l.lease_id)
        AND NOT EXISTS (SELECT 1 FROM test_provider_deliveries d WHERE d.lease_id=l.lease_id)`)
      .first<FailedSetup>();
    if(!lease)return 'idle';
    const fault=await this.env.DB.prepare(`SELECT fault_id,safe_code,occurred_at
      FROM test_failures WHERE run_id=? AND lease_id=? AND phase='preparing'
      ORDER BY occurred_at,fault_id LIMIT 1`)
      .bind(lease.run_id,lease.lease_id).first<Fault>();
    if(!fault)throw new Error('shared_test_failed_setup_fault_missing');
    const run=await new D1OrchestrationStore(this.env.DB).findRun(lease.run_id);
    if(!run || run.route_repository!==lease.repository ||
        !run.route_github_installation_id)
      throw new Error('shared_test_failed_setup_github_route_changed');
    const github=implementationGitHub(this.env,run);
    const scopedPull=async(repository:string,number:number):Promise<ImplementationPull>=>{
      if(repository!==lease.repository || number!==lease.pull_request_number)
        throw new Error('shared_test_failed_setup_pull_scope_changed');
      const pull=await github.json<ImplementationPull>(`/pulls/${number}`);
      if(pull.number!==number || pull.state!=='open' || pull.draft!==true ||
          pull.head.sha!==lease.candidate_commit || pull.head.ref!==lease.branch ||
          pull.base.repo.full_name!==lease.repository || pull.base.ref!=='main')
        throw new Error('shared_test_failed_setup_pull_changed');
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
    const marker=`deos-test-abort:${lease.lease_id}`;
    const section=[`### ${lease.task_key} shared test setup failed`,
      'This lease stopped before the test app was activated. No app demo or provider test ran.',
      'This is a failed setup, not a passed test or release attestation.',
      `First saved fault: ${fault.fault_id} (${fault.safe_code}, ${fault.occurred_at}).`,
      'Owned setup resources are being removed and checked before the site can be reused.'].join('\n\n');
    const body=await writer.writeSection({repository:lease.repository,
      pullRequestNumber:lease.pull_request_number,
      workId:`test-failed-setup:${lease.lease_id}`,runId:lease.run_id,
      leaseId:lease.lease_id,marker,section},at);
    if(mergeProofSection(body,marker,section)!==body)
      throw new Error('shared_test_failed_setup_body_readback_missing');
    const sectionHash=await sha256Hex(section);
    await this.env.DB.prepare(`INSERT OR IGNORE INTO test_lease_aborts
      (lease_id,run_id,first_fault_id,proof_body_sha256,proof_read_at)
      SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment e
        JOIN test_leases l ON l.lease_id=e.owner_lease_id
        WHERE e.site_id=1 AND e.state='quiescing' AND e.saved_phase='preparing'
          AND e.owner_run_id=? AND e.owner_lease_id=? AND l.activated_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=?)
        AND NOT EXISTS (SELECT 1 FROM test_operations WHERE lease_id=?)
        AND NOT EXISTS (SELECT 1 FROM test_expected_events WHERE lease_id=?)
        AND NOT EXISTS (SELECT 1 FROM test_provider_deliveries WHERE lease_id=?)`)
      .bind(lease.lease_id,lease.run_id,fault.fault_id,sectionHash,
        at.toISOString(),lease.run_id,lease.lease_id,lease.lease_id,
        lease.lease_id,lease.lease_id,lease.lease_id).run();
    const saved=await this.env.DB.prepare(`SELECT run_id,first_fault_id,
      proof_body_sha256,proof_read_at FROM test_lease_aborts WHERE lease_id=?`)
      .bind(lease.lease_id).first<{run_id:string;first_fault_id:string;
        proof_body_sha256:string;proof_read_at:string}>();
    if(!saved || saved.run_id!==lease.run_id ||
        saved.first_fault_id!==fault.fault_id ||
        saved.proof_body_sha256!==sectionHash || !saved.proof_read_at)
      throw new Error('shared_test_failed_setup_proof_write_incomplete');
    return 'published';
  }
}
