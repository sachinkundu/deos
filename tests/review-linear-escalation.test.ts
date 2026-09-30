import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {D1ReviewContinuationStore,LinearReviewTransitionAdapter} from '../src/review-continuation.ts';

for(const outcome of ['unclear','failed'] as const) test(`Linear ${outcome} finishes its attempt and preserves its original error`,async()=>{
  const db=new ImplementationTestDatabase();seedRun(db);
  try {
    db.sqlite.prepare(`INSERT INTO human_gate_visits
      (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
        pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
      VALUES ('run-1',1,'review','plan','proposal_and_specs','planning',1,'open','owner/repo',
        '9',9,'https://github.com/owner/repo/pull/9','candidate','main',?,'now')`).run('a'.repeat(40));
    const store=new D1ReviewContinuationStore(db as unknown as D1Database),id=crypto.randomUUID();
    await store.prepare({reviewId:id,runId:'run-1',issueId:'issue-1',repository:'owner/repo',pullRequestNumber:9,
      headSha:'a'.repeat(40),gateVisitSequence:1,reviewType:'COMMENT',accountPolicyVersion:1,items:[]},
      'b'.repeat(64),{stateId:'work',stateName:'In Progress',edge:'edit'},'now');
    db.sqlite.prepare("UPDATE review_intents SET github_status='done',review_ready_at='now' WHERE review_id=?").run(id);
    const operation=`review:${id}:linear-state`;
    await store.allocateLinear(id,operation,'now');
    const original=new Error('Original Linear connection failure',{cause:new Error('socket closed token=private-value')});
    let requests=0;
    const adapter=new LinearReviewTransitionAdapter('https://api.linear.app/graphql','token',async()=>{
      requests++;
      if(outcome==='unclear')throw original;
      return Response.json({errors:[{message:'Scope lookup failed before provider write'}]},{status:503});
    });
    const result=await adapter.move('issue-1','work');
    assert.equal(result.outcome,outcome);
    if(outcome==='unclear')assert.equal(result.causeChain[0],original);
    await store.failLinear(id,operation,result,'later');
    const intent=await store.find(id);
    assert.equal(intent?.linear_status,outcome==='unclear'?'host_check_required':'failed_retryable');
    assert.equal(db.sqlite.prepare('SELECT finished_at FROM review_attempts').get()?.finished_at,'later');
    assert.equal(db.sqlite.prepare('SELECT released_at FROM review_continuation_leases').get()?.released_at,null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM workflow_transitions_v2').get()?.n,0);
    const items=db.sqlite.prepare('SELECT * FROM review_ops_items').all();
    assert.equal(items.length,outcome==='unclear'?1:0);
    if(outcome==='unclear') {
      assert.equal(items[0]?.ops_key,`review-linear-host-check:${id}`);
      await assert.rejects(store.prepareLinearRetry(id,'later'),/retry_not_allowed/);
      const fault=JSON.stringify(db.sqlite.prepare('SELECT * FROM review_faults').get());
      assert.match(fault,/Original Linear connection failure/);
      assert.match(fault,/socket closed/);
      assert.match(fault,/stack/);
      assert.equal(fault.includes('private-value'),false);
    }
    assert.equal(requests,1);
  } finally {db.close();}
});
