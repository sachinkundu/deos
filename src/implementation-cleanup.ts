// Only local data belongs to the destroyed sandbox. Browser/provider resources
// have their own absence receipts and must never be marked destroyed here.
export async function markImplementationDataDestroyed(db: D1Database, attemptId: string, sandboxId: string, now: string) {
  await db.prepare(`UPDATE implementation_resources SET status='destroyed',cleanup_receipt=?,updated_at=?
    WHERE attempt_id=? AND kind='local_data' AND status<>'destroyed'
      AND EXISTS (SELECT 1 FROM agent_attempts a WHERE a.attempt_id=? AND a.sandbox_id=?)`)
    .bind(JSON.stringify({sandboxDestroyed:sandboxId}),now,attemptId,attemptId,sandboxId).run();
}

// Repair historical bookkeeping only from recorded sandbox destruction, never
// from a completed author result. No resource is destroyed by this query.
export async function reconcileDestroyedImplementationData(db: D1Database, now: string) {
  await db.prepare(`UPDATE implementation_resources SET status='destroyed',
    cleanup_receipt=json_object('sandboxDestroyed',(SELECT a.sandbox_id FROM agent_attempts a
      WHERE a.attempt_id=implementation_resources.attempt_id)),updated_at=?
    WHERE kind='local_data' AND status<>'destroyed' AND EXISTS
      (SELECT 1 FROM agent_attempts a WHERE a.attempt_id=implementation_resources.attempt_id
        AND a.cleanup_state='destroyed' AND a.state NOT IN ('pending','starting','running','collecting'))`)
    .bind(now).run();
}
