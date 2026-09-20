import { D1OrchestrationStore } from './orchestration-store.ts';
import { ImplementationStore, type ImplementationInput } from './implementation-store.ts';
import { restoreWorkflowDefinition, type LoadedWorkflowDefinition } from './workflow-definition.ts';
import { implementationDemoUpgradeDefinition } from './implementation-demo-upgrade-definition.ts';
import { sha256Hex } from './implementation-hash.ts';
import { AgentStageRetryController, D1AgentStageRetryStore } from './stage-retry.ts';
import type { WorkflowBinding } from './queue-consumer-core.ts';
import { ImplementationDemoService } from './implementation-demo.ts';
import { validateDemoCorrectionRequest, type DemoCorrectionRequest, type DemoPlan } from './implementation-demo-contract.ts';
import { ClaudeReviewStore } from './claude-review-store.ts';
import type { AgentAttemptRecord } from './sandbox-controller.ts';

interface UpgradeInput {
  version: 1; runId: string; failedAttemptId: string; sourceDefinitionDigest: string;
  sourceWorkflowInstanceId: string; visitSequence: number; targetVersion: number;
  requestedBy: string; execute?: boolean; planDigest?: string;
  correction?: DemoCorrectionRequest;
  handoffPolicy?: 'single_repair';
  mode?: 'activate_only';
  enableTemporaryEnvironment?: true;
}
interface UpgradePlan {
  input: UpgradeInput; targetDigest: string; approvedInputSha: string; testedBaseSha: string;
  patchSha: string | null; branch: string; humanUserId: string | null; humanRevision: number | null;
  savedReviewDigest?: string;
  upgradedInput?: { key: string; sha256: string };
}
export class ImplementationDemoUpgradeController {
  readonly env: Env;
  readonly tail: LoadedWorkflowDefinition;
  constructor(env: Env, tail: LoadedWorkflowDefinition) {this.env=env;this.tail=tail;}
  async handle(request: Request): Promise<Response> {
    if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
    if(!this.env.STAGE_RETRY_SECRET || request.headers.get('Authorization')!==`Bearer ${this.env.STAGE_RETRY_SECRET}`)
      return Response.json({error:'invalid_operator_capability'},{status:401});
    const input=await request.json() as UpgradeInput;
    if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>![
      'version','runId','failedAttemptId','sourceDefinitionDigest','sourceWorkflowInstanceId','visitSequence','targetVersion','requestedBy','execute','planDigest','correction','handoffPolicy','mode','enableTemporaryEnvironment'].includes(key)) ||
      input.version!==1 || typeof input.runId!=='string' || typeof input.failedAttemptId!=='string' ||
      !/^[a-f0-9]{64}$/.test(input.sourceDefinitionDigest) || typeof input.sourceWorkflowInstanceId!=='string' ||
      !Number.isSafeInteger(input.visitSequence) || input.visitSequence<1 || !Number.isSafeInteger(input.targetVersion) ||
      input.targetVersion<=this.tail.version || !/^[a-zA-Z0-9._@-]{1,100}$/.test(input.requestedBy) ||
      (input.execute!==undefined && typeof input.execute!=='boolean') ||
      (input.handoffPolicy!==undefined && (input.handoffPolicy!=='single_repair' || input.correction!==undefined)) ||
      (input.mode!==undefined && (input.mode!=='activate_only' || input.correction!==undefined || input.handoffPolicy!==undefined)) ||
      (input.enableTemporaryEnvironment!==undefined && (input.enableTemporaryEnvironment!==true || input.mode!=='activate_only'))) throw new Error('invalid_demo_upgrade_request');
    if(input.correction!==undefined)validateDemoCorrectionRequest(input.correction);
    const identity={...input};delete identity.execute;delete identity.planDigest;
    const existing=await this.env.DB.prepare('SELECT plan_json,plan_digest FROM implementation_demo_upgrades WHERE failed_attempt_id=?')
      .bind(input.failedAttemptId).first<{plan_json:string;plan_digest:string}>();
    if(existing) {
      const saved=JSON.parse(existing.plan_json) as UpgradePlan;
      if(JSON.stringify(saved.input)!==JSON.stringify(identity) || (input.execute && input.planDigest!==existing.plan_digest))
        throw new Error('implementation_demo_upgrade_identity_mismatch');
      const row=await this.env.DB.prepare('SELECT canonical_json,digest FROM workflow_definitions WHERE definition_id=? AND version=? AND digest=?')
        .bind('implementation',input.targetVersion,saved.targetDigest).first<{canonical_json:string;digest:string}>();
      if(!row)throw new Error('implementation_demo_upgrade_definition_missing');
      if(!input.execute)return Response.json({plan:saved,planDigest:existing.plan_digest});
      if(input.mode==='activate_only') return this.activateOnly(identity,saved);
      return this.resume(request,identity,await restoreWorkflowDefinition(row.canonical_json,row.digest));
    }
    const orchestration=new D1OrchestrationStore(this.env.DB);
    const run=await orchestration.findRun(input.runId);
    if(!run || run.status!=='failed' || run.current_node!=='implementation_failed' || run.current_visit_sequence!==input.visitSequence ||
      run.definition_digest!==input.sourceDefinitionDigest || run.workflow_instance_id!==input.sourceWorkflowInstanceId)
      throw new Error('implementation_demo_upgrade_source_changed');
    const attempt=await this.env.DB.prepare('SELECT node_id,state,cleanup_state,visit_sequence FROM agent_attempts WHERE run_id=? AND attempt_id=?')
      .bind(input.runId,input.failedAttemptId).first<{node_id:string;state:string;cleanup_state:string;visit_sequence:number}>();
    if(!attempt || !(input.mode==='activate_only' ? ['implementation_tasks','implementation_build','implementation_demo_plan','implementation_demo_gate'].includes(attempt.node_id)
      : attempt.node_id===(input.handoffPolicy ? 'implementation_demo_gate' : 'implementation_build')) || !['failed','interrupted','absolute_timeout'].includes(attempt.state) ||
      attempt.cleanup_state!=='destroyed' || attempt.visit_sequence!==input.visitSequence-1)
      throw new Error('implementation_demo_upgrade_attempt_not_ready');
    const active=await this.env.DB.prepare(`SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting')
      UNION ALL SELECT 1 FROM implementation_gates WHERE run_id=? AND state='open' LIMIT 1`)
      .bind(input.runId,input.runId).first();
    if(active)throw new Error('implementation_demo_upgrade_active_work_or_gate');
    const work=await new ImplementationStore(this.env.DB,this.env.ARTIFACTS).requireRun(input.runId);
    const source=await this.env.DB.prepare('SELECT canonical_json FROM workflow_definitions WHERE definition_id=? AND version=? AND digest=?')
      .bind(run.definition_id,run.definition_version,run.definition_digest).first<{canonical_json:string}>();
    if(!source)throw new Error('implementation_demo_upgrade_source_missing');
    const frozen=await restoreWorkflowDefinition(source.canonical_json,run.definition_digest);
    // Existing demo workflows may re-enter planning only for an explicit,
    // hash-bound correction. An author cannot request this through its tools.
    if(input.handoffPolicy && (!frozen.jobs.implementation_demo_gate ||
      frozen.nodes.implementation_proof_check.edges.review_ready === 'implementation_branch_write'))
      throw new Error('implementation_demo_handoff_policy_not_eligible');
    if(frozen.jobs.implementation_demo_plan && !input.correction && !input.handoffPolicy && !input.mode)throw new Error('implementation_demo_correction_required');
    if(input.correction) {
      const demos=new ImplementationDemoService(this.env.DB,this.env.ARTIFACTS);
      const prior=await demos.latest(input.runId,'plan');
      if(!prior || prior.payload_sha!==input.correction.planSha256)throw new Error('implementation_demo_correction_plan_changed');
      const value=await demos.read<DemoPlan>(prior);
      if(input.correction.scenarioIds.some(id=>!value.scenarios.some(scenario=>scenario.id===id)))
        throw new Error('implementation_demo_correction_scenario_missing');
    }
    const target=await implementationDemoUpgradeDefinition(frozen,this.tail,input.targetVersion,input.enableTemporaryEnvironment);
    let upgradedInput: UpgradePlan['upgradedInput'];
    if (input.enableTemporaryEnvironment) {
      const checked = await new ImplementationStore(this.env.DB,this.env.ARTIFACTS).read<ImplementationInput>(work.input_key,work.input_sha);
      if (JSON.stringify(checked.policy)!==JSON.stringify(frozen.implementationPolicy))
        throw new Error('implementation_demo_upgrade_policy_mismatch');
      const sha256=await sha256Hex(JSON.stringify({...checked,policy:target.implementationPolicy}));
      upgradedInput={key:`implementation/${input.runId}/${sha256}/checked-input.json`,sha256};
    }
    const savedReviewDigest = input.handoffPolicy ? (await this.restoreSavedReview(input,true)).aggregateDigest : undefined;
    const plan: UpgradePlan={input:identity,targetDigest:target.digest,approvedInputSha:work.input_sha,testedBaseSha:work.tested_base_sha,
      patchSha:work.patch_sha,branch:work.branch,humanUserId:run.allowed_linear_user_id ?? null,humanRevision:run.human_binding_revision ?? null,
      ...(savedReviewDigest ? {savedReviewDigest} : {}),...(upgradedInput ? {upgradedInput} : {})};
    const encoded=JSON.stringify(plan),digest=await sha256Hex(encoded);
    if(!input.execute)return Response.json({plan,planDigest:digest});
    if(input.planDigest!==digest)throw new Error('implementation_demo_upgrade_plan_changed');
    await orchestration.registerDefinition({definition:target,projectId:run.project_id,now:new Date().toISOString()});
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_demo_upgrades VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(input.failedAttemptId,input.runId,digest,encoded,run.definition_digest,target.digest,work.input_sha,work.tested_base_sha,work.patch_sha,new Date().toISOString()).run();
    const saved=await this.env.DB.prepare('SELECT plan_digest FROM implementation_demo_upgrades WHERE failed_attempt_id=?')
      .bind(input.failedAttemptId).first<{plan_digest:string}>();
    if(saved?.plan_digest!==digest)throw new Error('implementation_demo_upgrade_identity_mismatch');
    if(input.mode==='activate_only') return this.activateOnly(identity,plan);
    return this.resume(request,identity,target);
  }
  private async activateOnly(input:UpgradeInput,plan:UpgradePlan) {
    const targetDigest=plan.targetDigest;
    const statements: D1PreparedStatement[]=[];
    if (plan.upgradedInput) {
      const store=new ImplementationStore(this.env.DB,this.env.ARTIFACTS);
      const work=await store.requireRun(input.runId);
      if (![plan.approvedInputSha,plan.upgradedInput.sha256].includes(work.input_sha))
        throw new Error('implementation_demo_upgrade_input_changed');
      const checked=await store.read<ImplementationInput>(work.input_key,work.input_sha);
      const target=await this.env.DB.prepare('SELECT canonical_json FROM workflow_definitions WHERE definition_id=? AND version=? AND digest=?')
        .bind('implementation',input.targetVersion,targetDigest).first<{canonical_json:string}>();
      if (!target) throw new Error('implementation_demo_upgrade_definition_missing');
      const definition=await restoreWorkflowDefinition(target.canonical_json,targetDigest);
      const artifact=await store.put(input.runId,'checked-input.json',JSON.stringify({...checked,policy:definition.implementationPolicy}));
      if (artifact.sha256!==plan.upgradedInput.sha256 || artifact.key!==plan.upgradedInput.key)
        throw new Error('implementation_demo_upgrade_input_changed');
      // The original object is immutable and remains named in the audit. Only
      // this stopped run's pointer changes; provider adapters are retained.
      statements.push(this.env.DB.prepare(`UPDATE implementation_runs SET input_key=?,input_sha=? WHERE run_id=? AND input_sha IN (?,?)
        AND EXISTS (SELECT 1 FROM orchestration_runs r WHERE r.run_id=? AND r.status='failed'
          AND r.current_node='implementation_failed' AND r.current_visit_sequence=? AND r.workflow_instance_id=?
          AND r.definition_digest IN (?,?))
        AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting'))
        AND NOT EXISTS (SELECT 1 FROM implementation_gates WHERE run_id=? AND state='open')
        AND EXISTS (SELECT 1 FROM agent_attempts WHERE attempt_id=? AND run_id=? AND cleanup_state='destroyed'
          AND state IN ('failed','interrupted','absolute_timeout') AND visit_sequence=?)`)
        .bind(artifact.key,artifact.sha256,input.runId,plan.approvedInputSha,artifact.sha256,input.runId,input.visitSequence,
          input.sourceWorkflowInstanceId,input.sourceDefinitionDigest,targetDigest,input.runId,input.runId,
          input.failedAttemptId,input.runId,input.visitSequence-1));
    }
    statements.push(this.env.DB.prepare(`UPDATE orchestration_runs SET definition_version=?,definition_digest=?,updated_at=?
      WHERE run_id=? AND status='failed' AND current_node='implementation_failed' AND current_visit_sequence=?
        AND workflow_instance_id=? AND definition_digest=?
        AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting'))
        AND NOT EXISTS (SELECT 1 FROM implementation_gates WHERE run_id=? AND state='open')
        AND EXISTS (SELECT 1 FROM agent_attempts WHERE attempt_id=? AND run_id=? AND cleanup_state='destroyed'
          AND state IN ('failed','interrupted','absolute_timeout') AND visit_sequence=?)
        AND EXISTS (SELECT 1 FROM implementation_runs WHERE run_id=? AND input_sha=?)`)
      .bind(input.targetVersion,targetDigest,new Date().toISOString(),input.runId,input.visitSequence,input.sourceWorkflowInstanceId,
        input.sourceDefinitionDigest,input.runId,input.runId,input.failedAttemptId,input.runId,input.visitSequence-1,
        input.runId,plan.upgradedInput?.sha256 ?? plan.approvedInputSha));
    await this.env.DB.batch(statements);
    const run=await new D1OrchestrationStore(this.env.DB).findRun(input.runId);
    if(run?.definition_digest!==targetDigest || run.status!=='failed' || run.current_visit_sequence!==input.visitSequence)
      throw new Error('implementation_demo_upgrade_source_changed');
    return Response.json({activated:true,resumed:false,runId:input.runId,definitionVersion:run.definition_version,
      definitionDigest:run.definition_digest,currentNode:run.current_node,visitSequence:run.current_visit_sequence});
  }
  private async restoreSavedReview(input: UpgradeInput,dryRun:boolean) {
    const attempt=await this.env.DB.prepare('SELECT * FROM agent_attempts WHERE run_id=? AND attempt_id=?')
      .bind(input.runId,input.failedAttemptId).first<AgentAttemptRecord>();
    if(!attempt || await sha256Hex(attempt.job_spec_json)!==attempt.job_spec_digest)throw new Error('saved_demo_job_mismatch');
    const reviews=new ClaudeReviewStore(this.env.DB,this.env.ARTIFACTS);
    const invocation=await reviews.invocation(attempt.attempt_id);
    const collection=await reviews.collection(attempt.attempt_id,attempt.job_spec_digest);
    if(invocation?.state!=='finished' || invocation.cleanup_state!=='destroyed' || !collection ||
      collection.result.reviewOutcome!=='needs_work')throw new Error('saved_demo_findings_unavailable');
    const run=await new D1OrchestrationStore(this.env.DB).findRun(input.runId);
    if(!run)throw new Error('saved_demo_run_missing');
    await new ImplementationDemoService(this.env.DB,this.env.ARTIFACTS).accept({run,attempt,collection,dryRun});
    return collection;
  }
  private async resume(request: Request,input: UpgradeInput,target: LoadedWorkflowDefinition) {
    if(input.handoffPolicy) {
      const accepted=await this.env.DB.prepare('SELECT outcome FROM implementation_demo_reviews WHERE attempt_id=? AND run_id=?')
        .bind(input.failedAttemptId,input.runId).first<{outcome:string}>();
      if(!accepted)await this.restoreSavedReview(input,false);
      else if(accepted.outcome!=='needs_work')throw new Error('saved_demo_recovery_outcome_changed');
    }
    // The existing retry transaction rechecks the failed attempt, cleanup, frozen
    // inputs and absence of a live gate before it changes the run or dispatches.
    return new AgentStageRetryController(new D1AgentStageRetryStore(this.env.DB),this.env.ORCHESTRATION_WORKFLOW as unknown as WorkflowBinding,
      this.env.STAGE_RETRY_SECRET,target).handle(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({version:1,
        runId:input.runId,failedAttemptId:input.failedAttemptId,retryNode:input.handoffPolicy?'implementation_demo_gate':'implementation_build',requestedBy:input.requestedBy})}));
  }
}
