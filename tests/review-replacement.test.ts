import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {D1ReviewContinuationStore, ReviewContinuationService, canonicalJson,
  reviewBoundDigest, signServiceAssertion, sha256Hex} from '../src/review-continuation.ts';

test('review replay is read-only, a second intent is rejected, and replacement retains a prior reply receipt',async()=>{
  const db=new ImplementationTestDatabase();seedRun(db);
  try {
    db.sqlite.prepare(`INSERT INTO human_gate_visits
      (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
      pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
      VALUES ('run-1',1,'review','plan','proposal_and_specs','planning',1,'open','owner/repo',
      '9',9,'https://github.com/owner/repo/pull/9','candidate','main',?,'now')`).run('a'.repeat(40));
    const store=new D1ReviewContinuationStore(db as unknown as D1Database);
    const input={reviewId:'original',runId:'run-1',issueId:'issue-1',repository:'owner/repo',pullRequestNumber:9,
      headSha:'a'.repeat(40),gateVisitSequence:1,reviewType:'COMMENT' as const,accountPolicyVersion:1,
      items:[{contentItemId:'reply-one',kind:'reply' as const,body:'A checked reply',target:{parentCommentId:7,path:'file.md'}}]};
    const target={stateId:'work',stateName:'In Progress' as const,edge:'edit' as const};
    await store.prepare(input,'b'.repeat(64),target,'now');
    const before=db.sqlite.prepare('SELECT COUNT(*) n FROM review_parts').get()?.n;
    await store.prepare(input,'b'.repeat(64),target,'later');
    await assert.rejects(()=>store.prepare({...input,items:[]},'c'.repeat(64),target,'later'),/id_clash/);
    const clash=db.sqlite.prepare("SELECT safe_act_facts_json FROM review_faults WHERE public_code='id_clash'").get();
    assert.deepEqual(JSON.parse(String(clash?.safe_act_facts_json)),{savedDigest:'b'.repeat(64),receivedDigest:'c'.repeat(64)});
    assert.equal(await store.latestFault('original'),null);
    // The service has an early replay path, so exercise it as well as the store.
    const authority={issue_id:input.issueId,gate_repository:input.repository,pull_request_number:input.pullRequestNumber,
      frozen_access_account:'reviewer@example.test',frozen_github_user_id:7,
      frozen_linear_user_id:'linear-user',bettaview_account_policy_version:1};
    store.authority=async()=>authority as never;
    const service=new ReviewContinuationService(store,'s'.repeat(32),async()=>input.headSha,()=>new Date('2026-09-30T00:00:00Z'));
    const altered={...input,items:[]};
    const assertion=await signServiceAssertion({method:'prepareReview',bodyDigest:await sha256Hex(canonicalJson(altered)),
      accessAccount:authority.frozen_access_account,githubUserId:7,issuedAt:Date.parse('2026-09-30T00:00:00Z'),nonce:'n'.repeat(32)},'s'.repeat(32));
    await assert.rejects(()=>service.prepare(assertion,altered),/id_clash/);
    const clashes=db.sqlite.prepare("SELECT safe_act_facts_json FROM review_faults WHERE public_code='id_clash'").all();
    assert.equal(clashes.length,2);
    const alteredDigest=await reviewBoundDigest(altered);
    assert.ok(clashes.some(row=>JSON.parse(String(row.safe_act_facts_json)).receivedDigest===alteredDigest));
    assert.equal(await store.latestFault('original'),null);
    await assert.rejects(()=>store.prepare({...input,reviewId:'second'},'d'.repeat(64),target,'later'),/gate_review_in_progress/);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_intents').get()?.n,1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_parts').get()?.n,before);
    const permit=await store.nextPermit('original','github','reply:reply-one','e'.repeat(64),'now');
    await store.completePart({reviewId:'original',partId:'reply:reply-one',permitId:permit.permitId,
      recordId:'11',url:'https://github.com/owner/repo/pull/9#discussion_r11',commitSha:input.headSha,
      githubUserId:7,event:null,receiptDigest:'f'.repeat(64),now:'now'});
    await store.abandonBeforeLinear('original','later');
    await store.refreshHead('run-1',1,input.headSha,'1'.repeat(40),'later');
    await store.prepare({...input,reviewId:'replacement',headSha:'1'.repeat(40),supersedesReviewId:'original'},
      '2'.repeat(64),target,'later');
    const parts=await store.statusParts('replacement');
    assert.equal(parts[0]?.status,'published_prior_intent');
    assert.match(parts[0]?.url??'',/#discussion_r11$/);
    assert.equal(parts[1]?.status,'pending');
    assert.equal(db.sqlite.prepare("SELECT COUNT(*) n FROM review_parts WHERE github_record_id='11' AND receipt_status='done'").get()?.n,1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_attempts').get()?.n,1);
  } finally {db.close();}
});
