import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {D1ReviewContinuationStore,expireOverdueReviewDeliveries} from '../src/review-continuation.ts';

test('delivery deadline preserves pending signed work and escalates a missing delivery once',async()=>{
  const db=new ImplementationTestDatabase();seedRun(db);
  try {
    db.sqlite.prepare(`INSERT INTO project_workflow_policies
      (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,
        human_gate_state_id,dispatch_enabled,updated_at,linear_app_actor_id)
      VALUES ('project','implementation',25,?,'owner/repo','Todo','review',1,'now','app')`).run('d'.repeat(64));
    db.sqlite.prepare(`INSERT INTO human_gate_visits
      (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
        pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
      VALUES ('run-1',1,'implementation_review','plan','proposal_and_specs','planning',1,'open','owner/repo',
        '9',9,'https://github.com/owner/repo/pull/9','candidate','main',?,'now')`).run('a'.repeat(40));
    const store=new D1ReviewContinuationStore(db as unknown as D1Database),id=crypto.randomUUID();
    await store.prepare({reviewId:id,runId:'run-1',issueId:'issue-1',repository:'owner/repo',pullRequestNumber:9,
      headSha:'a'.repeat(40),gateVisitSequence:1,reviewType:'APPROVE',accountPolicyVersion:1,items:[]},
      'b'.repeat(64),{stateId:'merge',stateName:'Merging',edge:'trusted_merge'},'2026-09-29T00:00:00.000Z');
    db.sqlite.prepare(`UPDATE review_intents SET github_status='done',linear_status='awaiting_delivery',
      linear_operation_id='review-move',linear_delivery_deadline='2026-09-29T08:00:00.000Z' WHERE review_id=?`).run(id);
    db.sqlite.prepare(`INSERT INTO workflow_event_inbox
      (delivery_id,run_id,correlation_id,event_kind,actor_id,actor_type,provider_time,from_state_id,to_state_id,
        to_state_name,payload_digest,state,created_at) VALUES ('event','run-1','run-1','Issue.update','app',
        'application','2026-09-29T07:59:00.000Z','review','merge','Merging',?,'pending','now')`).run('c'.repeat(64));
    const now=new Date('2026-09-29T08:01:00.000Z');
    await expireOverdueReviewDeliveries(db as unknown as D1Database,now);
    assert.equal((await store.find(id))?.outcome,'active');
    db.sqlite.prepare("UPDATE workflow_event_inbox SET actor_id='other-app' WHERE delivery_id='event'").run();
    await expireOverdueReviewDeliveries(db as unknown as D1Database,now);
    await expireOverdueReviewDeliveries(db as unknown as D1Database,now);
    assert.equal((await store.find(id))?.github_status,'done');
    assert.equal((await store.find(id))?.linear_status,'host_check_required');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_repairs').get()?.n,1);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM review_ops_items').get()?.n,1);
    assert.equal(db.sqlite.prepare('SELECT released_at FROM review_continuation_leases').get()?.released_at,null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM workflow_transitions_v2').get()?.n,0);
  } finally {db.close();}
});
