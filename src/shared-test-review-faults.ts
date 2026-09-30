export const sharedReviewFaultKinds=['github_reject_review','github_drop_reply_response','github_advance_after_reply',
  'linear_reject_move','account_identity_mismatch','hold_linear_delivery'] as const;
export type SharedReviewFaultKind=typeof sharedReviewFaultKinds[number];

/** A repeated setup request observes the same fault; it never arms a second one. */
export async function armSharedReviewFault(db:D1Database,leaseId:string,scenario:string,
  kind:SharedReviewFaultKind,reconciliationRead?:'rate_limited') {
  const injectionId=crypto.randomUUID();
  const writes=[db.prepare(`INSERT INTO test_review_fault_injections
    (injection_id,lease_id,scenario_id,kind,state,armed_at)
    SELECT ?,?,?,?,'armed',? WHERE NOT EXISTS (
      SELECT 1 FROM test_review_fault_injections WHERE lease_id=? AND scenario_id=? AND kind=?)
    ON CONFLICT(lease_id,kind) WHERE state='armed' DO NOTHING`)
    .bind(injectionId,leaseId,scenario,kind,new Date().toISOString(),leaseId,scenario,kind)];
  if(reconciliationRead==='rate_limited')writes.push(db.prepare(`INSERT INTO test_review_reply_read_faults
    (injection_id,state) SELECT injection_id,'armed' FROM test_review_fault_injections WHERE injection_id=?`)
    .bind(injectionId));
  await db.batch(writes);
  const saved=await db.prepare(`SELECT i.injection_id,i.state,r.injection_id AS read_fault
    FROM test_review_fault_injections i LEFT JOIN test_review_reply_read_faults r ON r.injection_id=i.injection_id
    WHERE i.lease_id=? AND i.scenario_id=? AND i.kind=? ORDER BY i.armed_at DESC,i.injection_id LIMIT 1`)
    .bind(leaseId,scenario,kind).first<{injection_id:string;state:string;read_fault:string|null}>();
  if(!saved)return {error:'test_review_injection_conflict' as const,
    recovery:'Another scenario already has this fault armed. Read its evidence before clearing it.'};
  if(Boolean(saved.read_fault)!==(reconciliationRead==='rate_limited'))
    return {error:'test_review_injection_parameters_changed' as const,
      recovery:'Reuse the original request. A different fault setup needs a fresh scenario.'};
  return {injectionId:saved.injection_id,synthetic:true,kind,state:saved.state,
    reused:saved.injection_id!==injectionId,reconciliationRead};
}

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
