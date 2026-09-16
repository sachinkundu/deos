import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {parse} from 'yaml';
import {loadWorkflowDefinition,restoreWorkflowDefinition} from '../src/workflow-definition.ts';
import {implementationDemoUpgradeDefinition,validateDemoUpgrade} from '../src/implementation-demo-upgrade-definition.ts';
import {ImplementationDemoUpgradeController} from '../src/implementation-demo-upgrade.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {ClaudeReviewStore} from '../src/claude-review-store.ts';
import {sha256Hex} from '../src/implementation-hash.ts';
import type {ArtifactCollectionResult} from '../src/artifact-collector.ts';
import {D1OrchestrationStore} from '../src/orchestration-store.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
const bundle={prompts:Object.fromEntries(readdirSync('config/prompts').map(name=>[`prompts/${name}`,readFileSync(`config/prompts/${name}`,'utf8')])),
  schemas:Object.fromEntries(readdirSync('config/schemas').map(name=>[`schemas/${name}`,readFileSync(`config/schemas/${name}`,'utf8')]))};
const document=parse(readFileSync('config/workflow.implementation.yaml','utf8'));
const tail=await loadWorkflowDefinition(JSON.stringify(document),bundle);
const old=structuredClone(document);old.metadata.version=27;
for(const id of ['implementation_demo_plan','implementation_demo_gate'])delete old.spec.jobs[id];
for(const id of ['implementation_demo_plan','implementation_demo_gate','implementation_rebase_demo'])delete old.spec.nodes[id];
old.spec.nodes.implementation_tasks.edges.completed='implementation_build';
old.spec.nodes.implementation_proof_check.edges.completed='implementation_branch_write';
old.spec.nodes.implementation_clarification_wait.edges.reply_received='implementation_build';
const source=await loadWorkflowDefinition(JSON.stringify(old),{...bundle,prompts:{...bundle.prompts,
  'prompts/openspec-design-author.md':'Frozen approved design instructions',
  'prompts/implementation-build.md':'Previous implementation instructions'}});
const sourceId='wf-v1-'+ 'a'.repeat(52),base='b'.repeat(40);
async function fixture(from=source) {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'failed');
  const orchestration=new D1OrchestrationStore(db as unknown as D1Database);
  await orchestration.registerDefinition({definition:from,projectId:'project',now:'2026-09-15T10:00:00Z'});
  db.sqlite.prepare(`UPDATE orchestration_runs SET definition_version=?,definition_digest=?,workflow_instance_id=?,
    current_node='implementation_failed',current_visit_sequence=2,status='failed',terminal_cause='implementation_failed' WHERE run_id='run-1'`)
    .run(from.version,from.digest,sourceId);
  db.sqlite.exec("UPDATE agent_attempts SET state='failed',cleanup_state='destroyed',ended_at='2026-09-15T10:00:00Z'");
  db.sqlite.prepare(`INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run-1','delivery',?,'established','now','now')`).run(sourceId);
  db.sqlite.exec(`INSERT INTO workflow_transitions_v2 (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
    VALUES ('failure','run-1','implementation_build','implementation_failed',1,2,'agent','agent:implementation_build:failed','now')`);
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-182/run-1',approvedDesignSha:base,testedBaseSha:base,
    policy:from.implementationPolicy!,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-182',1);
  const states=new Map([[sourceId,'errored']]);let creates=0,loseCreate=false;
  const workflows={async get(id:string){if(!states.has(id))throw new Error('instance absent');return {id,async status(){return {status:states.get(id)}}}},
    async createBatch(items:{id:string}[]){creates++;for(const item of items)states.set(item.id,'running');if(loseCreate)throw new Error('lost create reply');return Promise.all(items.map(item=>this.get(item.id)));}};
  const controller=new ImplementationDemoUpgradeController({DB:db,ARTIFACTS:bucket,ORCHESTRATION_WORKFLOW:workflows,STAGE_RETRY_SECRET:'secret'} as unknown as Env,tail);
  const input={version:1,runId:'run-1',failedAttemptId:'failed',sourceDefinitionDigest:from.digest,sourceWorkflowInstanceId:sourceId,
    visitSequence:2,targetVersion:tail.version+1,requestedBy:'operator'};
  const request=(extra={})=>new Request('https://worker/implementation-demo-upgrades',{method:'POST',headers:{Authorization:'Bearer secret'},body:JSON.stringify({...input,...extra})});
  const plan=async()=>await (await controller.handle(request())).json() as {planDigest:string};
  return {db,bucket,store,controller,input,request,plan,states,creates:()=>creates,loseCreate:()=>{loseCreate=true;}};
}
test('demo upgrade preserves approved history, policy, model choices and human gate while inserting mandatory demo roles',async()=>{
  const target=await implementationDemoUpgradeDefinition(source,tail,tail.version+1);
  assert.equal(target.jobs.design_author.prompt,'Frozen approved design instructions');
  assert.equal(target.jobs.implementation_build.model,source.jobs.implementation_build.model);
  assert.notEqual(target.jobs.implementation_build.prompt,source.jobs.implementation_build.prompt);
  assert.deepEqual(await restoreWorkflowDefinition(JSON.stringify(target),target.digest),target);
  const changed={...structuredClone(target),nodes:{...target.nodes}};changed.nodes.implementation_review={...changed.nodes.implementation_review,edges:{...changed.nodes.implementation_review.edges,merge_authorized:'code_merged'}};
  assert.throws(()=>validateDemoUpgrade(source,changed),/changed_gate/);
  changed.jobs.design_author.prompt='rewrite';
  assert.throws(()=>validateDemoUpgrade(source,changed),/changed_job/);
});
test('preflight is read-only and execution records one restart at Demo Plan without losing work or frozen history',async()=>{
  const f=await fixture();try {
    const before=await f.store.requireRun('run-1'),p=await f.plan();
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM implementation_demo_upgrades').get()!.n,0);
    assert.equal(f.creates(),0);
    f.loseCreate();
    const response=await f.controller.handle(f.request({execute:true,planDigest:p.planDigest}));
    assert.equal(response.status,202,await response.clone().text());
    const run=f.db.sqlite.prepare("SELECT * FROM orchestration_runs WHERE run_id='run-1'").get()!;
    assert.equal(run.current_node,'implementation_demo_plan');assert.equal(run.current_visit_sequence,3);
    assert.equal(run.allowed_linear_user_id,'human');assert.equal(run.human_binding_revision,1);
    assert.deepEqual(await f.store.requireRun('run-1'),before);
    const transition=f.db.sqlite.prepare("SELECT * FROM workflow_transitions_v2 WHERE transition_id<>'failure'").get()!;
    assert.equal(transition.to_node,'implementation_demo_plan');assert.equal(transition.actor_type,'operator');
    const retry=f.db.sqlite.prepare('SELECT * FROM agent_stage_retries').get()!;
    assert.equal(retry.retry_node,'implementation_build');assert.equal(retry.entry_node,'implementation_demo_plan');
    assert.equal(retry.source_definition_digest,source.digest);
    assert.equal((await f.controller.handle(f.request({execute:true,planDigest:p.planDigest}))).status,200);
    assert.equal(f.creates(),1);
  } finally {f.db.close();}
});
test('upgrade rejects changed inputs, active work, unfinished cleanup and wrong source before dispatch',async()=>{
  for(const mutation of ["UPDATE implementation_runs SET patch_sha='changed'", "UPDATE agent_attempts SET state='running'", "UPDATE agent_attempts SET cleanup_state='pending'",
    "UPDATE orchestration_runs SET current_visit_sequence=3"]) {
    const f=await fixture();try {
      const p=await f.plan();f.db.sqlite.exec(mutation);
      await assert.rejects(f.controller.handle(f.request({execute:true,planDigest:p.planDigest})),/upgrade/);
      assert.equal(f.creates(),0);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM agent_stage_retries').get()!.n,0);
    } finally {f.db.close();}
  }
});


test('an existing demo workflow needs a current plan correction before an audited restart',async()=>{
  const f=await fixture(tail);try {
    await assert.rejects(f.plan(),/correction_required/);
    seedAttempt(f.db,'saved-plan');
    const value={version:1,scenarios:[{id:'browser-proof'}]};
    const saved=await f.store.put('run-1','plan.json',JSON.stringify(value));
    f.db.sqlite.prepare(`INSERT INTO implementation_demo_reviews VALUES
      ('saved-plan','run-1',1,'plan','input',NULL,NULL,?,?,'ready','summary',?,?,'2026-09-15')`)
      .run(base,base,saved.key,saved.sha256);
    f.db.sqlite.exec("UPDATE agent_attempts SET node_id='implementation_demo_plan',state='completed',cleanup_state='destroyed' WHERE attempt_id='saved-plan'");
    const correction={planSha256:saved.sha256,scenarioIds:['browser-proof'],reason:'Remove the invented platform reset while retaining final-tree application proof.'};
    await assert.rejects(f.controller.handle(f.request({correction:{...correction,planSha256:'a'.repeat(64)}})),/plan_changed/);
    await assert.rejects(f.controller.handle(f.request({correction:{...correction,scenarioIds:['unknown']}})),/scenario_missing/);
    const preflight=await (await f.controller.handle(f.request({correction}))).json() as {planDigest:string};
    const response=await f.controller.handle(f.request({correction,execute:true,planDigest:preflight.planDigest}));
    assert.equal(response.status,202,await response.clone().text());
    const audit=f.db.sqlite.prepare('SELECT plan_json FROM implementation_demo_upgrades').get()!;
    assert.deepEqual(JSON.parse(String(audit.plan_json)).input.correction,correction);
    assert.equal(f.db.sqlite.prepare("SELECT current_node FROM orchestration_runs WHERE run_id='run-1'").get()!.current_node,'implementation_demo_plan');
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM implementation_demo_reviews').get()!.n,1);
    assert.equal(f.creates(),1);
  }finally{f.db.close();}
});


async function seedSavedDemo(f:Awaited<ReturnType<typeof fixture>>) {
  const work=await f.store.requireRun('run-1');
  const tree='c'.repeat(40),candidate='d'.repeat(64);
  f.db.sqlite.prepare("UPDATE implementation_runs SET candidate_sha=?,tree_sha=? WHERE run_id='run-1'").run(candidate,tree);
  seedAttempt(f.db,'plan');
  f.db.sqlite.exec("UPDATE agent_attempts SET state='completed',cleanup_state='destroyed' WHERE attempt_id='plan'");
  const plan={version:1,inputSha256:'e'.repeat(64),outcome:'ready',summary:'Show the calculator',question:null,scenarios:[]};
  const saved=await f.store.put('run-1','plan.json',JSON.stringify(plan));
  f.db.sqlite.prepare(`INSERT INTO implementation_demo_reviews VALUES
    ('plan','run-1',1,'plan','input',NULL,NULL,?,?,'ready','summary',?,?,'2026-09-15')`).run(base,tree,saved.key,saved.sha256);
  const content={version:1,kind:'gate',runId:'run-1',approvedInputSha:work.input_sha,
    subject:{change:'sample',approvedDesignSha:base,testedBaseSha:base,treeSha:tree},candidateSha:candidate,
    requirements:[],sources:[],evidence:[],plan:{sha256:saved.sha256,value:plan},priorPlan:null,feedback:null};
  const context={...content,inputSha256:await sha256Hex(JSON.stringify(content))};
  const result={version:1,inputSha256:context.inputSha256,planSha256:saved.sha256,outcome:'needs_work',summary:'Show the true mobile width.',question:null,
    scenarios:[{id:'mobile',outcome:'needs_work',reason:'Capture the 320px layout',evidenceIds:['unopened-image']}]};
  const job=JSON.stringify({reviewKind:'demo_gate',materializedContext:JSON.stringify({demo:context})});
  const jobDigest=await sha256Hex(job);
  f.db.sqlite.prepare("UPDATE agent_attempts SET job_spec_json=?,job_spec_digest=? WHERE attempt_id='failed'").run(job,jobDigest);
  const bytes=JSON.stringify(result),raw=await f.store.put('run-1','raw-review-output.json',bytes);
  f.db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest','run-1','failed','manifest-key','complete','now')`);
  f.db.sqlite.prepare(`INSERT INTO artifacts (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,policy_outcome)
    VALUES ('manifest','raw-review-output.json',?,'application/json',?,?,'now','accepted')`).run(raw.key,Buffer.byteLength(bytes),raw.sha256);
  const collection:ArtifactCollectionResult={manifestId:'manifest',aggregateDigest:raw.sha256,objectCount:1,totalBytes:Buffer.byteLength(bytes),
    manifestKey:'manifest-key',manifestSha256:raw.sha256,providerReceipts:[],result:{outcome:'completed',reviewOutcome:result.outcome,summary:result.summary}};
  const reviews=new ClaudeReviewStore(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket);
  const enrollment={version:1,secretVersion:'one',accountBinding:'a'.repeat(64),tokenHmac:'b'.repeat(64),subscription:'pro',paidUsageEnabled:false} as const;
  await reviews.claim({attemptId:'failed',runnerId:'runner',jobDigest,enrollment});await reviews.started('failed','process');
  const turn=await reviews.claimTurn('failed',0,'f'.repeat(64),null);
  await reviews.saveReceipt(turn,{attemptId:'failed',turn:0,inputSha256:'f'.repeat(64),accountBinding:enrollment.accountBinding,secretVersion:'one',sessionId:'session',result} as never);
  await reviews.cleanup('failed','destroyed');await reviews.finish('failed');await reviews.saveCollection('failed',jobDigest,collection);
}

test('an audited failed demo review upgrade preserves the plan and resumes once under the single-repair handoff',async()=>{
  const previous=structuredClone(document);previous.metadata.version=31;
  delete previous.spec.nodes.implementation_proof_check.edges.review_ready;
  const frozen=await loadWorkflowDefinition(JSON.stringify(previous),bundle);
  const f=await fixture(frozen);try {
    f.db.sqlite.exec("UPDATE agent_attempts SET node_id='implementation_demo_gate' WHERE attempt_id='failed'");
    f.db.sqlite.exec("UPDATE workflow_transitions_v2 SET from_node='implementation_demo_gate',cause_reference='agent:implementation_demo_gate:failed'");
    await seedSavedDemo(f);
    const before=await f.store.requireRun('run-1');
    const extra={handoffPolicy:'single_repair'};
    const planned=await (await f.controller.handle(f.request(extra))).json() as {planDigest:string};
    assert.equal(f.creates(),0);
    const response=await f.controller.handle(f.request({...extra,execute:true,planDigest:planned.planDigest}));
    assert.equal(response.status,202,await response.clone().text());
    const run=f.db.sqlite.prepare("SELECT * FROM orchestration_runs WHERE run_id='run-1'").get()!;
    assert.equal(run.current_node,'implementation_build');
    assert.equal(run.definition_version,tail.version+1);
    assert.deepEqual(await f.store.requireRun('run-1'),before);
    const retry=f.db.sqlite.prepare('SELECT * FROM agent_stage_retries').get()!;
    assert.equal(retry.entry_node,'implementation_build');assert.equal(retry.retry_node,'implementation_demo_gate');
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM implementation_demo_reviews').get()!.n,2);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM claude_review_turns').get()!.n,1,'Recovery does not call Claude again');
    assert.equal(f.db.sqlite.prepare("SELECT state FROM agent_attempts WHERE attempt_id='failed'").get()!.state,'failed','Original failure stays visible');
    assert.equal((await f.controller.handle(f.request({...extra,execute:true,planDigest:planned.planDigest}))).status,200);
    assert.equal(f.creates(),1);
  }finally{f.db.close();}
});
