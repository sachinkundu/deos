import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
import {settleUnpublishedReview} from '../src/shared-test-unpublished-settlement.ts';
import {sha256Hex} from '../src/implementation-hash.ts';

function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  const lease='a'.repeat(64),head='b'.repeat(40),build='c'.repeat(64);
  const worker=`deos-test-review-${lease.slice(0,32)}`,database=`deos-test-portal-db-${lease.slice(0,32)}`;
  const databaseId='11111111-1111-4111-8111-111111111111';
  seedRun(db);seedAttempt(db,'attempt-1');
  db.sqlite.exec(`UPDATE orchestration_runs SET current_node='shared_test_demo',status='active';
    UPDATE agent_attempts SET node_id='shared_test_demo',state='blocked',cleanup_state='destroyed',ended_at='now';`);
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
    VALUES ('request','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`).run(head,build);
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,stage,state,fence,
      base_manifest_id,base_traffic_revision,base_json,repository,branch,pull_request_number,
      candidate_commit,patch_sha256,created_at,activated_at)
    VALUES (?,'request','run-1','attempt-1','issue-1','SAC-182','Review','team','shared_test_demo','quiescing',1,
      'base','base','{}','owner/repo','test',137,?,?,'now','now')`).run(lease,head,build);
  db.sqlite.prepare(`UPDATE test_environment SET state='quiescing',owner_run_id='run-1',owner_lease_id=?,fence=2`).run(lease);
  db.sqlite.prepare(`INSERT INTO test_review_runtimes
    (lease_id,run_id,attempt_id,fence,candidate_commit,compiled_sha256,worker_name,workflow_name,hostname)
    VALUES (?,'run-1','attempt-1',1,?,?,?,?,?)`).run(lease,head,build,worker,worker,'test.example');
  db.sqlite.prepare(`INSERT INTO test_resources
    (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,remote_id,work_id,created_at,updated_at)
    VALUES ('db','run-1',?,1,'d1_database','created',?,?,'work','now','now')`).run(lease,database,databaseId);
  db.sqlite.prepare(`INSERT INTO test_review_scenarios VALUES (?,'s01','scenario-1','ready','now')`).run(lease);
  const env={DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'d'.repeat(32),
    IMPLEMENTATION_ENVIRONMENT_TOKEN:'private-test-token',LINEAR_APP_ACTOR_ID:'app-actor'} as unknown as Env;
  const state={intents:0,decisions:0,operations:0,foreign:'',changeOwner:false,lateIntent:false,
    status:'waiting',patches:0,reads:0,factReads:0,requests:0,gates:[] as Record<string,unknown>[],
    operationRows:[] as Record<string,unknown>[],reviewRows:[] as Record<string,unknown>[],
    parts:[] as Record<string,unknown>[],attempts:[] as Record<string,unknown>[],
    repairs:[] as Record<string,unknown>[],ops:[] as Record<string,unknown>[],
    githubWrites:0,githubReceipt:{id:123,user:{id:1},html_url:'https://github.com/owner/test/pull/1#pullrequestreview-123',
      state:'APPROVED',commit_id:'c'.repeat(40)}};
  const provider=async(input:RequestInfo|URL,init?:RequestInit)=>{
    state.requests++;
    const path=new URL(String(input)).pathname;
    if(new URL(String(input)).origin==='https://api.github.com') {
      if(init?.method&&init.method!=='GET')state.githubWrites++;
      assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-github-token');
      if(path.endsWith('/pulls/1'))return Response.json({number:1,state:'open',
        base:{repo:{full_name:'owner/test'}},head:{ref:'deos/canary/attempt-1'}});
      assert.ok(path.endsWith('/pulls/1/reviews/123'));
      return Response.json(state.githubReceipt);
    }
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-test-token');
    let result:unknown;
    if(path.endsWith(`/d1/database/${databaseId}`)) {
      result={uuid:databaseId,name:state.foreign==='database'?'production':database};
      if(state.changeOwner)db.sqlite.exec('UPDATE test_environment SET fence=3');
    } else if(path.endsWith(`/workflows/${worker}`))
      result={name:worker,script_name:state.foreign==='workflow'?'production':worker,class_name:'DeosWorkflow'};
    else if(path.endsWith('/settings'))result={tags:[`deos-review-lease:${lease}`,`deos-review-source:${head}`,`deos-review-build:${build}`]};
    else if(path.endsWith('/query')) {
      const sql=JSON.parse(String(init?.body)).sql;
      assert.match(sql,/^SELECT /);
      if(sql.includes('COUNT(*)')) {
        state.factReads++;
        result=[{success:true,results:[{intents:state.intents+(state.lateIntent&&state.factReads>1?1:0),
          decisions:state.decisions,operations:state.operations}]}];
      } else if(sql.includes('human_gate_visits'))result=[{success:true,results:state.gates}];
      else if(sql.includes('provider_operations'))result=[{success:true,results:state.operationRows}];
      else if(sql.includes('review_intents'))result=[{success:true,results:state.reviewRows}];
      else if(sql.includes('review_parts'))result=[{success:true,results:state.parts}];
      else if(sql.includes('review_attempts'))result=[{success:true,results:state.attempts}];
      else if(sql.includes('review_repairs'))result=[{success:true,results:state.repairs}];
      else if(sql.includes('review_ops_items'))result=[{success:true,results:state.ops}];
      else result=[{success:true,results:[{run_id:state.foreign==='run'?'foreign':'scenario-1',workflow_instance_id:'wf-v1-owned'}]}];
    } else if(path.endsWith('/status')) {
      assert.equal(init?.method,'PATCH');assert.deepEqual(JSON.parse(String(init?.body)),{status:'terminate'});
      assert.equal(state.factReads,1);state.patches++;state.status='terminated';result={};
    } else {
      assert.ok(path.endsWith('/instances/wf-v1-owned'));state.reads++;result={status:state.status,steps:[{original:'retained'}]};
    }
    return Response.json({success:true,result});
  };
  return {db,bucket,env,lease,provider,state};
}

test('unpublished recovery settles only the owned scenario and retains its original responses',async()=>{
  const f=fixture();
  try {
    const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
    assert.equal(f.state.patches,1);assert.equal(f.state.reads,3);
    const text=await (await f.bucket.get(saved!.evidence_key))!.text();
    assert.equal(await sha256Hex(text),saved!.evidence_sha256);
    const evidence=JSON.parse(text);
    assert.equal(evidence.statuses[0].before.status,'waiting');
    assert.equal(evidence.statuses[0].second.status,'terminated');
    assert.equal(evidence.statuses[0].before.steps[0].original,'retained');
    await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
    assert.equal(f.state.patches,1);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_review_unpublished_settlements').get()!.n,1);
  } finally {f.db.close();}
});

for(const invalid of [null,'hash','actor','action','run','receipt'] as const)
test(`unpublished s12 restoration requires signed source and return receipts: ${invalid??'valid'}`,async()=>{
  const f=fixture();
  try {
    const profile={repository:'owner/test',projectId:'project',teamId:'team',githubUserId:1,
      states:{review:'review-state',work:'work-state',merge:'merge-state',canceled:'canceled-state'}};
    const text=JSON.stringify(profile),hash=await sha256Hex(text);
    f.db.sqlite.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)')
      .run('run-1',`github-linear-review-v1@${hash}`,text,hash,'now','operator');
    f.db.sqlite.prepare(`INSERT INTO test_review_fixtures
      (resource_id,run_id,attempt_id,lease_id,kind,slot_id,allocation_op,provider,status,metadata_json,created_at,updated_at)
      VALUES ('fixture','run-1','attempt-1',?,'safe_test','slot','allocate','github-linear-review-v1','ready',?,'now','now')`)
      .run(f.lease,JSON.stringify({profile,branch:'deos/canary/attempt-1',head:'c'.repeat(40),pullNumber:1,issueId:'fixture-issue'}));
    f.db.sqlite.exec("UPDATE test_review_scenarios SET scenario_id='s12'");
    for(const [id,from,to,time] of [
      ['source','review-state','work-state','2026-09-29T16:00:00Z'],
      ['restored','work-state','review-state','2026-09-29T16:00:02Z'],
    ]) {
      f.db.sqlite.prepare("INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification) VALUES (?,'hash',?,'test_review_fixture')").run(id,time);
      f.db.sqlite.prepare("INSERT INTO test_review_fixture_events VALUES (?,'fixture','fixture-issue','app-actor',?, ?,?,'hash',?,'user')").run(id,from,to,time,time);
      f.db.sqlite.prepare("INSERT INTO test_review_forwarded_events VALUES (?,'s12',?,?)").run(f.lease,id,time);
    }
    const restoration={operation_id:'scenario-1:review:linear-repair:source:1',run_id:'scenario-1',
      capability:'linear.transition',action:'restore_human_gate',sanitized_target:'review-state',
      request_digest:await sha256Hex(JSON.stringify({issueId:'fixture-issue',targetStateId:'review-state',action:'restore_human_gate'})),
      state:'pending',observed_pre_state:'work-state',latest_delivery_id:'source',started_at:'2026-09-29T16:00:01Z',review_id:null};
    const entered={...restoration,operation_id:'scenario-1:review:linear-enter-human-gate:1',
      action:'enter_human_gate',state:'reconciled',observed_pre_state:'review-state',latest_delivery_id:null,
      request_digest:await sha256Hex(JSON.stringify({issueId:'fixture-issue',targetStateId:'review-state',action:'enter_human_gate'}))};
    f.state.operations=2;f.state.operationRows=[restoration,entered];
    if(invalid==='hash')f.db.sqlite.exec("UPDATE deliveries SET payload_hash='changed' WHERE delivery_id='restored'");
    if(invalid==='actor')f.db.sqlite.exec("UPDATE test_review_fixture_events SET actor_id='stranger' WHERE delivery_id='restored'");
    if(invalid==='action')restoration.action='publish_review';
    if(invalid==='run')restoration.run_id='foreign';
    if(invalid==='receipt')f.db.sqlite.exec("DELETE FROM test_review_forwarded_events WHERE delivery_id='restored'");
    if(invalid) {
      await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present|restoration_scope_changed|restoration_receipt_missing/);
      assert.equal(f.state.patches,0);
    } else {
      const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
      const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
      assert.equal(evidence.settledFacts.fixtureOperations[0].receipt.delivery_id,'restored');
      assert.equal(evidence.settledFacts.fixtureOperations[0].operation.state,'pending');
      assert.equal(f.state.patches,1);
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()?.n,0);
    }
  }finally{f.db.close();}
});

for(const field of ['intents','decisions','operations'] as const) test(`recovery refuses existing ${field} before any workflow mutation`,async()=>{
  const f=fixture();f.state[field]=1;
  try {
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present|test_reviewer_profile_missing_or_changed/);
    assert.equal(f.state.patches,0);assert.equal(f.bucket.objects.size,0);
  } finally {f.db.close();}
});

for(const foreign of ['database','workflow','run']) test(`recovery refuses a foreign ${foreign}`,async()=>{
  const f=fixture();f.state.foreign=foreign;
  try {
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/identity_changed|run_scope_changed/);
    assert.equal(f.state.patches,0);
  } finally {f.db.close();}
});

test('recovery stops on changed ownership and rechecks effects after workflows settle',async()=>{
  const f=fixture();f.state.changeOwner=true;
  try {
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/not_quiescent/);
    assert.equal(f.state.requests,1);assert.equal(f.state.patches,0);
    f.db.sqlite.exec('UPDATE test_environment SET fence=2');f.state.changeOwner=false;f.state.lateIntent=true;
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present|test_reviewer_profile_missing_or_changed/);
    assert.equal(f.state.patches,1);assert.equal(f.bucket.objects.size,0);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_review_unpublished_settlements').get()!.n,0);
  } finally {f.db.close();}
});

for(const invalid of [null,'hash','scenario','fixture','outcome'] as const)
test(`unpublished s12 decision requires its exact provider receipt: ${invalid??'valid'}`,async()=>{
  const f=fixture();
  try {
    const profile={repository:'owner/test',projectId:'project',teamId:'team',githubUserId:1,
      states:{review:'review-state',work:'work-state',merge:'merge-state',canceled:'canceled-state'}};
    const profileText=JSON.stringify(profile),profileHash=await sha256Hex(profileText);
    f.db.sqlite.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)')
      .run('run-1',`github-linear-review-v1@${profileHash}`,profileText,profileHash,'now','operator');
    const metadata={profile,branch:'deos/canary/attempt-1',head:'c'.repeat(40),pullNumber:1,issueId:'fixture-issue'};
    f.db.sqlite.prepare(`INSERT INTO test_review_fixtures
      (resource_id,run_id,attempt_id,lease_id,kind,slot_id,allocation_op,provider,status,metadata_json,created_at,updated_at)
      VALUES ('fixture','run-1','attempt-1',?,'safe_test','slot','allocate','github-linear-review-v1','ready',?,'now','now')`)
      .run(f.lease,JSON.stringify(metadata));
    f.db.sqlite.exec("UPDATE test_review_scenarios SET scenario_id='s12'");
    f.db.sqlite.exec(`INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification)
      VALUES ('delivery','hash','now','test_review_fixture')`);
    f.db.sqlite.exec(`INSERT INTO test_review_fixture_events VALUES
      ('delivery','fixture','fixture-issue','actor','review-state','work-state','now','hash','now','user')`);
    f.db.sqlite.prepare("INSERT INTO test_review_forwarded_events VALUES (?,'s12','delivery','now')").run(f.lease);
    f.state.decisions=1;
    f.state.gates=[{run_id:'scenario-1',state:'revision_requested',decision_outcome:'revision_requested',
      decision_delivery_id:'delivery',repository:profile.repository,pull_request_number:1,head_branch:metadata.branch}];
    if(invalid==='hash')f.db.sqlite.exec("UPDATE deliveries SET payload_hash='changed'");
    if(invalid==='scenario')f.state.gates[0].run_id='unknown-run';
    if(invalid==='fixture')f.state.gates[0].pull_request_number=2;
    if(invalid==='outcome')f.state.gates[0].state='merge_authorized';
    if(invalid) {
      await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present|decision_scope_changed|decision_receipt_missing/);
      assert.equal(f.state.patches,0);
    } else {
      const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
      const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
      assert.equal(evidence.facts.fixtureDecisions[0].receipt.delivery_id,'delivery');
      assert.equal(evidence.settledFacts.fixtureDecisions[0].gate.state,'revision_requested');
      assert.equal(f.state.patches,1);
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()?.n,0);
    }
  }finally{f.db.close();}
});

async function publishedFixture() {
  const f=fixture();
  const profile={repository:'owner/test',projectId:'project',teamId:'team',githubUserId:1,
    states:{review:'review-state',work:'work-state',merge:'merge-state',canceled:'canceled-state'}};
  const text=JSON.stringify(profile),hash=await sha256Hex(text);
  f.db.sqlite.prepare('INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)')
    .run('run-1',`github-linear-review-v1@${hash}`,text,hash,'now','operator');
  f.db.sqlite.prepare(`INSERT INTO test_review_fixtures
    (resource_id,run_id,attempt_id,lease_id,kind,slot_id,allocation_op,provider,status,metadata_json,created_at,updated_at)
    VALUES ('fixture','run-1','attempt-1',?,'safe_test','slot','allocate','github-linear-review-v1','ready',?,'now','now')`)
    .run(f.lease,JSON.stringify({profile,branch:'deos/canary/attempt-1',head:'c'.repeat(40),pullNumber:1,issueId:'fixture-issue'}));
  Object.assign(f.env,{IMPLEMENTATION_TEST_GITHUB_TOKEN:'private-github-token'});
  const id='11111111-1111-4111-8111-111111111111';
  f.state.intents=1;f.state.decisions=1;
  f.state.reviewRows=[{review_id:id,run_id:'scenario-1',issue_id:'fixture-issue',repository:'owner/test',
    pull_request_number:1,head_sha:'c'.repeat(40),review_type:'APPROVE',gate_visit_sequence:1,
    target_state_id:'merge-state',outcome:'continued',github_status:'done',linear_status:'done',
    terminal_at:'now',linear_operation_id:'review:1:linear-state'}];
  f.state.parts=[{review_id:id,part_id:'review_bundle',kind:'review_bundle',receipt_status:'done',
    github_record_id:'123',github_user_id:1,github_url:f.state.githubReceipt.html_url}];
  f.state.attempts=[{review_id:id,step:'github',scope_id:'review_bundle',generation:1,outcome:'succeeded',finished_at:'now'},
    {review_id:id,step:'linear',scope_id:'linear-state',generation:1,outcome:'succeeded',finished_at:'now'}];
  f.state.gates=[{run_id:'scenario-1',visit_sequence:1,state:'merge_authorized',decision_outcome:'merge_authorized',
    decision_delivery_id:'delivery',repository:'owner/test',pull_request_number:1,head_branch:'deos/canary/attempt-1',
    approved_head_sha:'c'.repeat(40)}];
  f.db.sqlite.exec(`INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification)
    VALUES ('delivery','hash','now','test_review_fixture');
    INSERT INTO test_review_fixture_events VALUES
    ('delivery','fixture','fixture-issue','app-actor','review-state','merge-state','now','hash','now','user');`);
  f.db.sqlite.prepare("INSERT INTO test_review_forwarded_events VALUES (?,'s01','delivery','now')").run(f.lease);
  return f;
}

for(const invalid of [null,'scope','unfinished','uncertain','missing-receipt','wrong-user','wrong-head','missing-delivery','wrong-actor','wrong-gate'] as const)
test(`published failure cleanup retains checked receipts without approval: ${invalid??'valid'}`,async()=>{
  const f=await publishedFixture();
  try {
    if(invalid==='scope')f.state.reviewRows[0].pull_request_number=2;
    if(invalid==='unfinished')f.state.attempts[0].finished_at=null;
    if(invalid==='uncertain')f.state.attempts[0].outcome='unclear';
    if(invalid==='missing-receipt')f.state.githubReceipt.id=124;
    if(invalid==='wrong-user')f.state.githubReceipt.user.id=2;
    if(invalid==='wrong-head')f.state.githubReceipt.commit_id='d'.repeat(40);
    if(invalid==='missing-delivery')f.db.sqlite.exec("DELETE FROM test_review_forwarded_events");
    if(invalid==='wrong-actor')f.db.sqlite.exec("UPDATE test_review_fixture_events SET actor_id='stranger'");
    if(invalid==='wrong-gate')f.state.gates[0].state='revision_requested';
    if(invalid) {
      await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/test_review_settlement_/);
      assert.equal(f.state.patches,0);
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_review_unpublished_settlements').get()!.n,0);
    } else {
      const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
      const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
      assert.equal(evidence.version,2);
      assert.equal(evidence.facts.reviews.receipts[0].receipt.id,123);
      assert.equal(evidence.settledFacts.reviews.deliveries[0].receipt.delivery_id,'delivery');
      assert.equal(f.state.patches,1);
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()!.n,0);
    }
    assert.equal(f.state.githubWrites,0);
  } finally {f.db.close();}
});

test('clearly rejected review remains failed in retained evidence, while unfinished parts block cleanup',async()=>{
  const f=await publishedFixture();
  try {
    f.state.decisions=0;f.state.gates=[];
    Object.assign(f.state.reviewRows[0],{outcome:'active',github_status:'failed_retryable',linear_status:'not_started',
      terminal_at:null,linear_operation_id:null});
    Object.assign(f.state.parts[0],{receipt_status:'failed_retryable',github_record_id:null,github_url:null,github_user_id:null});
    f.state.attempts=f.state.attempts.slice(0,1);f.state.attempts[0].outcome='clearly_rejected';
    const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
    const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
    assert.equal(evidence.settledFacts.reviews.intents[0].outcome,'active');
    assert.equal(evidence.settledFacts.reviews.attempts[0].outcome,'clearly_rejected');
    assert.equal(evidence.settledFacts.reviews.receipts.length,0);
    f.state.parts[0].receipt_status='pending';
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/part_unsettled/);
    assert.equal(f.state.githubWrites,0);
  } finally {f.db.close();}
});

for(const invalid of [null,'early-clear','already-forwarded','no-ops-item','gate-decided'] as const)
test(`held delivery cleanup requires the signed provider event and retained escalation: ${invalid??'valid'}`,async()=>{
  const f=await publishedFixture();
  try {
    const id=f.state.reviewRows[0].review_id;
    f.state.decisions=0;f.state.gates=[];
    Object.assign(f.state.reviewRows[0],{outcome:'host_check_required',linear_status:'host_check_required',
      created_at:'2026-09-29T19:00:01Z',terminal_at:'2026-09-29T19:00:10Z'});
    f.state.repairs=[{repair_id:'repair',review_id:id,kind:'delivery_scan',outcome:'host_check_required'}];
    f.state.ops=[{review_id:id,state:'open'}];
    f.db.sqlite.exec(`DELETE FROM test_review_forwarded_events;
      UPDATE test_review_fixture_events SET provider_time='2026-09-29T19:00:02Z',received_at='2026-09-29T19:00:03Z';`);
    f.db.sqlite.prepare(`INSERT INTO test_review_fault_injections
      (injection_id,lease_id,scenario_id,kind,state,armed_at) VALUES ('held',?,'s01','hold_linear_delivery','armed','2026-09-29T19:00:00Z')`)
      .run(f.lease);
    if(invalid==='early-clear')f.db.sqlite.exec("UPDATE test_review_fault_injections SET state='cleared',used_at='2026-09-29T19:00:02Z'");
    if(invalid==='already-forwarded')f.db.sqlite.prepare("INSERT INTO test_review_forwarded_events VALUES (?,'s01','delivery','2026-09-29T19:00:04Z')").run(f.lease);
    if(invalid==='no-ops-item')f.state.ops=[];
    if(invalid==='gate-decided')f.state.gates=[{run_id:'scenario-1',visit_sequence:1}];
    if(invalid) {
      await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/held_/);
      assert.equal(f.state.patches,0);
    } else {
      const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
      const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
      assert.equal(evidence.settledFacts.reviews.intents[0].outcome,'host_check_required');
      assert.equal(evidence.settledFacts.reviews.heldDeliveries[0].receipt.delivery_id,'delivery');
      assert.equal(evidence.settledFacts.reviews.heldDeliveries[0].item.state,'open');
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()!.n,0);
    }
  } finally {f.db.close();}
});

test('abandoned review cleanup retains the abandoned record and rejects any started task step',async()=>{
  const f=await publishedFixture();
  try {
    f.state.decisions=0;f.state.gates=[];
    Object.assign(f.state.reviewRows[0],{outcome:'abandoned_before_linear',github_status:'abandoned',
      linear_status:'not_started',linear_operation_id:null});
    f.state.parts[0].receipt_status='abandoned';
    f.state.attempts=f.state.attempts.slice(0,1);f.state.attempts[0].outcome='abandoned';
    const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
    const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
    assert.equal(evidence.settledFacts.reviews.intents[0].outcome,'abandoned_before_linear');
    f.state.reviewRows[0].linear_operation_id='started-task-write';
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/outcome_unsettled/);
  } finally {f.db.close();}
});


for(const invalid of [null,'attempt','linear','foreign-prior'] as const)
test(`unstarted replacement preserves its checked prior receipt and pending work: ${invalid??'valid'}`,async()=>{
  const f=await publishedFixture();
  try {
    const original=f.state.reviewRows[0],part=f.state.parts[0];
    f.state.decisions=0;f.state.gates=[];f.state.attempts=f.state.attempts.slice(0,1);
    Object.assign(original,{outcome:'abandoned_before_linear',github_status:'abandoned',linear_status:'not_started',linear_operation_id:null});
    const nextId='22222222-2222-4222-8222-222222222222';
    f.state.intents=2;
    f.state.reviewRows.push({...original,review_id:nextId,supersedes_review_id:original.review_id,
      outcome:'active',github_status:'not_started',terminal_at:null});
    f.state.parts.push({...part,review_id:nextId,receipt_status:'published_prior_intent'},
      {...part,review_id:nextId,part_id:'pending-note',kind:'reply',receipt_status:'pending',github_record_id:null,github_url:null,github_user_id:null});
    if(invalid==='attempt')f.state.attempts.push({...f.state.attempts[0],review_id:nextId});
    if(invalid==='linear')f.state.reviewRows[1].linear_operation_id='started';
    if(invalid==='foreign-prior')f.state.reviewRows[1].supersedes_review_id='33333333-3333-4333-8333-333333333333';
    if(invalid){
      await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/settlement_/);
      assert.equal(f.state.patches,0);
    }else{
      const saved=await settleUnpublishedReview(f.env,'run-1',f.lease,f.provider);
      const evidence=JSON.parse(await (await f.bucket.get(saved!.evidence_key))!.text());
      assert.equal(evidence.settledFacts.reviews.intents[1].outcome,'active');
      assert.equal(evidence.settledFacts.reviews.parts.at(-1).receipt_status,'pending');
      assert.equal(evidence.settledFacts.reviews.receipts.length,2);
      assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_attestations').get()!.n,0);
    }
    assert.equal(f.state.githubWrites,0);
  }finally{f.db.close();}
});
