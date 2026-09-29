import {sha256Hex} from './implementation-hash.ts';

export const sharedTestSetupRepairRevision='lease-review-runtime-v9';

/** A retry that never reached the demo can be requeued after proven cleanup.
 * Keep the original repair authorization and candidate bound to that lineage. */
export async function sharedTestSetupRetryAllowsRequest(db:D1Database,
  retiredLeaseId:string,requestId:string,runId:string,candidateCommit:string):Promise<boolean> {
  return Boolean(await db.prepare(`SELECT 1 AS ready FROM test_setup_retries r
    WHERE r.retired_lease_id=? AND r.run_id=? AND r.candidate_commit=? AND r.repair_revision=?
      AND (r.request_id=? OR EXISTS (
        SELECT 1 FROM test_leases l JOIN test_lease_aborts a ON a.lease_id=l.lease_id
          JOIN test_lease_abort_guards g ON g.lease_id=l.lease_id AND g.ready=1
          JOIN test_leases original ON original.lease_id=r.retired_lease_id
        WHERE l.request_id=r.request_id AND l.run_id=r.run_id
          AND l.candidate_commit=r.candidate_commit AND l.patch_sha256=original.patch_sha256
          AND l.state='closed' AND a.abort_kind='failed_setup'
          AND a.closed_at IS NOT NULL AND a.receipt_json IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.attempt_id=l.attempt_id)))`)
    .bind(retiredLeaseId,runId,candidateCommit,sharedTestSetupRepairRevision,requestId).first());
}

/** Authorize one fresh lease after a setup-code repair. Existing provider
 * scope, candidate bytes, and failed evidence remain unchanged. */
export async function retryBlockedSharedTestSetup(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET||request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const value=await request.json() as Record<string,unknown>;
  if(!value||Object.keys(value).sort().join(',')!=='candidateCommit,failureEvidenceSha256,leaseId,reason,repairRevision,runId,version'||
    value.version!==1||typeof value.runId!=='string'||!value.runId||
    ![value.leaseId,value.failureEvidenceSha256].every(v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v))||
    typeof value.candidateCommit!=='string'||!/^[a-f0-9]{40}$/.test(value.candidateCommit)||
    value.repairRevision!==sharedTestSetupRepairRevision||typeof value.reason!=='string'||
    value.reason.length<10||value.reason.length>500)
    throw new Error('test_setup_retry_input_invalid');
  const prior=await env.DB.prepare('SELECT * FROM test_setup_retries WHERE retired_lease_id=?')
    .bind(value.leaseId).first<Record<string,unknown>>();
  if(prior) {
    if(prior.run_id!==value.runId||prior.candidate_commit!==value.candidateCommit||
      prior.failure_evidence_sha256!==value.failureEvidenceSha256||prior.repair_revision!==value.repairRevision)
      throw new Error('test_setup_retry_subject_changed');
    return Response.json({state:'authorized',requestId:prior.request_id});
  }
  const subject=await env.DB.prepare(`SELECT a.failure_evidence_key,r.request_id
    FROM test_leases l JOIN test_lease_aborts a ON a.lease_id=l.lease_id
    JOIN test_lease_abort_guards g ON g.lease_id=l.lease_id AND g.ready=1
    JOIN implementation_runs w ON w.run_id=l.run_id AND w.pr_head_sha=l.candidate_commit
    JOIN orchestration_runs o ON o.run_id=l.run_id AND o.status='active' AND o.current_node='shared_test_demo'
    JOIN test_lease_requests r ON r.run_id=l.run_id AND r.candidate_commit=l.candidate_commit
      AND r.patch_sha256=l.patch_sha256 AND r.state='waiting'
    WHERE l.lease_id=? AND l.run_id=? AND l.candidate_commit=? AND l.state='closed'
      AND a.abort_kind='blocked_demo' AND a.closed_at IS NOT NULL
      AND a.failure_evidence_sha256=? AND a.receipt_json IS NOT NULL
      AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1 AND state='free')
      AND NOT EXISTS (SELECT 1 FROM test_leases x WHERE x.run_id=l.run_id AND x.state<>'closed')
      AND (NOT EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=l.lease_id) OR
        EXISTS (SELECT 1 FROM test_review_unpublished_settlements s WHERE s.lease_id=l.lease_id
          AND s.run_id=l.run_id AND s.candidate_commit=l.candidate_commit AND s.cleanup_fence=l.fence+1))
      AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=l.run_id
        AND state IN ('pending','starting','running','collecting'))
    ORDER BY r.queue_number LIMIT 1`)
    .bind(value.leaseId,value.runId,value.candidateCommit,value.failureEvidenceSha256)
    .first<{failure_evidence_key:string;request_id:string}>();
  if(!subject)throw new Error('test_setup_retry_not_ready');
  const evidence=await env.ARTIFACTS.get(subject.failure_evidence_key);
  if(!evidence||await sha256Hex(await evidence.text())!==value.failureEvidenceSha256)
    throw new Error('test_setup_retry_failure_evidence_changed');
  await env.DB.prepare(`INSERT INTO test_setup_retries VALUES (?,?,?,?,?,?,?,?)`)
    .bind(value.leaseId,subject.request_id,value.runId,value.candidateCommit,
      value.failureEvidenceSha256,value.repairRevision,value.reason,new Date().toISOString()).run();
  return Response.json({state:'authorized',requestId:subject.request_id});
}
