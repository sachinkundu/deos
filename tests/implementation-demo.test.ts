import assert from 'node:assert/strict';
import test from 'node:test';
import { demoRequirements, validateDemoPlan, validateDemoResult, type DemoContext, type DemoPlan, type DemoResult } from '../src/implementation-demo-contract.ts';
import { ImplementationDemoService } from '../src/implementation-demo.ts';
import { ImplementationStore } from '../src/implementation-store.ts';
import { implementationPolicy } from '../src/implementation-contract.ts';
import { sha256Hex } from '../src/implementation-hash.ts';
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from './helpers/implementation-fixture.ts';
import type { AgentAttemptRecord } from '../src/sandbox-controller.ts';
import type { OrchestrationRunRecord } from '../src/orchestration-store.ts';
import type { ArtifactCollectionResult } from '../src/artifact-collector.ts';
import { implementationDemoView } from '../portal/src/implementation-demo-view.ts';
import { ImplementationService } from '../src/implementation-service.ts';
import type { LoadedWorkflowDefinition } from '../src/workflow-definition.ts';
const subject = {change: 'sample', approvedDesignSha: 'a'.repeat(40), testedBaseSha: 'b'.repeat(40), treeSha: 'c'.repeat(40)};
const sources = [{path:'approved/openspec/changes/sample/specs/service/spec.md', content:'### Requirement: Demonstrate a real update\n\n### Requirement: Recover a lost response',sha256:'d'.repeat(64)}];
function context(): DemoContext {
  return {version:1,kind:'plan',runId:'run-1',inputSha256:'f'.repeat(64),approvedInputSha:'e'.repeat(64),subject,
    candidateSha:'1'.repeat(64),requirements:demoRequirements(sources),sources,evidence:[],plan:null,priorPlan:null,feedback:null};
}
function plan(c: DemoContext): DemoPlan {
  return {version:1,inputSha256:c.inputSha256,outcome:'ready',summary:'Show the update and recovery in the changed app.',question:null,
    scenarios:[{id:'update', title:'Publish once and recover', requirementIds:c.requirements.map(r=>r.id), environment:'Isolated application and safe provider resource',
      steps:['Open the changed app','Publish the update','Lose the response and recover'],expected:'One durable update and visible success',evidenceKinds:['browser_image','provider_originated']}]};
}
function gateContext(): DemoContext {
  const c=context();
  c.kind='gate'; c.plan={sha256:'2'.repeat(64),value:plan(c)};
  c.evidence=[{...subject,id:'image',kind:'browser_image',caption:'Changed app',sha256:'3'.repeat(64),r2Key:'image',contentType:'image/png'},
    {...subject,id:'provider',kind:'provider_originated',caption:'Provider delivery consumed',sha256:'4'.repeat(64),r2Key:'provider',contentType:'application/json'}];
  return c;
}
function result(c: DemoContext): DemoResult {
  return {version:1,inputSha256:c.inputSha256,planSha256:c.plan!.sha256,outcome:'pass',summary:'The app consumed the update once and recovered.',question:null,
    scenarios:[{id:'update',outcome:'pass',reason:'Visible result matches the durable delivery.',evidenceIds:['image','provider']}]};
}
test('Claude chooses demo coverage and may revise its own plan',()=>{
  const c=context(),p=plan(c); validateDemoPlan(p,c);
  const missing=structuredClone(p); missing.scenarios[0].requirementIds.pop();
  validateDemoPlan(missing,c);
  c.priorPlan=p;
  const weak=structuredClone(p); weak.scenarios[0].steps.pop();
  validateDemoPlan(weak,c);
});
test('the workflow accepts reviewer judgments without auditing citations or re-deriving its outcome',()=>{
  const c=gateContext(),r=result(c);
  r.scenarios[0].evidenceIds=['unopened-or-mistyped-reference'];
  r.scenarios[0].outcome='needs_work';
  c.evidence[0].treeSha='9'.repeat(40);
  validateDemoResult(r,c);
  r.outcome='needs_work';validateDemoResult(r,c);
  r.outcome='blocked';r.scenarios[0].outcome='blocked';
  assert.throws(()=>validateDemoResult(r,c),/clear question/);
  r.question={blockKey:'preview',question:'Which safe preview is available?',reason:'No preview capability is configured.'};
  validateDemoResult(r,c);
  validateDemoResult({...r,inputSha256:'wrong-review'},c);
});
async function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'review');
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
    approvedDesignSha:subject.approvedDesignSha,testedBaseSha:subject.testedBaseSha,policy:implementationPolicy,approvedFiles:sources,issue:{},receipts:{},
    requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
  const service=new ImplementationDemoService(db as unknown as D1Database,bucket as unknown as R2Bucket);
  await store.beginTry(work,{attempt_id:'review',sandbox_id:'impl-review',visit_sequence:1},'build');
  const c=gateContext();c.approvedInputSha=work.input_sha;
  db.sqlite.prepare('UPDATE implementation_runs SET tree_sha=?,candidate_sha=? WHERE run_id=?').run(c.subject.treeSha,c.candidateSha,work.run_id);
  for(const evidence of c.evidence) {
    const bytes=evidence.id==='image'?new Uint8Array([137,80,78,71,13,10,26,10]):new TextEncoder().encode('{"consumed":true}');
    const saved=await store.put(work.run_id,evidence.id,bytes,evidence.contentType);evidence.r2Key=saved.key;evidence.sha256=saved.sha256;
    db.sqlite.prepare(`INSERT INTO implementation_proof (proof_id,run_id,attempt_id,kind,approved_design_sha,tested_base_sha,tree_sha,r2_key,sha256,byte_size,media_type,caption,sanitized,created_at)
      VALUES (?,'run-1','review',?,?,?,?,?,?,?,?,?,1,'2026-09-15')`).run(evidence.id,evidence.kind,subject.approvedDesignSha,subject.testedBaseSha,subject.treeSha,saved.key,saved.sha256,bytes.length,evidence.contentType,evidence.caption);
  }
  const {inputSha256:_,...content}=c;c.inputSha256=await sha256Hex(JSON.stringify(content));
  const attempt={attempt_id:'review',run_id:work.run_id,visit_sequence:1,job_spec_json:JSON.stringify({reviewKind:'demo_gate',materializedContext:JSON.stringify({demo:c})})} as AgentAttemptRecord;
  return {db,bucket,store,service,c,attempt,work:await store.requireRun(work.run_id)};
}
test('evidence reader returns actual image bytes, records access and rejects cross-context IDs or corrupt objects',async()=>{
  const f=await fixture();
  try {
    const response=await f.service.evidence(f.attempt,'image');
    assert.deepEqual(response.content[1],{type:'image',mimeType:'image/png',data:'iVBORw0KGgo='});
    assert.equal(f.db.sqlite.prepare('SELECT count(*) AS n FROM implementation_demo_access').get()!.n,1);
    await assert.rejects(f.service.evidence(f.attempt,'another-attempt-image'),/outside this review/);
    f.bucket.objects.set(f.c.evidence[0].r2Key,new Uint8Array([0]));
    await assert.rejects(f.service.evidence(f.attempt,'image'),/digest|hash|integrity/i);
  } finally {f.db.close();}
});
async function acceptGate(f:Awaited<ReturnType<typeof fixture>>,outcome:'pass'|'needs_work') {
  const p=plan(f.c),ps=await f.store.put('run-1','plan.json',JSON.stringify(p));
  seedAttempt(f.db,'plan');
  f.db.sqlite.prepare(`INSERT INTO implementation_demo_reviews VALUES
    ('plan','run-1',1,'plan',?,NULL,NULL,?,?,'ready','summary',?,?,'2026-09-15')`)
    .run(f.c.inputSha256,subject.testedBaseSha,subject.treeSha,ps.key,ps.sha256);
  f.c.plan={sha256:ps.sha256,value:p};
  const {inputSha256:_,...content}=f.c;f.c.inputSha256=await sha256Hex(JSON.stringify(content));
  const r=result(f.c);r.outcome=outcome;r.scenarios[0].outcome=outcome;
  if(outcome==='needs_work')r.scenarios[0].reason='Show the required mobile layout.';
  const bytes=JSON.stringify(r),saved=await f.store.put('run-1','raw-review-output.json',bytes);
  f.db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest','run-1','review','manifest-key','complete','2026-09-15')`);
  f.db.sqlite.prepare(`INSERT INTO artifacts (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,policy_outcome)
    VALUES ('manifest','raw-review-output.json',?,'application/json',?,?,'2026-09-15','accepted')`)
    .run(saved.key,Buffer.byteLength(bytes),saved.sha256);
  const attempt={...f.attempt,visit_sequence:2,job_spec_json:JSON.stringify({reviewKind:'demo_gate',materializedContext:JSON.stringify({demo:f.c})})};
  const collection:ArtifactCollectionResult={manifestId:'manifest',aggregateDigest:saved.sha256,objectCount:1,totalBytes:Buffer.byteLength(bytes),
    manifestKey:'manifest-key',manifestSha256:saved.sha256,providerReceipts:[],result:{reviewOutcome:r.outcome,summary:r.summary}};
  assert.equal(await f.service.accept({run:{run_id:'run-1'} as OrchestrationRunRecord,attempt,collection}),outcome);
  assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM implementation_demo_access').get()!.n,0);
  return r;
}
test('pass and needs-work verdicts are accepted without evidence-open receipts',async()=>{
  for(const outcome of ['pass','needs_work'] as const) {
    const f=await fixture();try {
      await acceptGate(f,outcome);
      assert.equal((await f.service.latest('run-1','gate'))!.outcome,outcome);
      assert.equal((await f.service.handoff(f.work))?.repaired,outcome==='pass'?false:undefined);
    }finally{f.db.close();}
  }
});
test('one completed repair goes directly to human review with original findings; a human revision starts a new round',async()=>{
  const f=await fixture();try {
    const verdict=await acceptGate(f,'needs_work');
    seedAttempt(f.db,'repair');
    const demo=await f.service.buildInput('run-1');
    f.db.sqlite.prepare("UPDATE agent_attempts SET visit_sequence=3,state='completed',job_spec_json=? WHERE attempt_id='repair'")
      .run(JSON.stringify({materializedContext:JSON.stringify({demo})}));
    f.db.sqlite.prepare("UPDATE implementation_runs SET source_attempt_id='repair',candidate_sha=?,tree_sha=? WHERE run_id='run-1'")
      .run('5'.repeat(64),'6'.repeat(40));
    const work=await f.store.requireRun('run-1');
    assert.deepEqual(await f.service.requireHandoff(work),{review:verdict,reviewedCandidateSha:f.c.candidateSha,repaired:true});
    const definition={jobs:{implementation_demo_plan:{},implementation_demo_gate:{}},nodes:{implementation_proof_check:{edges:{review_ready:'implementation_branch_write'}}}} as unknown as LoadedWorkflowDefinition;
    const service=new ImplementationService({DB:f.db,ARTIFACTS:f.bucket,PORTAL_BASE_URL:'https://portal.test'} as unknown as Env,definition);
    const candidate={checks:[],proof:[],assumptions:[],sources:[]} as never;
    service.store.candidate=async()=>candidate;
    const outcome=await service.execute({run_id:'run-1',current_node:'implementation_proof_check'} as OrchestrationRunRecord,'implementation.check_proof');
    assert.equal(outcome.outcome,'review_ready');
    const body=await service.prBody(work,{images:[],showboatUrl:'https://github.com/owner/repo/blob/proof/showboat.md',commit:'proof'});
    assert.doesNotMatch(body,/independent demo review|Show the required mobile layout|Checks|Implementation response/);
    assert.match(body,/Showboat file/);
    f.db.sqlite.prepare('UPDATE workflow_definitions SET canonical_json=?').run(JSON.stringify(definition));
    assert.equal((await implementationDemoView(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket,work)).gate?.repairComplete,true);
    f.db.sqlite.prepare("UPDATE agent_attempts SET job_spec_json='{}' WHERE attempt_id='repair'").run();
    assert.ok(await f.service.handoff(work),'Completed Sol response routes without auditing its feedback envelope');
    f.db.sqlite.prepare("UPDATE agent_attempts SET job_spec_json=? WHERE attempt_id='repair'").run(JSON.stringify({materializedContext:JSON.stringify({demo})}));
    f.db.sqlite.exec(`INSERT INTO implementation_gates(run_id,visit_sequence,node_id,expected_event_kind,allowed_linear_user_id,issue_id,human_state_id,opened_at,decision_outcome)
      VALUES ('run-1',4,'implementation_review','state','human','issue-1','review','now','revision_requested')`);
    assert.equal(await f.service.handoff(work),null);
    assert.equal((await service.execute({run_id:'run-1',current_node:'implementation_proof_check'} as OrchestrationRunRecord,'implementation.check_proof')).outcome,'completed');
  }finally{f.db.close();}
});
test('accepting a refreshed demo plan keeps the checked clarification available to the next author',async()=>{
  const f=await fixture();
  try {
    const question=await f.store.put('run-1','question.json',JSON.stringify({blockKey:'browser',question:'May I resume with a fresh browser?'}));
    const reply=await f.store.put('run-1','reply.json',JSON.stringify({body:'Resume from saved work and preserve the final preview requirement.'}));
    f.db.sqlite.prepare(`INSERT INTO implementation_questions
      (question_id,run_id,block_key,gate_visit,opened_delivery_id,opened_at,question_key,question_sha,status,reply_key,reply_sha)
      VALUES ('question','run-1','browser',1,'opened','2026-09-15',?,?,'answered',?,?)`)
      .run(question.key,question.sha256,reply.key,reply.sha256);
    const c={...f.c,kind:'plan' as const,plan:null,candidateSha:null,evidence:[]};
    const {inputSha256:_,...content}=c;
    c.inputSha256=await sha256Hex(JSON.stringify(content));
    const p=plan(c),bytes=JSON.stringify(p);
    const saved=await f.store.put('run-1','raw-review-output.json',bytes);
    f.db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
      VALUES ('manifest','run-1','review','manifest-key','complete','2026-09-15')`);
    f.db.sqlite.prepare(`INSERT INTO artifacts (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,policy_outcome)
      VALUES ('manifest','raw-review-output.json',?,'application/json',?,?,'2026-09-15','accepted')`)
      .run(saved.key,Buffer.byteLength(bytes),saved.sha256);
    const attempt={...f.attempt,job_spec_json:JSON.stringify({reviewKind:'demo_plan',materializedContext:JSON.stringify({demo:c})})};
    const run={run_id:'run-1'} as OrchestrationRunRecord;
    const collection: ArtifactCollectionResult={manifestId:'manifest',aggregateDigest:saved.sha256,
      objectCount:1,totalBytes:Buffer.byteLength(bytes),manifestKey:'manifest-key',manifestSha256:saved.sha256,
      providerReceipts:[],result:{reviewOutcome:p.outcome,summary:p.summary}};
    assert.equal(await f.service.accept({run,attempt,collection}),'ready');
    const pending=await f.store.question('run-1');
    assert.equal(pending?.status,'answered');
    assert.deepEqual(await f.store.read(pending!.reply_key!,pending!.reply_sha!),{
      body:'Resume from saved work and preserve the final preview requirement.',
    });
  } finally { f.db.close(); }
});


test('demo planning receives real runtime limits and only a matching immutable correction audit',async()=>{
  const f=await fixture();try {
    const p=plan(f.c),saved=await f.store.put('run-1','prior-plan.json',JSON.stringify(p));
    seedAttempt(f.db,'plan');
    f.db.sqlite.prepare(`INSERT INTO implementation_demo_reviews VALUES
      ('plan','run-1',1,'plan',?,NULL,NULL,?,?,'ready','summary',?,?,'2026-09-15')`)
      .run(f.c.inputSha256,subject.testedBaseSha,subject.treeSha,saved.key,saved.sha256);
    const run=f.db.sqlite.prepare("SELECT * FROM orchestration_runs WHERE run_id='run-1'").get() as unknown as OrchestrationRunRecord;
    const correction={planSha256:saved.sha256,scenarioIds:['update'],reason:'Correct the browser demand against the approved product scope.'};
    const job={reviewKind:'demo_plan'} as Parameters<ImplementationDemoService['materialize']>[1];
    const base={context:JSON.stringify({issue:{comments:[{body:JSON.stringify({correction})}]},correction})} as Parameters<ImplementationDemoService['materialize']>[2];
    const read=async()=>JSON.parse((await f.service.materialize(run,job,base)).context).demo as DemoContext;
    const initial=await read();assert.equal(initial.correction,null);
    const runtime=JSON.parse(initial.sources.find(item=>item.path==='context/runtime-capabilities.json')!.content);
    assert.equal(runtime.browser.resetWithinAttempt,true);
    assert.equal(runtime.browser.reallocateWithinAttempt,false);
    assert.match(runtime.browser.demoCollection,/fresh context/);
    assert.deepEqual(runtime.safeAdapters,[]);
    const audit={input:{runId:'run-1',requestedBy:'operator',correction},targetDigest:run.definition_digest,approvedInputSha:f.work.input_sha};
    const encoded=JSON.stringify(audit),digest=await sha256Hex(encoded);
    f.db.sqlite.prepare('INSERT INTO implementation_demo_upgrades VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run('review','run-1',digest,encoded,'old',run.definition_digest,f.work.input_sha,subject.testedBaseSha,null,'2026-09-15');
    const granted=await read();assert.deepEqual(granted.correction,{...correction,upgradeDigest:digest,requestedBy:'operator'});
    assert.equal(granted.priorPlanSha256,saved.sha256);
    assert.notEqual(granted.inputSha256,initial.inputSha256);
    assert.throws(()=>f.db.sqlite.exec("UPDATE implementation_demo_upgrades SET plan_json='{}'"),/immutable/);
  }finally{f.db.close();}
});
