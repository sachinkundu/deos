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
    IMPLEMENTATION_ENVIRONMENT_TOKEN:'private-test-token'} as unknown as Env;
  const state={intents:0,decisions:0,operations:0,foreign:'',changeOwner:false,lateIntent:false,
    status:'waiting',patches:0,reads:0,factReads:0,requests:0};
  const provider=async(input:RequestInfo|URL,init?:RequestInit)=>{
    state.requests++;
    const path=new URL(String(input)).pathname;
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
      } else result=[{success:true,results:[{run_id:state.foreign==='run'?'foreign':'scenario-1',workflow_instance_id:'wf-v1-owned'}]}];
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

for(const field of ['intents','decisions','operations'] as const) test(`recovery refuses existing ${field} before any workflow mutation`,async()=>{
  const f=fixture();f.state[field]=1;
  try {
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present/);
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
    await assert.rejects(settleUnpublishedReview(f.env,'run-1',f.lease,f.provider),/review_effects_present/);
    assert.equal(f.state.patches,1);assert.equal(f.bucket.objects.size,0);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM test_review_unpublished_settlements').get()!.n,0);
  } finally {f.db.close();}
});
