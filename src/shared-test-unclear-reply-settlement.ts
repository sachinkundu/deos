import {sha256Hex} from './implementation-hash.ts';
import type {ReviewEvidenceQuery} from './shared-test-settled-review-effects.ts';

type Row=Record<string,unknown>;

/** Check only the labeled lost-response/failed-read exercise. Keep the app's
 * host-check result intact; a cleanup receipt never completes its review. */
export async function checkedUnclearReplies(input:{db:D1Database;leaseId:string;
  repository:string;pullNumber:number;fixtureHead:string;githubUserId:number;intents:Row[];parts:Row[];
  attempts:Row[];query:ReviewEvidenceQuery;github:(path:string)=>Promise<any>}) {
  const {db,leaseId,intents,parts,attempts,query,github}=input;
  const unclear=intents.filter(i=>i.outcome==='host_check_required'&&i.github_status==='host_check_required');
  if(!unclear.length)return [];
  const content=await query<Row>('SELECT * FROM review_content_items ORDER BY review_id,ordinal');
  const observed=await github(`/pulls/${input.pullNumber}/comments?per_page=100`);
  if(!Array.isArray(observed)||observed.length>=100)
    throw new Error('test_review_settlement_reply_listing_incomplete');
  const checked=[];
  for(const intent of unclear) {
    const own=parts.filter(p=>p.review_id===intent.review_id);
    const calls=attempts.filter(a=>a.review_id===intent.review_id);
    const part=own.find(p=>p.kind==='reply'&&p.receipt_status==='host_check_required');
    if(intent.linear_status!=='not_started'||intent.linear_operation_id!==null||
        typeof intent.terminal_at!=='string'||!part||calls.length!==1||
        calls[0].step!=='github'||calls[0].scope_id!==part.part_id||calls[0].outcome!=='unclear'||
        !calls[0].finished_at||own.some(p=>p!==part&&p.receipt_status!=='pending')||
        !own.some(p=>p.kind==='review_bundle'&&p.receipt_status==='pending'))
      throw new Error('test_review_settlement_reply_outcome_unsettled');
    const item=content.find(c=>c.review_id===intent.review_id&&c.content_item_id===part.content_item_id);
    if(!item||item.kind!=='reply'||typeof item.body!=='string'||typeof item.target_json!=='string'||
        part.part_id!==`reply:${item.content_item_id}`||
        await sha256Hex(item.body)!==part.content_digest||part.content_digest!==item.content_digest||
        await sha256Hex(item.target_json)!==part.target_digest||part.target_digest!==item.target_digest)
      throw new Error('test_review_settlement_reply_content_changed');
    const target=JSON.parse(item.target_json);
    if(!Number.isSafeInteger(target.parentCommentId)||target.parentCommentId<=0||typeof target.path!=='string'||!target.path)
      throw new Error('test_review_settlement_reply_target_changed');
    const postPath=`/repos/${input.repository}/pulls/${input.pullNumber}/comments/${target.parentCommentId}/replies`;
    const injections=(await db.prepare(`SELECT i.*,r.request_id AS read_request_id,r.used_at AS read_used_at,
        w.provider_status,w.started_at AS write_started_at,w.finished_at AS write_finished_at,
        w.failure_json AS write_failure_json,g.failure_json AS read_failure_json
      FROM test_review_fault_injections i
      JOIN test_review_scenarios s ON s.lease_id=i.lease_id AND s.scenario_id=i.scenario_id
      JOIN test_review_reply_read_faults r ON r.injection_id=i.injection_id AND r.state='consumed'
      JOIN test_github_transport_requests w ON w.request_id=i.request_id AND w.lease_id=i.lease_id
      JOIN test_github_transport_requests g ON g.request_id=r.request_id AND g.lease_id=i.lease_id
      WHERE i.lease_id=? AND s.scenario_run_id=? AND (s.scenario_id='s07' OR s.scenario_id LIKE 's07-%')
        AND i.kind='github_drop_reply_response' AND i.state='consumed'
        AND w.method='POST' AND w.path=? AND w.provider_status BETWEEN 200 AND 299
        AND w.finished_at IS NOT NULL AND g.finished_at IS NOT NULL
        AND g.method='GET' AND g.path=? AND g.provider_status IS NULL
        AND julianday(i.armed_at)<=julianday(w.started_at)
        AND julianday(w.started_at)>=julianday(?) AND julianday(w.finished_at)<=julianday(?)
        AND julianday(r.used_at)>=julianday(w.finished_at) AND julianday(g.finished_at)<=julianday(?)`)
      .bind(leaseId,intent.run_id,postPath,`/repos/${input.repository}/pulls/${input.pullNumber}/comments`,
        calls[0].started_at,calls[0].finished_at,intent.terminal_at).all<Row>()).results;
    const injection=injections[0];
    if(injections.length!==1||typeof injection.read_failure_json!=='string'||
        typeof injection.write_failure_json!=='string')
      throw new Error('test_review_settlement_reply_injection_missing');
    const readFailure=JSON.parse(injection.read_failure_json);
    if(readFailure.synthetic!==true||readFailure.injection!==injection.injection_id)
      throw new Error('test_review_settlement_reply_injection_changed');
    // This is the candidate's marker contract, including its UTF-8 encoding.
    const metadata={kind:'reply',clientSubmissionId:item.content_item_id,reviewId:intent.review_id,
      partId:part.part_id,headSha:intent.head_sha,path:target.path};
    const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(metadata))))
      .replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
    const marker=`<!-- bettaview:v1 ${encoded} -->`,body=`${item.body.trim()}\n\n${marker}`;
    const matches=observed.filter(r=>typeof r.body==='string'&&r.body.includes(marker));
    const receipt=matches[0];
    if(matches.length!==1||receipt.body!==body||!Number.isSafeInteger(receipt.id)||receipt.id<=0||
        receipt.user?.id!==input.githubUserId||
        // GitHub reanchors commit_id after a later fixture head advance. The
        // original commit and our exact marker must still bind the sent reply.
        (receipt.original_commit_id??receipt.commit_id)!==intent.head_sha||
        ![intent.head_sha,input.fixtureHead].includes(receipt.commit_id)||
        receipt.in_reply_to_id!==target.parentCommentId||receipt.path!==target.path||
        receipt.pull_request_url!==`https://api.github.com/repos/${input.repository}/pulls/${input.pullNumber}`||
        receipt.html_url!==`https://github.com/${input.repository}/pull/${input.pullNumber}#discussion_r${receipt.id}`)
      throw new Error('test_review_settlement_reply_receipt_changed');
    checked.push({kind:'provider_reply_verified_candidate_unresolved' as const,
      reviewId:intent.review_id,partId:part.part_id,item,injection,receipt});
  }
  return checked;
}
