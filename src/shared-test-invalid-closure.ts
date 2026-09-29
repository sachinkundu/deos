import {sha256Hex} from './implementation-hash.ts';

/** Verify the old close exactly as recorded. Absence does not prove settlement. */
export async function readInvalidSharedTestClosure(env:Pick<Env,'DB'|'ARTIFACTS'>,
  runId:string,leaseId:string) {
  const closure=await env.DB.prepare(`SELECT c.* FROM test_lease_closures c
    JOIN test_close_transaction_guards g ON g.lease_id=c.lease_id AND g.ready=1
    WHERE c.lease_id=? AND c.run_id=?`).bind(leaseId,runId)
    .first<{receipt_json:string;cleanup_sha256:string;absence_sha256:string;
      committed_at:string;report_object_key:string|null;report_sha256:string|null;close_revision:number}>();
  if(!closure)throw new Error('test_invalid_closure_receipt_missing');
  const resources=(await env.DB.prepare(`SELECT resource_id,kind,provider_key,plan_state,absent_at
    FROM test_resources WHERE lease_id=? AND run_id=? ORDER BY resource_id`)
    .bind(leaseId,runId).all<Record<string,unknown>>()).results;
  const checks=(await env.DB.prepare(`SELECT resource_id,remove_work_id,remove_state,read_state
    FROM test_cleanup_checks WHERE lease_id=? ORDER BY resource_id`)
    .bind(leaseId).all<Record<string,unknown>>()).results;
  const receipt=JSON.parse(closure.receipt_json) as Record<string,unknown>;
  if(await sha256Hex(JSON.stringify(resources))!==closure.cleanup_sha256 ||
      await sha256Hex(JSON.stringify(checks))!==closure.absence_sha256 ||
      receipt.leaseId!==leaseId || receipt.runId!==runId ||
      receipt.cleanupSha256!==closure.cleanup_sha256 || receipt.absenceSha256!==closure.absence_sha256 ||
      receipt.closeRevision!==closure.close_revision ||
      resources.some(r=>r.plan_state!=='absent'||!r.absent_at||!checks.some(c=>
        c.resource_id===r.resource_id&&c.remove_state==='done'&&c.read_state==='absent')))
    throw new Error('test_invalid_closure_absence_changed');
  let originalReport:string|null=null;
  if(closure.report_object_key || closure.report_sha256) {
    const object=closure.report_object_key?await env.ARTIFACTS.get(closure.report_object_key):null;
    if(!object)throw new Error('test_invalid_closure_report_missing');
    originalReport=await object.text();
    if(await sha256Hex(originalReport)!==closure.report_sha256)
      throw new Error('test_invalid_closure_report_changed');
  }
  const attestations=(await env.DB.prepare('SELECT * FROM test_attestations WHERE lease_id=? AND run_id=?')
    .bind(leaseId,runId).all<Record<string,unknown>>()).results;
  return {closure,resources,checks,attestations,originalReport,
    originalReceiptSha256:await sha256Hex(closure.receipt_json),
    snapshotState:'lost_before_capture' as const,
    limitation:'Cleanup raced the blocked-demo snapshot. The final app database and workflow settlement were not retained. The old complete attestation and pass report are invalid.'};
}

/** Append a failure correction without rewriting the original false pass. */
export async function recordInvalidSharedTestClosure(db:D1Database,input:{
  runId:string;leaseId:string;attemptId:string;candidateCommit:string;faultId:string;
  evidenceKey:string;evidenceSha256:string;sectionSha256:string;now:string;
  retained:Awaited<ReturnType<typeof readInvalidSharedTestClosure>>;
}):Promise<void> {
  const {closure}=input.retained;
  const receipt={...JSON.parse(closure.receipt_json),kind:'blocked_demo',
    invalidated:true,snapshotState:input.retained.snapshotState,
    failureEvidenceSha256:input.evidenceSha256};
  const results=await db.batch([
    db.prepare(`INSERT INTO test_invalid_closures
      (lease_id,run_id,attempt_id,candidate_commit,failure_evidence_key,failure_evidence_sha256,
        original_receipt_sha256,cleanup_sha256,absence_sha256,snapshot_state,recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,'lost_before_capture',?)`)
      .bind(input.leaseId,input.runId,input.attemptId,input.candidateCommit,input.evidenceKey,
        input.evidenceSha256,input.retained.originalReceiptSha256,closure.cleanup_sha256,closure.absence_sha256,input.now),
    db.prepare(`INSERT INTO test_lease_aborts
      (lease_id,run_id,first_fault_id,proof_body_sha256,proof_read_at,abort_kind,attempt_id,
        failure_evidence_key,failure_evidence_sha256,cleanup_sha256,absence_sha256,closed_at,receipt_json)
      VALUES (?,?,?,?,?,'blocked_demo',?,?,?,?,?,?,?)`)
      .bind(input.leaseId,input.runId,input.faultId,input.sectionSha256,input.now,input.attemptId,
        input.evidenceKey,input.evidenceSha256,closure.cleanup_sha256,closure.absence_sha256,
        closure.committed_at,JSON.stringify(receipt)),
    db.prepare(`INSERT INTO test_lease_abort_guards (lease_id,ready,checked_at)
      SELECT ?,CASE WHEN EXISTS (SELECT 1 FROM test_invalid_closures i
        JOIN test_lease_aborts a ON a.lease_id=i.lease_id AND a.run_id=i.run_id
        WHERE i.lease_id=? AND i.failure_evidence_sha256=? AND a.failure_evidence_sha256=i.failure_evidence_sha256
          AND a.closed_at=? AND a.receipt_json=?) THEN 1 ELSE 0 END,?`)
      .bind(input.leaseId,input.leaseId,input.evidenceSha256,closure.committed_at,JSON.stringify(receipt),input.now),
  ]);
  if(results.some(r=>r.meta.changes!==1))throw new Error('test_invalid_closure_correction_incomplete');
}
