import {sha256Hex} from './implementation-hash.ts';
import type {ReviewEvidenceQuery} from './shared-test-settled-review-effects.ts';

type Row=Record<string,unknown>;
const time=(value:unknown)=>typeof value==='string'?Date.parse(value):NaN;
function overlapsOrInvalid(row:Row,finishedKey:string,start:number,end:number) {
  const began=time(row.started_at),finished=time(row[finishedKey]);
  return !Number.isFinite(began)||
    (row[finishedKey]!==null&&(!Number.isFinite(finished)||finished<began))||
    (began<end&&(row[finishedKey]===null||finished>start));
}

/** Retain an orphaned attempt only when its sole outbound call failed during
 * the trusted scope lookup, before dispatching a mutation. This is cleanup
 * evidence; the candidate's unfinished review is never rewritten as passed. */
export async function checkedUnsentLinearMoves(input:{db:D1Database;leaseId:string;
  resourceId:string;issueId:string;apiUrl:string;intents:Row[];attempts:Row[];
  query:ReviewEvidenceQuery}) {
  const {db,leaseId,intents,attempts,query}=input;
  const unfinished=attempts.filter(a=>a.step==='linear'&&!a.finished_at);
  if(!unfinished.length)return [];
  const runs=await query<Row>('SELECT run_id,status,terminal_at FROM orchestration_runs ORDER BY run_id');
  const operations=await query<Row>("SELECT * FROM provider_operations WHERE capability<>'fixture_input' ORDER BY operation_id");
  const checked=[];
  for(const attempt of unfinished) {
    const intent=intents.find(i=>i.review_id===attempt.review_id);
    const run=runs.find(r=>r.run_id===intent?.run_id);
    const start=time(attempt.started_at),end=time(run?.terminal_at);
    const operation=`review:${intent?.review_id}:linear-state`;
    if(!intent||intent.outcome!=='active'||intent.github_status!=='done'||intent.linear_status!=='moving'||
        intent.linear_operation_id!==operation||intent.linear_delivery_deadline!==null||intent.terminal_at!==null||
        attempt.scope_id!=='linear-state'||attempt.generation!==1||attempt.outcome!==null||attempt.finished_at!==null||
        attempt.permit_id!==`${intent.review_id}:linear:linear-state:1`||attempt.provider_operation_id!==null||attempt.fault_id!==null||
        run?.status!=='canceled'||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||
        await sha256Hex(JSON.stringify({issueId:intent.issue_id,operationId:operation,reviewId:intent.review_id,stateId:intent.target_state_id}))!==attempt.request_digest||
        attempts.some(a=>a!==attempt&&a.step==='linear'&&overlapsOrInvalid(a,'finished_at',start,end))||
        operations.some(o=>overlapsOrInvalid(o,'completed_at',start,end)))
      throw new Error('test_review_settlement_unsent_linear_scope_changed');
    // Count every POST in this interval, including reads and calls under a
    // different resource/fence. Any ambiguity prevents cleanup.
    const requests=(await db.prepare(`SELECT * FROM test_review_provider_requests
      WHERE lease_id=? AND method='POST' AND julianday(started_at)>=julianday(?)
        AND julianday(started_at)<julianday(?) ORDER BY started_at,request_id`)
      .bind(leaseId,attempt.started_at,run.terminal_at).all<Row>()).results;
    const request=requests[0];
    const lease=await db.prepare('SELECT fence FROM test_leases WHERE lease_id=?').bind(leaseId).first<{fence:number}>();
    const failure=typeof request?.failure_json==='string'?JSON.parse(request.failure_json):null;
    if(requests.length!==1||request.resource_id!==input.resourceId||request.fence!==lease?.fence||
        request.target!==input.apiUrl||request.provider_status!==null||
        !Number.isFinite(time(request.finished_at))||time(request.finished_at)<time(request.started_at)||time(request.finished_at)>end||
        typeof failure?.message!=='string'||!/^test_review_scope_read_failed:[345][0-9]{2}:.+/s.test(failure.message)||
        typeof failure.stack!=='string'||!failure.stack.includes('SharedTestReviewProviderTransport.fetch'))
      throw new Error('test_review_settlement_unsent_linear_receipt_missing');
    const deliveries=(await db.prepare(`SELECT e.delivery_id FROM test_review_fixture_events e
      JOIN deliveries d ON d.delivery_id=e.delivery_id AND d.payload_hash=e.payload_sha
      WHERE e.resource_id=? AND e.issue_id=? AND e.to_state_id=?
        AND julianday(e.provider_time)>=julianday(?) AND julianday(e.provider_time)<=julianday(?)`)
      .bind(input.resourceId,input.issueId,intent.target_state_id,attempt.started_at,run.terminal_at).all()).results;
    if(deliveries.length)throw new Error('test_review_settlement_unsent_linear_delivery_present');
    checked.push({kind:'scope_lookup_failed_before_move_candidate_unfinished' as const,
      reviewId:intent.review_id,attempt,retiredRun:run,request});
  }
  return checked;
}
