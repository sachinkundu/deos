export const sharedReviewFaultKinds=['github_reject_review','github_drop_reply_response','github_advance_after_reply',
  'linear_reject_move','account_identity_mismatch','hold_linear_delivery'] as const;
export type SharedReviewFaultKind=typeof sharedReviewFaultKinds[number];

/** Do not affect reads before the write, another scenario, or later reads. */
export async function takeSharedReplyReadFault(db:D1Database,leaseId:string,requestId:string):Promise<string|null> {
  const row=await db.prepare(`UPDATE test_review_reply_read_faults SET state='consumed',request_id=?,used_at=?
    WHERE state='armed' AND injection_id IN (
      SELECT i.injection_id FROM test_review_fault_injections i
      JOIN test_review_scenarios s ON s.lease_id=i.lease_id AND s.scenario_id=i.scenario_id
      JOIN test_github_transport_requests r ON r.request_id=i.request_id AND r.lease_id=i.lease_id
      WHERE i.lease_id=? AND i.kind='github_drop_reply_response' AND i.state='consumed'
        AND s.state='ready' AND r.method='POST' AND r.provider_status BETWEEN 200 AND 299
        AND r.finished_at IS NOT NULL)
    RETURNING injection_id`).bind(requestId,new Date().toISOString(),leaseId)
    .first<{injection_id:string}>();
  return row?.injection_id??null;
}

/** Deliberate transport-only faults are durable and explicitly labeled. */
export async function takeSharedReviewFault(db:D1Database,leaseId:string,
  kind:SharedReviewFaultKind,requestId:string):Promise<string|null> {
  const row=await db.prepare(`UPDATE test_review_fault_injections SET state='consumed',
    request_id=?,used_at=? WHERE lease_id=? AND kind=? AND state='armed' AND EXISTS (
      SELECT 1 FROM test_review_scenarios s WHERE s.lease_id=test_review_fault_injections.lease_id
        AND s.scenario_id=test_review_fault_injections.scenario_id AND s.state='ready')
    RETURNING injection_id`).bind(requestId,new Date().toISOString(),leaseId,kind)
    .first<{injection_id:string}>();
  return row?.injection_id??null;
}
