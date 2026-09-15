import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { IndependentReviewReconciliationController } from '../src/independent-review-reconciliation.ts';
import { loadWorkflowDefinition } from '../src/workflow-definition.ts';
import { D1OrchestrationStore } from '../src/orchestration-store.ts';
import { D1DesignReviewStore } from '../src/design-review-store.ts';
import { D1DesignStore } from '../src/design-store.ts';
import { D1BoundedReviewStore } from '../src/bounded-review-store.ts';
import { ClaudeReviewStore } from '../src/claude-review-store.ts';
import { CLAUDE_MODEL, CLAUDE_VERSION, CLAUDE_EFFORT, validateClaudeTurn } from '../src/claude-review.ts';
import { validateDesignReviewInput } from '../src/design-review.ts';
import { createReviewCycle } from '../container/bounded-review.mjs';
import { sha256Hex } from '../src/implementation-hash.ts';
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from './helpers/implementation-fixture.ts';
import type { ImplementationPull } from '../src/implementation-github.ts';

const bundle = {
  prompts: Object.fromEntries(readdirSync('config/prompts').map(n => [`prompts/${n}`,readFileSync(`config/prompts/${n}`,'utf8')])),
  schemas: Object.fromEntries(readdirSync('config/schemas').map(n => [`schemas/${n}`,readFileSync(`config/schemas/${n}`,'utf8')])),
};
const definition = await loadWorkflowDefinition(readFileSync('config/workflow.simple-traceability-claude.bounded.yaml','utf8'),bundle);
const head = 'a'.repeat(40), base = 'b'.repeat(40), stamp = '2026-09-15T17:00:00Z', sourceInstance = `wf-v1-${'a'.repeat(52)}`;

async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket();
  const storage = { put: bucket.put.bind(bucket), get: async (key: string) => {
    const object = await bucket.get(key); return object && { ...object, size: bucket.objects.get(key)!.length };
  } } as unknown as R2Bucket;
  const d1 = db as unknown as D1Database, orchestration = new D1OrchestrationStore(d1);
  await orchestration.registerDefinition({ definition, projectId: 'project', now: stamp });
  seedRun(db); seedAttempt(db,'source'); seedAttempt(db,'failed');
  const enrollment = { version: 1 as const, secretVersion: 'secret-version', accountBinding: 'c'.repeat(64),
    tokenHmac: 'd'.repeat(64), subscription: 'pro' as const, paidUsageEnabled: false as const };
  db.sqlite.prepare(`UPDATE orchestration_runs SET definition_id=?,definition_version=?,definition_digest=?,
    workflow_instance_id=?,current_node='review_reconciliation',current_visit_sequence=20,status='manual_reconciliation_required',
    route_repository='owner/repo',independent_review_account_binding=?,author_model_provider='codex',author_model='author',author_reasoning='high'
    WHERE run_id='run-1'`).run(definition.name,definition.version,definition.digest,sourceInstance,enrollment.accountBinding);
  const sources = await Promise.all(['design.md','proposal.md'].map(async name => {
    const content = 'A calculator.\nExact arithmetic.\n';
    return { path: `openspec/changes/test/${name}`, content, sha256: await sha256Hex(content) };
  }));
  const candidateSha = 'e'.repeat(64), candidateId = 'design:candidate';
  const input = await validateDesignReviewInput({ version: 1, runId:'run-1',round:1,phase:'independent',
    candidateId,candidateSha256:candidateSha,approvedPlanManifestSha256:'f'.repeat(64),baseCommit:base,
    guidanceManifestSha256:'1'.repeat(64),sources:sources.map(({path,sha256})=>({path,sha256})),
    modelProvider:'claude',model:CLAUDE_MODEL,reasoning:CLAUDE_EFFORT,pullRequestDatabaseId:'32',headSha:head });
  const saved = { input: input.input, inputSha256: input.inputSha256,inputR2Key:'design-input',phase:'independent',sources };
  await storage.put('design-input',input.encoded);
  const grounding = { schema:'deos-grounding-v1',webSearch:'native-live',skills:[] };
  const manifest = { ...grounding,attemptId:'source',jobKind:'design_independent_review',runtime:'claude',
    contextFiles:[],capabilityDigest:await sha256Hex(JSON.stringify(grounding)),verification:{webSearch:'live',tools:['WebSearch','Skill'],skills:[]} };
  const jobs: Record<string, { text: string; sha: string }> = {};
  for (const [id,visit] of [['source',17],['failed',19]] as const) {
    const job = { attemptId:id,runId:'run-1',nodeId:'design_independent_review',visitSequence:visit,
      modelProvider:'claude',agentRole:'reviewer',reviewKind:'design',boundedReview:'deos-bounded-review-v1',
      model:CLAUDE_MODEL,reasoning:CLAUDE_EFFORT,grounding,
      materializedContext:JSON.stringify({ designReview:saved,agentInputs:{checkedContextFiles:[]},retryNote:id }) };
    const text = JSON.stringify(job), sha = await sha256Hex(text); jobs[id] = { text,sha };
    db.sqlite.prepare(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
      VALUES (?,'run-1',?,?,'complete',?)`).run(`manifest-${id}`,id,`manifest-${id}`,stamp);
    db.sqlite.prepare(`UPDATE agent_attempts SET node_id='design_independent_review',visit_sequence=?,job_spec_json=?,job_spec_digest=?,
      state='failed',cleanup_state='destroyed',manifest_id=?,result_class='codex_exit_nonzero',ended_at=? WHERE attempt_id=?`)
      .run(visit,text,sha,`manifest-${id}`,stamp,id);
    db.sqlite.prepare(`INSERT INTO bounded_review_recoveries (attempt_id,eligible,recovery_json,sha256) VALUES (?,0,?,?)`)
      .run(id,'{"eligible":false}',await sha256Hex('{"eligible":false}'));
  }
  await new D1DesignStore(d1).allocate({runId:'run-1',repository:'owner/repo',baseCommit:base,changeId:'test',now:stamp});
  db.sqlite.prepare(`INSERT INTO provider_operations (operation_id,run_id,capability,action,sanitized_target,request_digest,state,started_at,updated_at)
    VALUES ('publication','run-1','github','publish','owner/repo',?,'succeeded',?,?)`).run(candidateSha,stamp,stamp);
  db.sqlite.prepare(`UPDATE design_work_products SET pull_request_database_id='32',pull_request_number=32,
    pull_request_url='https://github.com/owner/repo/pull/32',head_sha=?,design_manifest_digest=?,design_manifest_json='[]',
    publication_operation_id='publication' WHERE run_id='run-1'`).run(head,candidateSha);
  db.sqlite.prepare(`INSERT INTO design_candidates (candidate_id,run_id,round,source_attempt_id,base_commit,change_id,design_digest,
    candidate_digest,candidate_r2_key,candidate_sha256,validation_r2_key,validation_sha256,state,created_at)
    VALUES (?,'run-1',1,'source',?,'test',?,?,'candidate',?,'validation',?,'validated',?)`)
    .run(candidateId,base,candidateSha,candidateSha,'2'.repeat(64),candidateSha,stamp);
  const designReviews = new D1DesignReviewStore(d1);
  const round = await designReviews.ensureRound({runId:'run-1',roundNo:1,authorModel:'author',authorReasoning:'high',
    outsideProvider:'claude',outsideModel:CLAUDE_MODEL,outsideReasoning:CLAUDE_EFFORT,now:stamp});
  for (const id of ['source','failed']) await designReviews.recordFailedAttempt({reviewAttemptId:`design-review:${id}`,
    roundId:round.round_id,agentAttemptId:id,phase:'independent',inputSha256:input.inputSha256,inputR2Key:'design-input',
    candidateId,prDatabaseId:'32',headSha:head,modelProvider:'claude',model:CLAUDE_MODEL,reasoning:CLAUDE_EFFORT,
    evidenceManifestId:`manifest-${id}`,now:stamp});
  db.sqlite.prepare(`INSERT INTO agent_stage_retries (retry_id,run_id,failed_attempt_id,retry_node,from_visit_sequence,to_visit_sequence,
    transition_id,state,requested_by,created_at,updated_at) VALUES ('retry','run-1','source','design_independent_review',18,19,'retry-transition','established','operator',?,?)`)
    .run(stamp,stamp);
  db.sqlite.prepare(`INSERT INTO workflow_waits (wait_id,run_id,node_id,visit_sequence,status,resume_event_type,resume_event_json,
    resume_event_digest,cancel_event_type,cancel_event_json,cancel_event_digest,cause_reference,created_at)
    VALUES ('wait','run-1','review_reconciliation',20,'awaiting','resume','{}','resume-hash','cancel','{}','cancel-hash','failure',?)`).run(stamp);
  db.sqlite.prepare(`INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run-1','delivery',?,'established',?,?)`).run(sourceInstance,stamp,stamp);
  const cycle = createReviewCycle({runId:'run-1',phase:'design',attemptId:'author',inputDigest:'f'.repeat(64)});
  cycle.status='manual_reconciliation_required'; cycle.currentHead=head;
  cycle.independent={invalidCount:2,result:null,causes:[{message:'codex_exit_nonzero',manifestId:'manifest-source'},
    {message:'codex_exit_nonzero',manifestId:'manifest-failed'}]};
  const cycleText=JSON.stringify(cycle),cycleSha=await sha256Hex(cycleText);
  db.sqlite.prepare(`INSERT INTO phase_review_cycles (run_id,phase,schema_version,origin_attempt_id,state_json,state_sha256,initial_state_sha256,journal_manifest_id)
    VALUES ('run-1','design','deos-bounded-review-v1','source',?,?,?,'manifest-source')`).run(cycleText,cycleSha,cycleSha);
  const review = { version:1,inputSha256:input.inputSha256,phase:'independent',outcome:'concerns',summary:'Define the preview.',
    findings:[{id:'preview',severity:'medium',category:'operability',message:'Use a preview: https://developers.cloudflare.com/pages/configuration/preview-deployments/',
      sourceRanges:[{path:sources[0].path,startLine:1,endLine:2}]}] };
  const envelope={review,sources:[{id:'pages',title:'Preview docs',url:'https://developers.cloudflare.com/pages/configuration/preview-deployments/',
    claimLocator:'/review/findings/0/message'}],searchDisposition:'sources_used'};
  const events=[{type:'system',subtype:'init',model:CLAUDE_MODEL,apiKeySource:'none',claude_code_version:CLAUDE_VERSION,session_id:'session'},
    {type:'rate_limit_event',rate_limit_info:{status:'allowed',isUsingOverage:false,overageStatus:'rejected',overageDisabledReason:'org_level_disabled'}},
    {type:'result',session_id:'session',is_error:false,subtype:'success',terminal_reason:'completed',
      modelUsage:{[CLAUDE_MODEL]:{canonicalModel:CLAUDE_MODEL,provider:'firstParty'}},structured_output:envelope}];
  const transcript=events.map(e=>JSON.stringify(e)).join('\n')+'\n',providerInput='9'.repeat(64);
  const receipt={...validateClaudeTurn({events,appliedEfforts:[CLAUDE_EFFORT],attemptId:'source',turn:0,inputSha256:providerInput,sessionId:'session',enrollment}),
    transcript:{text:transcript,sha256:await sha256Hex(transcript),eventCount:events.length,format:'claude-stream-json-v1'},grounding:manifest};
  const claude=new ClaudeReviewStore(d1,storage);
  for (const id of ['source','failed']) {
    await claude.claim({attemptId:id,runnerId:`runner-${id}`,jobDigest:jobs[id].sha,enrollment});
    await claude.started(id,`process-${id}`);
    const turn=await claude.claimTurn(id,0,id==='source'?providerInput:'8'.repeat(64),null);
    if(id==='source') await claude.saveReceipt(turn,receipt);
    else await claude.fail(id,'review_failure');
    await claude.cleanup(id,'destroyed');
  }
  const sourceFiles = {'transcript.jsonl':transcript,'agent-input-manifest.json':JSON.stringify(manifest),
    'original-errors.jsonl':JSON.stringify({location:'runner fatal',message:'uncited_search_result: source must be cited by an existing claim',detail:'Original stack'})+'\n'};
  for (const [name,text] of Object.entries(sourceFiles)) {
    await storage.put(`source/${name}`,text);
    db.sqlite.prepare(`INSERT INTO artifacts VALUES ('manifest-source',?,?,?,?,?,?,'accepted')`)
      .run(name,`source/${name}`,'application/json',Buffer.byteLength(text),await sha256Hex(text),stamp);
  }
  const calls:string[]=[],states=new Map([[sourceInstance,'waiting']]);
  let pauseHook=()=>{},loseCreate=false,syncFailure=false;
  const workflows={ async get(id:string) { return {
    async status(){if(!states.has(id))throw new Error('instance absent');return{status:states.get(id)};},
    async pause(){calls.push('pause');states.set(id,'paused');pauseHook();},
    async resume(){calls.push('resume');states.set(id,'waiting');},
    async terminate(){calls.push('terminate');states.set(id,'terminated');},
  };},async createBatch(items:{id:string}[]){calls.push('create');items.forEach(i=>states.set(i.id,'running'));
    if(loseCreate)throw new Error('lost create response');return[];} };
  const pull={id:32,number:32,state:'open',merged:false,head:{sha:head,ref:'design'},base:{ref:'main'}} as ImplementationPull;
  const controller=new IndependentReviewReconciliationController({DB:d1,ARTIFACTS:storage,STAGE_RETRY_SECRET:'secret',ORCHESTRATION_WORKFLOW:workflows} as unknown as Env,{
    pull:async()=>pull,sync:async()=>{calls.push('sync');if(syncFailure)throw new Error('provider check unavailable');},
  });
  const requestInput={version:1,runId:'run-1',sourceAttemptId:'source',failedAttemptId:'failed',workflowInstanceId:sourceInstance,
    definitionDigest:definition.digest,visitSequence:20,headSha:head,requestedBy:'operator'};
  const request=(extra={},secret='secret')=>new Request('https://internal/independent-review-reconciliations',{
    method:'POST',headers:{Authorization:`Bearer ${secret}`},body:JSON.stringify({...requestInput,...extra})});
  const plan=async()=>await(await controller.handle(request())).json() as any;
  return {db,bucket,storage,orchestration,claude,controller,request,plan,cycleText,review,receipt,pull,calls,states,
    setPauseHook:(hook:()=>void)=>{pauseHook=hook;},loseCreate:()=>{loseCreate=true;},setSyncFailure:(value:boolean)=>{syncFailure=value;}};
}

test('receipt recovery preserves failed attempts and budgets, accepts original findings and dispatches only the author',async()=>{
  const f=await fixture();try{
    const before=f.db.sqlite.prepare('SELECT * FROM agent_attempts ORDER BY attempt_id').all();
    const failures=f.db.sqlite.prepare('SELECT * FROM design_review_attempts ORDER BY review_attempt_id').all();
    const objects=f.bucket.objects.size,p=await f.plan();
    assert.equal(p.ready,true);assert.equal(p.plan.findingCount,1);assert.equal(f.bucket.objects.size,objects);assert.deepEqual(f.calls,[]);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM independent_review_receipt_reconciliations').get()!.n,0);
    const extra={execute:true,planDigest:p.planDigest};
    const result=await(await f.controller.handle(f.request(extra))).json() as any;
    assert.equal(result.state,'established');assert.deepEqual(f.calls,['pause','sync','terminate','create']);
    const run=(await f.orchestration.findRun('run-1'))!;
    assert.equal(run.current_node,'design_independent_response');assert.equal(run.current_visit_sequence,21);assert.equal(run.status,'active');
    assert.equal(run.definition_digest,definition.digest);assert.equal(run.allowed_linear_user_id,'human');
    assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM agent_attempts ORDER BY attempt_id').all(),before);
    assert.deepEqual(f.db.sqlite.prepare('SELECT * FROM design_review_attempts WHERE accepted=0 ORDER BY review_attempt_id').all(),failures);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_findings').get()!.n,1);
    assert.equal(f.db.sqlite.prepare("SELECT message FROM design_review_findings WHERE finding_id='preview'").get()!.message,f.review.findings[0].message);
    const cycle=JSON.parse((await new D1BoundedReviewStore(f.db as unknown as D1Database,f.storage).read('run-1','design'))!.state_json);
    assert.equal(cycle.independent.invalidCount,2);assert.deepEqual(cycle.independent.causes,JSON.parse(f.cycleText).independent.causes);
    assert.equal(cycle.independent.attemptId,'source');assert.equal(cycle.response.result,null);assert.equal(cycle.response.invalidCount,0);
    assert.equal((await f.claude.invocation('source'))!.state,'running');assert.equal((await f.claude.invocation('failed'))!.state,'failed');
    assert.deepEqual({...f.db.sqlite.prepare('SELECT status,consumed_delivery_id FROM workflow_waits').get()},{status:'consumed',consumed_delivery_id:null});
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM human_gate_visits').get()!.n,0);
    assert.deepEqual(await(await f.controller.handle(f.request(extra))).json(),result);assert.equal(f.calls.filter(c=>c==='create').length,1);
  }finally{f.db.close();}
});

test('recovery rejects stale subjects, corrupt receipts, forged input, wrong capability and active work',async()=>{
  const f=await fixture();try{
    assert.equal((await f.controller.handle(f.request({},'wrong'))).status,401);
    await assert.rejects(f.controller.handle(f.request({receipt:{result:'pass'}})),/invalid_independent_receipt_request/);
    await assert.rejects(f.controller.handle(f.request({visitSequence:21})),/run_changed/);
    const p=await f.plan();await assert.rejects(f.controller.handle(f.request({execute:true,planDigest:'wrong'})),/plan_mismatch/);
    f.pull.head.sha='c'.repeat(40);await assert.rejects(f.plan(),/github_subject_changed/);f.pull.head.sha=head;
    const turn=(await f.claude.turn('source',0))!;
    const bytes=f.bucket.objects.get(turn.receipt_key!)!;
    f.bucket.objects.set(turn.receipt_key!,new TextEncoder().encode('{}'));await assert.rejects(f.plan(),/review_failure/);
    f.bucket.objects.set(turn.receipt_key!,bytes);
    seedAttempt(f.db,'active');await assert.rejects(f.plan(),/recovery_boundary_changed/);
    assert.deepEqual(f.calls,[]);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
  }finally{f.db.close();}
});

test('a competing attempt during pause aborts all domain changes and resumes the original workflow',async()=>{
  const f=await fixture();try{
    const p=await f.plan();f.setPauseHook(()=>seedAttempt(f.db,'racing'));
    await assert.rejects(f.controller.handle(f.request({execute:true,planDigest:p.planDigest})),/compare_and_set_failed/);
    assert.deepEqual(f.calls,['pause','resume']);assert.equal((await f.orchestration.findRun('run-1'))!.current_node,'review_reconciliation');
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
    assert.equal(f.db.sqlite.prepare('SELECT state_json FROM phase_review_cycles').get()!.state_json,f.cycleText);
    assert.equal(f.db.sqlite.prepare('SELECT status FROM workflow_waits').get()!.status,'awaiting');
  }finally{f.db.close();}
});

test('an acceptance constraint failure rolls back the run, cycle and evidence indexes together',async()=>{
  const f=await fixture();try{
    const p=await f.plan();f.db.sqlite.exec("CREATE TRIGGER reject_test_finding BEFORE INSERT ON design_review_findings BEGIN SELECT RAISE(ABORT,'test storage failure'); END;");
    await assert.rejects(f.controller.handle(f.request({execute:true,planDigest:p.planDigest})),/test storage failure/);
    assert.deepEqual(f.calls,['pause','resume']);assert.equal((await f.orchestration.findRun('run-1'))!.workflow_instance_id,sourceInstance);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM artifact_manifests').get()!.n,2);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
  }finally{f.db.close();}
});

test('lost create response settles one replacement and provider errors cannot dispatch the author',async()=>{
  const f=await fixture();try{
    const p=await f.plan(),extra={execute:true,planDigest:p.planDigest};f.setSyncFailure(true);
    await assert.rejects(f.controller.handle(f.request(extra)),/provider check unavailable/);
    assert.equal(f.db.sqlite.prepare('SELECT state FROM independent_review_receipt_reconciliations').get()!.state,'applied');
    assert.deepEqual(f.calls,['pause','sync']);assert.equal(f.states.get(sourceInstance),'paused');
    f.setSyncFailure(false);f.loseCreate();
    assert.equal((await(await f.controller.handle(f.request(extra))).json() as any).state,'established');
    assert.equal(f.calls.filter(c=>c==='create').length,1);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM agent_attempts').get()!.n,2);
  }finally{f.db.close();}
});

test('a lost pause response resumes the same audited request, while a changed remote head cannot be accepted',async()=>{
  const f=await fixture();try{
    const p=await f.plan(),extra={execute:true,planDigest:p.planDigest};
    f.setPauseHook(()=>{throw new Error('lost pause response');});
    await assert.rejects(f.controller.handle(f.request(extra)),/lost pause response/);
    assert.equal(f.states.get(sourceInstance),'paused');
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
    f.setPauseHook(()=>{});
    assert.equal((await(await f.controller.handle(f.request(extra))).json() as any).state,'established');
    assert.equal(f.calls.filter(c=>c==='pause').length,1);
  }finally{f.db.close();}
  const changed=await fixture();try{
    const p=await changed.plan();changed.setPauseHook(()=>{changed.pull.head.sha='d'.repeat(40);});
    await assert.rejects(changed.controller.handle(changed.request({execute:true,planDigest:p.planDigest})),/github_subject_changed/);
    assert.deepEqual(changed.calls,['pause','resume']);
    assert.equal(changed.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
  }finally{changed.db.close();}
});

test('a newer provider receipt or missing dispatch intent prevents choosing the older result',async()=>{
  const f=await fixture();try{
    const p=await f.plan();
    f.setPauseHook(()=>{f.db.sqlite.prepare("UPDATE claude_review_turns SET receipt_key='newer-result',receipt_sha256=? WHERE attempt_id='failed'").run('a'.repeat(64));});
    await assert.rejects(f.controller.handle(f.request({execute:true,planDigest:p.planDigest})),/compare_and_set_failed/);
    assert.deepEqual(f.calls,['pause','resume']);assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM design_review_attempts WHERE accepted=1').get()!.n,0);
  }finally{f.db.close();}
  const deleted=await fixture();try{
    const p=await deleted.plan();deleted.setPauseHook(()=>{deleted.db.sqlite.exec('DELETE FROM dispatch_intents');});
    await assert.rejects(deleted.controller.handle(deleted.request({execute:true,planDigest:p.planDigest})),/compare_and_set_failed/);
    assert.equal((await deleted.orchestration.findRun('run-1'))!.workflow_instance_id,sourceInstance);
    assert.equal(deleted.db.sqlite.prepare('SELECT state_json FROM phase_review_cycles').get()!.state_json,deleted.cycleText);
  }finally{deleted.db.close();}
});
