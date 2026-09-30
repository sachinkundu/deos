import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {D1ReviewContinuationStore} from '../src/review-continuation.ts';

for(const outcome of ['unclear','clearly_rejected'] as const) {
  test(`GitHub ${outcome} preserves the error and holds the gate with the right escalation`,async()=>{
    const db=new ImplementationTestDatabase();seedRun(db);
    try {
      db.sqlite.prepare(`INSERT INTO human_gate_visits
        (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
          pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
        VALUES ('run-1',1,'review','plan','proposal_and_specs','planning',1,'open','owner/repo',
          '9',9,'https://github.com/owner/repo/pull/9','candidate','main',?,'now')`).run('a'.repeat(40));
      const store=new D1ReviewContinuationStore(db as unknown as D1Database),id=crypto.randomUUID();
      await store.prepare({reviewId:id,runId:'run-1',issueId:'issue-1',repository:'owner/repo',pullRequestNumber:9,
        headSha:'a'.repeat(40),gateVisitSequence:1,reviewType:'COMMENT',accountPolicyVersion:1,
        items:[{contentItemId:'reply-one',kind:'reply',body:'A checked reply',target:{parentCommentId:7,path:'file.md'}}]},
        'b'.repeat(64),{stateId:'work',stateName:'In Progress',edge:'edit'},'now');
      const permit=await store.nextPermit(id,'github','reply:reply-one','c'.repeat(64),'now');
      await store.failGitHubPart({reviewId:id,partId:'reply:reply-one',permitId:permit.permitId,outcome,
        publicCode:outcome==='unclear'?'github_host_check_required':'github_rejected',
        error:new Error('GitHub reply could not finish',{cause:new Error('Original provider result')}),now:'later'});
      const intent=await store.find(id);
      assert.equal(intent?.github_status,outcome==='unclear'?'host_check_required':'failed_retryable');
      assert.equal(intent?.linear_status,'not_started');
      assert.equal(intent?.linear_operation_id,null);
      assert.equal(db.sqlite.prepare('SELECT released_at FROM review_continuation_leases').get()?.released_at,null);
      assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM workflow_transitions_v2').get()?.n,0);
      const ops=db.sqlite.prepare('SELECT * FROM review_ops_items').all();
      assert.equal(ops.length,outcome==='unclear'?1:0);
      if(outcome==='unclear') {
        assert.equal(ops[0]?.ops_key,`review-github-host-check:${id}`);
        assert.equal(ops[0]?.state,'open');
        await assert.rejects(()=>store.nextPermit(id,'github','reply:reply-one','c'.repeat(64),'later'),/part_not_permitted/);
        assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_attempts').get()?.n,1);
      }
      const fault=db.sqlite.prepare('SELECT * FROM review_faults').get();
      assert.match(JSON.stringify(fault),/Original provider result/);
    } finally {db.close();}
  });
}
