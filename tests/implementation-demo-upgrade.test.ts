import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,readdirSync} from 'node:fs';
import {parse} from 'yaml';
import {loadWorkflowDefinition,restoreWorkflowDefinition} from '../src/workflow-definition.ts';
import {implementationDemoUpgradeDefinition,validateDemoUpgrade} from '../src/implementation-demo-upgrade-definition.ts';
import {ImplementationDemoUpgradeController} from '../src/implementation-demo-upgrade.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
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
async function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'failed');
  const orchestration=new D1OrchestrationStore(db as unknown as D1Database);
  await orchestration.registerDefinition({definition:source,projectId:'project',now:'2026-09-15T10:00:00Z'});
  db.sqlite.prepare(`UPDATE orchestration_runs SET definition_version=?,definition_digest=?,workflow_instance_id=?,
    current_node='implementation_failed',current_visit_sequence=2,status='failed',terminal_cause='implementation_failed' WHERE run_id='run-1'`)
    .run(source.version,source.digest,sourceId);
  db.sqlite.exec("UPDATE agent_attempts SET state='failed',cleanup_state='destroyed',ended_at='2026-09-15T10:00:00Z'");
  db.sqlite.prepare(`INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run-1','delivery',?,'established','now','now')`).run(sourceId);
  db.sqlite.exec(`INSERT INTO workflow_transitions_v2 (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
    VALUES ('failure','run-1','implementation_build','implementation_failed',1,2,'agent','agent:implementation_build:failed','now')`);
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-182/run-1',approvedDesignSha:base,testedBaseSha:base,
    policy:source.implementationPolicy!,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-182',1);
  const states=new Map([[sourceId,'errored']]);let creates=0,loseCreate=false;
  const workflows={async get(id:string){if(!states.has(id))throw new Error('instance absent');return {id,async status(){return {status:states.get(id)}}}},
    async createBatch(items:{id:string}[]){creates++;for(const item of items)states.set(item.id,'running');if(loseCreate)throw new Error('lost create reply');return Promise.all(items.map(item=>this.get(item.id)));}};
  const controller=new ImplementationDemoUpgradeController({DB:db,ARTIFACTS:bucket,ORCHESTRATION_WORKFLOW:workflows,STAGE_RETRY_SECRET:'secret'} as unknown as Env,tail);
  const input={version:1,runId:'run-1',failedAttemptId:'failed',sourceDefinitionDigest:source.digest,sourceWorkflowInstanceId:sourceId,
    visitSequence:2,targetVersion:tail.version+1,requestedBy:'operator'};
  const request=(extra={})=>new Request('https://worker/implementation-demo-upgrades',{method:'POST',headers:{Authorization:'Bearer secret'},body:JSON.stringify({...input,...extra})});
  const plan=async()=>await (await controller.handle(request())).json() as {planDigest:string};
  return {db,store,controller,input,request,plan,states,creates:()=>creates,loseCreate:()=>{loseCreate=true;}};
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
