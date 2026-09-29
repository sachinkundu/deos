export const sharedReviewFaultKinds=['github_reject_review','github_drop_reply_response','github_advance_after_reply',
  'linear_reject_move','account_identity_mismatch','hold_linear_delivery'] as const;
export type SharedReviewFaultKind=typeof sharedReviewFaultKinds[number];

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
