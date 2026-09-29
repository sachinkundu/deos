import {sharedTestReviewFixture} from './shared-test-review-profile.ts';
import {checkedUnclearReplies} from './shared-test-unclear-reply-settlement.ts';

type Row=Record<string,unknown>;
export type ReviewEvidenceQuery=<T>(sql:string)=>Promise<T[]>;

/** Failure cleanup can retain completed reviews and clearly rejected writes.
 * The labeled lost-reply exercise needs an independent exact provider receipt;
 * all other unfinished or uncertain calls still block cleanup.
 * This reads evidence only; it never changes the candidate's review records. */
export async function settledReviewEffects(input:{env:Env;runId:string;leaseId:string;
  attemptId:string;scenarioRunIds:string[];count:number;query:ReviewEvidenceQuery;
  guard:()=>Promise<unknown>;request:typeof fetch}) {
  const {env,runId,leaseId,attemptId,query,guard,request}=input;
  const fixture=await sharedTestReviewFixture(env.DB,{run_id:runId,attempt_id:attemptId});
  const intents=await query<Row>('SELECT * FROM review_intents ORDER BY review_id');
  const parts=await query<Row>('SELECT * FROM review_parts ORDER BY review_id,ordinal');
  const attempts=await query<Row>('SELECT * FROM review_attempts ORDER BY review_id,step,scope_id,generation');
  if(intents.length!==input.count || intents.some(i=>
      !input.scenarioRunIds.includes(String(i.run_id)) || i.issue_id!==fixture.issueId ||
      i.repository!==fixture.scope.repository || i.pull_request_number!==fixture.scope.pullRequestNumber ||
      typeof i.review_id!=='string' || !/^[a-f0-9-]{36}$/.test(i.review_id) ||
      typeof i.head_sha!=='string' || !/^[a-f0-9]{40}$/.test(i.head_sha) ||
      !['COMMENT','REQUEST_CHANGES','APPROVE'].includes(String(i.review_type)) ||
      i.target_state_id!==(i.review_type==='APPROVE'?fixture.profile.states.merge:fixture.profile.states.work)))
    throw new Error('test_review_settlement_scope_changed');
  const byId=new Map(intents.map(i=>[i.review_id,i]));
  const token=(env as Env&{IMPLEMENTATION_TEST_GITHUB_TOKEN?:string}).IMPLEMENTATION_TEST_GITHUB_TOKEN;
  if(!token)throw new Error('test_review_settlement_github_credential_missing');
  const github=async(path:string)=>{
    await guard();
    const response=await request(`https://api.github.com/repos/${fixture.scope.repository}${path}`,{
      headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
        'User-Agent':'deos-test-cleanup','X-GitHub-Api-Version':'2022-11-28'},
      redirect:'manual',signal:AbortSignal.timeout(30_000)});
    const raw=await response.text();
    if(!response.ok)throw new Error(`Review settlement ${path}: HTTP ${response.status}: ${raw.replaceAll(token,'[redacted]')}`);
    return JSON.parse(raw);
  };
  const unclearReplies=await checkedUnclearReplies({db:env.DB,leaseId,repository:fixture.scope.repository,
    pullNumber:fixture.scope.pullRequestNumber,githubUserId:fixture.githubUserId,intents,parts,attempts,query,github});
  const checkedReply=(id:unknown)=>unclearReplies.some(r=>r.reviewId===id);
  if(parts.some(p=>!byId.has(p.review_id)) || attempts.some(a=>!byId.has(a.review_id) ||
      !a.finished_at || !['succeeded','clearly_rejected','abandoned',...(checkedReply(a.review_id)?['unclear']:[])].includes(String(a.outcome))))
    throw new Error('test_review_settlement_attempt_unsettled');
  for(const intent of intents) {
    const own=parts.filter(p=>p.review_id===intent.review_id);
    const continued=intent.outcome==='continued' && intent.github_status==='done' &&
      intent.linear_status==='done' && typeof intent.terminal_at==='string';
    const rejected=intent.outcome==='active' && intent.github_status==='failed_retryable' &&
      intent.linear_status==='not_started' && intent.linear_operation_id===null &&
      attempts.some(a=>a.review_id===intent.review_id && a.step==='github' && a.outcome==='clearly_rejected');
    const unstarted=intent.outcome==='active' && intent.github_status==='not_started' &&
      intent.linear_status==='not_started' && intent.linear_operation_id===null && intent.terminal_at===null &&
      !attempts.some(a=>a.review_id===intent.review_id);
    const abandoned=intent.outcome==='abandoned_before_linear' &&
      ['done','abandoned'].includes(String(intent.github_status)) && intent.linear_status==='not_started' &&
      intent.linear_operation_id===null && typeof intent.terminal_at==='string';
    const held=intent.outcome==='host_check_required' && intent.github_status==='done' &&
      intent.linear_status==='host_check_required' && typeof intent.terminal_at==='string' &&
      typeof intent.linear_operation_id==='string' &&
      attempts.some(a=>a.review_id===intent.review_id && a.step==='linear' && a.outcome==='succeeded');
    const unclear=checkedReply(intent.review_id);
    if((!continued&&!rejected&&!unstarted&&!abandoned&&!held&&!unclear) || own.length===0 ||
        ((continued||held)&&!own.some(p=>p.kind==='review_bundle'&&['done','published_prior_intent'].includes(String(p.receipt_status)))) || own.some(p=>
        !['done','published_prior_intent',...(rejected?['failed_retryable','pending']:[]),...(unstarted?['pending']:[]),
          ...(abandoned?['abandoned','pending','failed_retryable']:[]),...(unclear?['host_check_required','pending']:[])].includes(String(p.receipt_status))) ||
        (unstarted&&own.some(p=>!['pending','published_prior_intent'].includes(String(p.receipt_status)))) ||
        ((rejected||abandoned)&&attempts.some(a=>a.review_id===intent.review_id&&a.step!=='github')))
      throw new Error('test_review_settlement_outcome_unsettled');
    for(const part of own) {
      const partAttempts=attempts.filter(a=>a.review_id===part.review_id&&a.step==='github'&&a.scope_id===part.part_id);
      const last=partAttempts.at(-1);
      if(unstarted&&part.receipt_status==='published_prior_intent'&&!parts.some(source=>
          source.review_id===intent.supersedes_review_id&&source.part_id===part.part_id&&
          source.receipt_status==='done'&&source.github_record_id===part.github_record_id&&
          source.github_user_id===part.github_user_id&&source.github_url===part.github_url&&
          byId.get(source.review_id)?.outcome==='abandoned_before_linear'))
        throw new Error('test_review_settlement_prior_receipt_missing');
      if((part.receipt_status==='failed_retryable'&&last?.outcome!=='clearly_rejected') ||
          (part.receipt_status==='pending'&&partAttempts.length>0))
        throw new Error('test_review_settlement_part_unsettled');
    }
  }
  const pull=await github(`/pulls/${fixture.scope.pullRequestNumber}`);
  if(pull.number!==fixture.scope.pullRequestNumber || pull.base?.repo?.full_name!==fixture.scope.repository ||
      pull.head?.ref!==fixture.scope.branch || pull.state!=='open')
    throw new Error('test_review_settlement_pull_changed');
  const receipts=[];
  for(const part of parts.filter(p=>['done','published_prior_intent'].includes(String(p.receipt_status)))) {
    const intent=byId.get(part.review_id)!;
    if(typeof part.github_record_id!=='string'||!/^\d+$/.test(part.github_record_id) ||
        !['reply','review_bundle'].includes(String(part.kind)) || part.github_user_id!==fixture.githubUserId)
      throw new Error('test_review_settlement_receipt_scope_changed');
    const path=part.kind==='reply'?`/pulls/comments/${part.github_record_id}`:
      `/pulls/${fixture.scope.pullRequestNumber}/reviews/${part.github_record_id}`;
    const receipt=await github(path);
    const target=`https://github.com/${fixture.scope.repository}/pull/${fixture.scope.pullRequestNumber}`;
    const event=intent.review_type==='APPROVE'?'APPROVED':intent.review_type==='REQUEST_CHANGES'?'CHANGES_REQUESTED':'COMMENTED';
    if(String(receipt.id)!==part.github_record_id || receipt.user?.id!==fixture.githubUserId ||
        receipt.html_url!==part.github_url || !String(receipt.html_url).startsWith(target+'#') ||
        (part.kind==='reply'?receipt.pull_request_url!==`https://api.github.com/repos/${fixture.scope.repository}/pulls/${fixture.scope.pullRequestNumber}`:
          receipt.state!==event||receipt.commit_id!==intent.head_sha))
      throw new Error('test_review_settlement_receipt_changed');
    receipts.push({reviewId:intent.review_id,partId:part.part_id,receipt});
  }
  const continued=intents.filter(i=>i.outcome==='continued');
  const gates=await query<Row>("SELECT * FROM human_gate_visits WHERE state<>'open' ORDER BY run_id,visit_sequence");
  if(intents.some(i=>checkedReply(i.review_id)&&gates.some(g=>g.run_id===i.run_id&&g.visit_sequence===i.gate_visit_sequence)))
    throw new Error('test_review_settlement_reply_gate_decided');
  const heldDeliveries=[];
  for(const intent of intents.filter(i=>i.outcome==='host_check_required'&&!checkedReply(i.review_id))) {
    const repairs=await query<Row>('SELECT * FROM review_repairs ORDER BY repair_id');
    const ops=await query<Row>('SELECT * FROM review_ops_items ORDER BY review_id');
    const repair=repairs.find(r=>r.review_id===intent.review_id&&r.kind==='delivery_scan'&&r.outcome==='host_check_required');
    const item=ops.find(o=>o.review_id===intent.review_id&&o.state==='open');
    if(!repair || !item || gates.some(g=>g.run_id===intent.run_id&&g.visit_sequence===intent.gate_visit_sequence))
      throw new Error('test_review_settlement_held_delivery_not_retained');
    const receipt=await env.DB.prepare(`SELECT e.*,i.injection_id,i.armed_at,i.used_at FROM test_review_fault_injections i
      JOIN test_review_scenarios s ON s.lease_id=i.lease_id AND s.scenario_id=i.scenario_id
      JOIN test_review_fixture_events e ON e.resource_id=? AND e.issue_id=?
      JOIN deliveries d ON d.delivery_id=e.delivery_id AND d.payload_hash=e.payload_sha
      WHERE i.lease_id=? AND s.scenario_run_id=? AND i.kind='hold_linear_delivery'
        AND i.state IN ('armed','cleared') AND e.actor_id=? AND e.from_state_id=? AND e.to_state_id=?
        AND julianday(e.provider_time)>=julianday(?) AND julianday(e.received_at)<=julianday(?)
        AND julianday(i.armed_at)<=julianday(e.received_at)
        AND (i.used_at IS NULL OR julianday(i.used_at)>=julianday(e.received_at))
        AND NOT EXISTS (SELECT 1 FROM test_review_forwarded_events f WHERE f.lease_id=i.lease_id
          AND f.scenario_id=i.scenario_id AND f.delivery_id=e.delivery_id AND julianday(f.forwarded_at)<=julianday(?))
      ORDER BY e.received_at LIMIT 1`).bind(fixture.resourceId,fixture.issueId,leaseId,intent.run_id,
        env.LINEAR_APP_ACTOR_ID,fixture.profile.states.review,intent.target_state_id,
        intent.created_at,intent.terminal_at,intent.terminal_at).first();
    if(!receipt)throw new Error('test_review_settlement_held_receipt_missing');
    heldDeliveries.push({reviewId:intent.review_id,repair,item,receipt});
  }
  const deliveries=[];
  for(const intent of continued) {
    const gate=gates.find(g=>g.run_id===intent.run_id&&g.visit_sequence===intent.gate_visit_sequence);
    const scenario=input.scenarioRunIds.indexOf(String(intent.run_id));
    const expected=intent.review_type==='APPROVE'?'merge_authorized':'revision_requested';
    if(!gate || scenario<0 || gate.state!==expected || gate.decision_outcome!==expected ||
        gate.repository!==fixture.scope.repository || gate.pull_request_number!==fixture.scope.pullRequestNumber ||
        gate.head_branch!==fixture.scope.branch || gate.approved_head_sha!==intent.head_sha)
      throw new Error('test_review_settlement_gate_changed');
    const receipt=await env.DB.prepare(`SELECT e.* FROM test_review_forwarded_events f
      JOIN test_review_scenarios s ON s.lease_id=f.lease_id AND s.scenario_id=f.scenario_id
      JOIN test_review_fixture_events e ON e.delivery_id=f.delivery_id
      JOIN deliveries d ON d.delivery_id=e.delivery_id AND d.payload_hash=e.payload_sha
      WHERE f.lease_id=? AND s.scenario_run_id=? AND e.delivery_id=? AND e.resource_id=?
        AND e.issue_id=? AND e.from_state_id=? AND e.to_state_id=? AND e.actor_id=?`)
      .bind(leaseId,intent.run_id,gate.decision_delivery_id,fixture.resourceId,fixture.issueId,
        fixture.profile.states.review,intent.target_state_id,env.LINEAR_APP_ACTOR_ID).first();
    if(!receipt)throw new Error('test_review_settlement_signed_delivery_missing');
    deliveries.push({reviewId:intent.review_id,gate,receipt});
  }
  return {kind:'settled_review_effects' as const,intents,parts,attempts,receipts,deliveries,heldDeliveries,unclearReplies};
}
