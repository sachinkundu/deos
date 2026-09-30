/** Fixed journal facts, never a caller-supplied bypass. An abort is incapable
 * of satisfying the successful-candidate release guard. */
export async function isBlockedDemoAbort(db:D1Database,runId:string,leaseId:string):Promise<boolean> {
  const found=await db.prepare(`SELECT 1 AS ready FROM test_lease_aborts a
    JOIN test_leases l ON l.lease_id=a.lease_id AND l.run_id=a.run_id
    JOIN agent_attempts t ON t.attempt_id=a.attempt_id AND t.run_id=a.run_id
    WHERE a.lease_id=? AND a.run_id=? AND a.abort_kind='blocked_demo'
      AND a.proof_read_at IS NOT NULL AND a.failure_evidence_key IS NOT NULL
      AND length(a.failure_evidence_sha256)=64 AND l.attempt_id=t.attempt_id
      AND t.node_id='shared_test_demo' AND (t.state='blocked' OR
        (t.state IN ('failed','interrupted','absolute_timeout') AND t.process_id IS NOT NULL
          AND t.result_class<>'startup_failed') OR
        (t.state='failed' AND t.result_class='startup_failed' AND t.process_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM test_github_sessions WHERE lease_id=l.lease_id)))
      AND t.cleanup_state='destroyed'
      AND NOT EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=l.lease_id AND state='complete')
      AND (NOT EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=l.lease_id) OR
        EXISTS (SELECT 1 FROM test_review_unpublished_settlements s WHERE s.lease_id=l.lease_id
          AND s.run_id=l.run_id AND s.candidate_commit=l.candidate_commit AND s.cleanup_fence=l.fence+1))
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
        AND x.state IN ('pending','starting','running','collecting'))`)
    .bind(leaseId,runId).first<{ready:number}>();
  return found?.ready===1;
}

/** Base apps may activate before candidate setup finishes. Retire that setup
 * only when no demo attempt, reviewer session, or scenario ever started. */
export async function isUnstartedSetupAbort(db:D1Database,runId:string,leaseId:string) {
  const row=await db.prepare(`SELECT 1 AS ready FROM test_lease_aborts a
    JOIN test_leases l ON l.lease_id=a.lease_id AND l.run_id=a.run_id
    WHERE a.lease_id=? AND a.run_id=? AND a.abort_kind='failed_setup'
      AND a.attempt_id=l.attempt_id AND l.activated_at IS NOT NULL
      AND a.proof_read_at IS NOT NULL AND a.failure_evidence_key IS NOT NULL
      AND length(a.failure_evidence_sha256)=64
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.attempt_id=l.attempt_id)
      AND NOT EXISTS (SELECT 1 FROM agent_attempts x WHERE x.run_id=l.run_id
        AND x.state IN ('pending','starting','running','collecting'))
      AND NOT EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=l.lease_id)
      AND NOT EXISTS (SELECT 1 FROM test_github_sessions WHERE lease_id=l.lease_id)
      AND NOT EXISTS (SELECT 1 FROM test_attestations WHERE lease_id=l.lease_id)`)
    .bind(leaseId,runId).first<{ready:number}>();
  return row?.ready===1;
}
