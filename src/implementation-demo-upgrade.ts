import { D1OrchestrationStore } from './orchestration-store.ts';
import { ImplementationStore } from './implementation-store.ts';
import { restoreWorkflowDefinition, type LoadedWorkflowDefinition } from './workflow-definition.ts';
import { implementationDemoUpgradeDefinition } from './implementation-demo-upgrade-definition.ts';
import { sha256Hex } from './implementation-hash.ts';
import { AgentStageRetryController, D1AgentStageRetryStore } from './stage-retry.ts';
import type { WorkflowBinding } from './queue-consumer-core.ts';

interface UpgradeInput {
  version: 1; runId: string; failedAttemptId: string; sourceDefinitionDigest: string;
  sourceWorkflowInstanceId: string; visitSequence: number; targetVersion: number;
  requestedBy: string; execute?: boolean; planDigest?: string;
}
interface UpgradePlan {
  input: UpgradeInput; targetDigest: string; approvedInputSha: string; testedBaseSha: string;
  patchSha: string | null; branch: string; humanUserId: string | null; humanRevision: number | null;
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
      'version','runId','failedAttemptId','sourceDefinitionDigest','sourceWorkflowInstanceId','visitSequence','targetVersion','requestedBy','execute','planDigest'].includes(key)) ||
      input.version!==1 || typeof input.runId!=='string' || typeof input.failedAttemptId!=='string' ||
      !/^[a-f0-9]{64}$/.test(input.sourceDefinitionDigest) || typeof input.sourceWorkflowInstanceId!=='string' ||
      !Number.isSafeInteger(input.visitSequence) || input.visitSequence<1 || !Number.isSafeInteger(input.targetVersion) ||
      input.targetVersion<=this.tail.version || !/^[a-zA-Z0-9._@-]{1,100}$/.test(input.requestedBy) ||
      (input.execute!==undefined && typeof input.execute!=='boolean')) throw new Error('invalid_demo_upgrade_request');
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
      return this.resume(request,identity,await restoreWorkflowDefinition(row.canonical_json,row.digest));
    }
    const orchestration=new D1OrchestrationStore(this.env.DB);
    const run=await orchestration.findRun(input.runId);
    if(!run || run.status!=='failed' || run.current_node!=='implementation_failed' || run.current_visit_sequence!==input.visitSequence ||
      run.definition_digest!==input.sourceDefinitionDigest || run.workflow_instance_id!==input.sourceWorkflowInstanceId)
      throw new Error('implementation_demo_upgrade_source_changed');
    const attempt=await this.env.DB.prepare('SELECT node_id,state,cleanup_state,visit_sequence FROM agent_attempts WHERE run_id=? AND attempt_id=?')
      .bind(input.runId,input.failedAttemptId).first<{node_id:string;state:string;cleanup_state:string;visit_sequence:number}>();
    if(!attempt || attempt.node_id!=='implementation_build' || !['failed','interrupted','absolute_timeout'].includes(attempt.state) ||
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
    const target=await implementationDemoUpgradeDefinition(await restoreWorkflowDefinition(source.canonical_json,run.definition_digest),this.tail,input.targetVersion);
    const plan: UpgradePlan={input:identity,targetDigest:target.digest,approvedInputSha:work.input_sha,testedBaseSha:work.tested_base_sha,
      patchSha:work.patch_sha,branch:work.branch,humanUserId:run.allowed_linear_user_id ?? null,humanRevision:run.human_binding_revision ?? null};
    const encoded=JSON.stringify(plan),digest=await sha256Hex(encoded);
    if(!input.execute)return Response.json({plan,planDigest:digest});
    if(input.planDigest!==digest)throw new Error('implementation_demo_upgrade_plan_changed');
    await orchestration.registerDefinition({definition:target,projectId:run.project_id,now:new Date().toISOString()});
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_demo_upgrades VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(input.failedAttemptId,input.runId,digest,encoded,run.definition_digest,target.digest,work.input_sha,work.tested_base_sha,work.patch_sha,new Date().toISOString()).run();
    const saved=await this.env.DB.prepare('SELECT plan_digest FROM implementation_demo_upgrades WHERE failed_attempt_id=?')
      .bind(input.failedAttemptId).first<{plan_digest:string}>();
    if(saved?.plan_digest!==digest)throw new Error('implementation_demo_upgrade_identity_mismatch');
    return this.resume(request,identity,target);
  }
  private resume(request: Request,input: UpgradeInput,target: LoadedWorkflowDefinition) {
    // The existing retry transaction rechecks the failed attempt, cleanup, frozen
    // inputs and absence of a live gate before it changes the run or dispatches.
    return new AgentStageRetryController(new D1AgentStageRetryStore(this.env.DB),this.env.ORCHESTRATION_WORKFLOW as unknown as WorkflowBinding,
      this.env.STAGE_RETRY_SECRET,target).handle(new Request(request.url,{method:'POST',headers:request.headers,body:JSON.stringify({version:1,
        runId:input.runId,failedAttemptId:input.failedAttemptId,retryNode:'implementation_build',requestedBy:input.requestedBy})}));
  }
}
