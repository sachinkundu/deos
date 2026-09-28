import {ImplementationStore,type ImplementationInput,
  type ImplementationRun} from './implementation-store.ts';
import {implementationGitHub,type ImplementationPull} from './implementation-github.ts';
import {sha256Hex} from './implementation-hash.ts';
import {D1PlanningStore} from './planning-store.ts';
import {D1DesignStore} from './design-store.ts';
import {D1OrchestrationStore,type OrchestrationRunRecord} from './orchestration-store.ts';
import {runIdentity,workflowInstanceIdentity} from './orchestration-identity.ts';
import {LinearCapabilityAdapter} from './linear-capability.ts';
import type {LoadedWorkflowDefinition} from './workflow-definition.ts';
import {validateImplementationPath,type ImplementationCandidate} from './implementation-contract.ts';
import {recordCaughtError} from './error-context.ts';

const sha40=/^[a-f0-9]{40}$/;
const sha64=/^[a-f0-9]{64}$/;
const activeStates=['pending','starting','running','collecting'];

interface RequestBody {
  version:1;sourceRunId:string;sourceHeadSha:string;targetHeadSha:string;
  targetBaseSha:string;targetTreeSha:string;targetPatchKey:string;
  targetPatchSha:string;targetCandidateKey:string;targetCandidateSha:string;
  execute?:boolean;planDigest?:string;
}
interface HandoffRow {source_run_id:string;target_run_id:string;plan_digest:string;
  state:'prepared'|'admitted'|'dispatched';}
interface GitHubComparison {status:string;files?:{filename:string}[];total_commits:number;}
interface Plan {
  sourceRunId:string;targetRunId:string;sourceWorkflowInstanceId:string;
  targetWorkflowInstanceId:string;sourceDefinitionDigest:string;
  targetDefinitionDigest:string;sourceCandidateCommit:string;
  targetCandidateCommit:string;sourcePatchSha256:string;
  targetPatchSha256:string;sourceCandidateSha256:string;
  targetCandidateSha256:string;targetBaseCommit:string;targetTreeSha:string;
  pullRequestNumber:number;planningMergeCommit:string;designMergeCommit:string;
  issueId:string;projectId:string;branch:string;humanUserId:string;
  humanBindingRevision:number;targetSequence:number;sourceErrorId:string;
  targetPatchKey:string;targetCandidateKey:string;
}

function parse(value:unknown):RequestBody {
  if(!value || typeof value!=='object' || Array.isArray(value))
    throw new Error('shared_test_handoff_request_invalid');
  const input=value as RequestBody;
  if(Object.keys(input).some(key=>![
      'version','sourceRunId','sourceHeadSha','targetHeadSha','targetBaseSha',
      'targetTreeSha','targetPatchKey','targetPatchSha','targetCandidateKey',
      'targetCandidateSha','execute','planDigest'].includes(key)) ||
    input.version!==1 || !input.sourceRunId ||
    ![input.sourceHeadSha,input.targetHeadSha,input.targetBaseSha,
      input.targetTreeSha].every(value=>typeof value==='string' && sha40.test(value)) ||
    ![input.targetPatchSha,input.targetCandidateSha].every(value=>
      typeof value==='string' && sha64.test(value)) ||
    ![input.targetPatchKey,input.targetCandidateKey].every(value=>
      typeof value==='string' && value.startsWith('implementation/') &&
      !value.includes('..')) ||
    (input.execute!==undefined && typeof input.execute!=='boolean') ||
    (input.planDigest!==undefined && !sha64.test(input.planDigest)))
    throw new Error('shared_test_handoff_request_invalid');
  return input;
}

/** One stopped implementation run can seed one new test run. No old gate is replayed. */
export class SharedTestRunHandoff {
  readonly env:Env;
  readonly definition:LoadedWorkflowDefinition;
  constructor(env:Env,definition:LoadedWorkflowDefinition) {
    this.env=env;this.definition=definition;
  }

  private async plan(input:RequestBody):Promise<{plan:Plan;source:OrchestrationRunRecord;
    work:ImplementationRun;approved:ImplementationInput}> {
    const db=this.env.DB,store=new ImplementationStore(db,this.env.ARTIFACTS);
    const source=await new D1OrchestrationStore(db).findRun(input.sourceRunId);
    if(!source || source.status!=='failed' ||
      source.terminal_cause!=='workflow_executor_timeout' ||
      source.current_node!=='implementation_clarification_wait' ||
      source.definition_id!=='implementation' || source.definition_version>=this.definition.version ||
      !source.allowed_linear_user_id || !source.human_binding_revision ||
      !source.route_repository || source.route_repository!=='sachinkundu/deos' ||
      this.definition.name!=='implementation' ||
      this.definition.nodes.shared_test_decide?.type!=='system_action' ||
      !this.definition.implementationPolicy)
      throw new Error('shared_test_handoff_source_not_frozen');
    const expectedTargetRunId=runIdentity(source.correlation_id,source.run_sequence+1);
    if(!input.targetPatchKey.startsWith(`implementation/${expectedTargetRunId}/`) ||
      !input.targetCandidateKey.startsWith(`implementation/${expectedTargetRunId}/`))
      throw new Error('shared_test_handoff_artifact_scope_changed');
    const oldInstance=await this.env.ORCHESTRATION_WORKFLOW.get(source.workflow_instance_id);
    if((await oldInstance.status()).status!=='errored')
      throw new Error('shared_test_handoff_executor_not_errored');
    const error=await db.prepare(`SELECT error_id,detail_r2_key,message
      FROM workflow_errors WHERE run_id=? AND node_id=? AND visit_sequence=?
      AND message LIKE 'Execution timed out%'
      ORDER BY occurred_at DESC LIMIT 1`)
      .bind(source.run_id,source.current_node,source.current_visit_sequence)
      .first<{error_id:string;detail_r2_key:string;message:string}>();
    if(!error || !error.message.includes('Execution timed out') ||
      !await this.env.ARTIFACTS.get(error.detail_r2_key))
      throw new Error('shared_test_handoff_original_error_missing');
    const active=await db.prepare(`SELECT attempt_id FROM agent_attempts
      WHERE run_id=? AND state IN ('pending','starting','running','collecting') LIMIT 1`)
      .bind(source.run_id).first();
    const lease=await db.prepare(`SELECT lease_id FROM test_leases WHERE run_id=?
      AND state IN ('preparing','active','quiescing','cleaning','blocked') LIMIT 1`)
      .bind(source.run_id).first();
    if(active || lease)throw new Error('shared_test_handoff_source_still_owns_work');
    const work=await store.requireRun(source.run_id);
    if(work.pr_number!==137 || work.branch!=='deos/agent/SAC-182/run-1' ||
      work.pr_head_sha!==input.sourceHeadSha || work.tested_base_sha===input.targetBaseSha ||
      !work.tree_sha || !work.patch_sha || !work.patch_key || !work.candidate_sha ||
      !work.candidate_key || !work.pr_url ||
      !sha40.test(work.approved_design_sha))
      throw new Error('shared_test_handoff_source_candidate_changed');
    await store.readBytes(work.patch_key,work.patch_sha);
    await store.readBytes(work.candidate_key,work.candidate_sha);
    const github=implementationGitHub(this.env,source);
    const linear=new LinearCapabilityAdapter(this.env.LINEAR_API_URL,
      this.env.LINEAR_APP_ACCESS_TOKEN);
    const [main,pull,oldCommit,newCommit,issue,issueContext,human]=await Promise.all([
      github.ref('main'),github.json<ImplementationPull>(`/pulls/${work.pr_number}`),
      github.commit(input.sourceHeadSha),github.commit(input.targetHeadSha),
      linear.readTestIssue(source.issue_id),linear.implementationContext(source.issue_id),
      linear.implementationUser(source.allowed_linear_user_id),
    ]);
    if(main!==input.targetBaseSha || input.targetBaseSha===input.sourceHeadSha ||
      oldCommit.parents.length!==1 || oldCommit.parents[0].sha!==work.tested_base_sha ||
      oldCommit.tree.sha!==work.tree_sha || newCommit.parents.length!==1 ||
      newCommit.parents[0].sha!==input.targetBaseSha ||
      newCommit.tree.sha!==input.targetTreeSha ||
      pull.number!==work.pr_number || pull.state!=='open' || pull.draft!==true ||
      pull.head.ref!==work.branch || pull.head.sha!==input.targetHeadSha ||
      pull.base.ref!=='main' || pull.base.repo.full_name!==source.route_repository ||
      await github.ref(work.branch)!==input.targetHeadSha ||
      issue.id!==source.issue_id || issue.teamId!==this.env.LINEAR_TEAM_ID ||
      issue.identifier!==work.linear_identifier ||
      (issueContext.project as {id?:string}|null)?.id!==source.project_id ||
      human.id!==source.allowed_linear_user_id || !human.active || human.isMe)
      throw new Error('shared_test_handoff_live_subject_changed');
    const comparison=await github.json<GitHubComparison>(
      `/compare/${input.targetBaseSha}...${input.targetHeadSha}`);
    const candidate=await store.read<ImplementationCandidate>(
      input.targetCandidateKey,input.targetCandidateSha);
    await store.readBytes(input.targetPatchKey,input.targetPatchSha);
    const paths=candidate.files.map(file=>file.path);
    if(comparison.status!=='ahead' || comparison.total_commits!==1 ||
      !comparison.files || comparison.files.length!==paths.length ||
      new Set(paths).size!==paths.length ||
      paths.some(path=>!comparison.files!.some(file=>file.filename===path)) ||
      candidate.version!==1 || candidate.kind!=='build' ||
      candidate.outcome!=='completed' || candidate.change!==work.change_id ||
      candidate.approvedDesignSha!==work.approved_design_sha ||
      candidate.testedBaseSha!==input.targetBaseSha ||
      candidate.treeSha!==input.targetTreeSha ||
      candidate.patchSha!==input.targetPatchSha ||
      candidate.proof.length!==0 || candidate.checks.length!==0 ||
      candidate.proofArchive?.length || candidate.evidenceChecklist)
      throw new Error('shared_test_handoff_candidate_mismatch');
    for(const path of paths)validateImplementationPath(path,work.change_id,'build');
    const [planning,design]=await Promise.all([
      new D1PlanningStore(db).findRunWorkProduct(source.run_id),
      new D1DesignStore(db).findWorkProduct(source.run_id),
    ]);
    if(!planning?.verified_merge_commit_sha ||
      planning.verified_merge_commit_sha!==planning.merge_commit_sha ||
      !planning.verification_manifest_json || !planning.verification_manifest_digest ||
      !design?.merge_commit_sha || design.merge_commit_sha!==work.approved_design_sha ||
      !design.merge_operation_id || !design.design_manifest_json ||
      !design.design_manifest_digest ||
      await sha256Hex(planning.verification_manifest_json)!==planning.verification_manifest_digest ||
      await sha256Hex(design.design_manifest_json)!==design.design_manifest_digest)
      throw new Error('shared_test_handoff_approvals_missing');
    const designGate=await db.prepare(`SELECT decision_delivery_id,approved_head_sha
      FROM human_gate_visits WHERE run_id=? AND gate_kind='design'
        AND state='merge_authorized' ORDER BY visit_sequence DESC LIMIT 1`)
      .bind(source.run_id).first<{decision_delivery_id:string;approved_head_sha:string}>();
    const inbox=designGate?.decision_delivery_id
      ? await new D1OrchestrationStore(db).findInboxEvent(designGate.decision_delivery_id)
      : null;
    const [planningPull,designPull]=await Promise.all([
      github.json<ImplementationPull>(`/pulls/${planning.pull_request_number}`),
      github.json<ImplementationPull>(`/pulls/${design.pull_request_number}`),
    ]);
    if(!designGate || inbox?.actor_id!==source.allowed_linear_user_id ||
      inbox.actor_type!=='user' ||
      !planningPull.merged ||
      planningPull.merge_commit_sha!==planning.verified_merge_commit_sha ||
      !designPull.merged || designPull.merge_commit_sha!==design.merge_commit_sha ||
      designPull.head.sha!==designGate.approved_head_sha)
      throw new Error('shared_test_handoff_approval_readback_changed');
    await github.reachable(design.merge_commit_sha,input.targetBaseSha);
    const approved=await store.read<ImplementationInput>(work.input_key,work.input_sha);
    if(approved.runId!==source.run_id || approved.branch!==work.branch ||
      approved.testedBaseSha!==design.merge_commit_sha ||
      approved.approvedDesignSha!==work.approved_design_sha ||
      JSON.stringify(approved.approvedFiles)!==work.approved_files_json)
      throw new Error('shared_test_handoff_approved_input_changed');
    await github.reachable(approved.testedBaseSha,work.tested_base_sha);
    for(const file of approved.approvedFiles) {
      if(await sha256Hex(file.content)!==file.sha256 ||
        await sha256Hex(await github.file(file.path,input.targetBaseSha))!==file.sha256)
        throw new Error(`shared_test_handoff_approved_file_changed:${file.path}`);
    }
    const latest=await db.prepare(`SELECT COALESCE(MAX(run_sequence),0) AS sequence
      FROM orchestration_runs WHERE project_id=? AND issue_id=?`)
      .bind(source.project_id,source.issue_id).first<{sequence:number}>();
    const sequence=source.run_sequence+1,targetRunId=runIdentity(source.correlation_id,sequence);
    const priorHandoff=await db.prepare(`SELECT source_run_id,target_run_id,plan_digest,
      state FROM shared_test_run_handoffs WHERE source_run_id=?`)
      .bind(source.run_id).first<HandoffRow>();
    if(latest?.sequence!==source.run_sequence &&
      !(latest?.sequence===sequence && priorHandoff?.target_run_id===targetRunId))
      throw new Error('shared_test_handoff_newer_run_exists');
    const plan:Plan={sourceRunId:source.run_id,targetRunId,
      sourceWorkflowInstanceId:source.workflow_instance_id,
      targetWorkflowInstanceId:await workflowInstanceIdentity(targetRunId),
      sourceDefinitionDigest:source.definition_digest,
      targetDefinitionDigest:this.definition.digest,
      sourceCandidateCommit:input.sourceHeadSha,targetCandidateCommit:input.targetHeadSha,
      sourcePatchSha256:work.patch_sha,targetPatchSha256:input.targetPatchSha,
      sourceCandidateSha256:work.candidate_sha,targetCandidateSha256:input.targetCandidateSha,
      targetBaseCommit:input.targetBaseSha,targetTreeSha:input.targetTreeSha,
      pullRequestNumber:work.pr_number,planningMergeCommit:planning.merge_commit_sha!,
      designMergeCommit:design.merge_commit_sha,issueId:source.issue_id,
      projectId:source.project_id,branch:work.branch,
      humanUserId:source.allowed_linear_user_id,
      humanBindingRevision:source.human_binding_revision,targetSequence:sequence,
      sourceErrorId:error.error_id,targetPatchKey:input.targetPatchKey,
      targetCandidateKey:input.targetCandidateKey};
    return {plan,source,work,approved};
  }

  async handle(request:Request):Promise<Response> {
    if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
    if(!this.env.STAGE_RETRY_SECRET ||
      request.headers.get('Authorization')!==`Bearer ${this.env.STAGE_RETRY_SECRET}`)
      return Response.json({error:'invalid_operator_capability'},{status:401});
    const input=parse(await request.json());
    const prior=await this.env.DB.prepare(`SELECT source_run_id,target_run_id,
      plan_digest,plan_json,state FROM shared_test_run_handoffs WHERE source_run_id=?`)
      .bind(input.sourceRunId).first<HandoffRow & {plan_json:string}>();
    if(input.execute && prior?.state==='dispatched') {
      const saved=JSON.parse(prior.plan_json) as Plan;
      if(input.planDigest!==prior.plan_digest ||
        saved.sourceCandidateCommit!==input.sourceHeadSha ||
        saved.targetCandidateCommit!==input.targetHeadSha ||
        saved.targetBaseCommit!==input.targetBaseSha ||
        saved.targetTreeSha!==input.targetTreeSha ||
        saved.targetPatchKey!==input.targetPatchKey ||
        saved.targetPatchSha256!==input.targetPatchSha ||
        saved.targetCandidateKey!==input.targetCandidateKey ||
        saved.targetCandidateSha256!==input.targetCandidateSha)
        throw new Error('shared_test_handoff_existing_subject_changed');
      const instance=await this.env.ORCHESTRATION_WORKFLOW.get(saved.targetWorkflowInstanceId);
      const status=(await instance.status()).status;
      return Response.json({state:'dispatched',sourceRunId:saved.sourceRunId,
        targetRunId:saved.targetRunId,workflowStatus:status,
        planDigest:prior.plan_digest});
    }
    const {plan,source,work,approved}=await this.plan(input);
    const encoded=JSON.stringify(plan),digest=await sha256Hex(encoded);
    if(!input.execute)return Response.json({ready:true,planDigest:digest,plan});
    if(input.planDigest!==digest)throw new Error('shared_test_handoff_plan_changed');
    const existing=await this.env.DB.prepare(`SELECT source_run_id,target_run_id,
      plan_digest,state FROM shared_test_run_handoffs WHERE source_run_id=?`)
      .bind(source.run_id).first<HandoffRow>();
    if(existing && (existing.plan_digest!==digest ||
      existing.target_run_id!==plan.targetRunId))
      throw new Error('shared_test_handoff_existing_subject_changed');
    if(!existing || existing.state==='prepared')
      await this.admit(plan,source,work,approved,encoded,digest);
    return this.dispatch(plan,digest);
  }

  private async admit(plan:Plan,source:OrchestrationRunRecord,
    work:ImplementationRun,approved:ImplementationInput,encoded:string,digest:string) {
    const db=this.env.DB,now=new Date().toISOString();
    const store=new ImplementationStore(db,this.env.ARTIFACTS);
    if(!this.definition.implementationPolicy)
      throw new Error('shared_test_handoff_policy_missing');
    const input=await store.put(plan.targetRunId,'checked-input.json',JSON.stringify({
      ...approved,runId:plan.targetRunId,testedBaseSha:plan.targetBaseCommit,
      policy:this.definition.implementationPolicy,
      receipts:{...approved.receipts,handoff:{sourceRunId:source.run_id,
        planningMergeCommit:plan.planningMergeCommit,designMergeCommit:plan.designMergeCommit}},
    } satisfies ImplementationInput));
    const sourceColumns=Object.keys(source as object);
    if(sourceColumns.some(name=>!/^[a-z][a-z0-9_]*$/.test(name)))
      throw new Error('shared_test_handoff_source_columns_invalid');
    const target:{[key:string]:unknown}={...source,run_id:plan.targetRunId,
      run_sequence:plan.targetSequence,definition_id:this.definition.name,
      definition_version:this.definition.version,definition_digest:this.definition.digest,
      workflow_instance_id:plan.targetWorkflowInstanceId,
      previous_node:null,current_node:'shared_test_decide',gate_origin_node:null,
      status:'pending_dispatch',accumulated_data_json:'{}',created_at:now,
      updated_at:now,terminal_at:null,terminal_cause:null,current_visit_sequence:1,
      last_transition_id:null,selection_kind:'default',
      selection_value:'guarded_handoff',selection_label_name:null,selection_reason:null,
      selection_evidence_json:JSON.stringify({kind:'guarded_handoff',sourceRunId:source.run_id,
        planDigest:digest}),selection_delivery_id:`handoff:${plan.targetRunId}`,
      selection_observed_at:now,selection_provider_digest:digest};
    const columns=sourceColumns.join(',');
    const placeholders=sourceColumns.map(()=>'?').join(',');
    const results=await db.batch([
      db.prepare(`INSERT OR IGNORE INTO shared_test_run_handoffs
        (source_run_id,target_run_id,source_workflow_instance_id,target_workflow_instance_id,
         source_definition_digest,target_definition_digest,source_candidate_commit,
         target_candidate_commit,source_patch_sha256,target_patch_sha256,
         source_candidate_sha256,target_candidate_sha256,target_base_commit,target_tree_sha,
         pull_request_number,planning_merge_commit,design_merge_commit,plan_digest,
         plan_json,state,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'prepared',?,?
        WHERE EXISTS(SELECT 1 FROM orchestration_runs WHERE run_id=? AND status='failed'
          AND terminal_cause='workflow_executor_timeout' AND workflow_instance_id=?
          AND definition_digest=?)
        AND NOT EXISTS(SELECT 1 FROM orchestration_runs WHERE project_id=? AND issue_id=?
          AND run_sequence>=?)`)
        .bind(plan.sourceRunId,plan.targetRunId,plan.sourceWorkflowInstanceId,
          plan.targetWorkflowInstanceId,plan.sourceDefinitionDigest,
          plan.targetDefinitionDigest,plan.sourceCandidateCommit,plan.targetCandidateCommit,
          plan.sourcePatchSha256,plan.targetPatchSha256,plan.sourceCandidateSha256,
          plan.targetCandidateSha256,plan.targetBaseCommit,plan.targetTreeSha,
          plan.pullRequestNumber,plan.planningMergeCommit,plan.designMergeCommit,digest,
          encoded,now,now,plan.sourceRunId,plan.sourceWorkflowInstanceId,
          plan.sourceDefinitionDigest,plan.projectId,plan.issueId,plan.targetSequence),
      db.prepare(`INSERT OR IGNORE INTO orchestration_runs (${columns})
        SELECT ${placeholders} WHERE EXISTS(SELECT 1 FROM shared_test_run_handoffs
          WHERE source_run_id=? AND target_run_id=? AND plan_digest=? AND state='prepared')
        AND NOT EXISTS(SELECT 1 FROM orchestration_runs WHERE project_id=? AND issue_id=?
          AND status IN ('pending_dispatch','active','awaiting_human',
            'awaiting_capability','manual_reconciliation_required'))`)
        .bind(...sourceColumns.map(name=>target[name]),plan.sourceRunId,
          plan.targetRunId,digest,plan.projectId,plan.issueId),
      db.prepare(`INSERT OR IGNORE INTO implementation_runs
        (run_id,linear_identifier,issue_run_sequence,change_id,approved_design_sha,
         tested_base_sha,branch,pr_branch,allowed_linear_user_id,human_binding_revision,
         input_key,input_sha,approved_files_json,requirements_json,status,tree_sha,
         candidate_key,candidate_sha,patch_key,patch_sha,patch_base_sha,
         source_attempt_id,pr_number,pr_url,pr_head_sha,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,'test_pending',?,?,?,?,?,?,NULL,?,?,?,?,?
        WHERE EXISTS(SELECT 1 FROM orchestration_runs WHERE run_id=?
          AND definition_digest=? AND current_node='shared_test_decide'
          AND status='pending_dispatch')`)
        .bind(plan.targetRunId,work.linear_identifier,plan.targetSequence,
          work.change_id,work.approved_design_sha,plan.targetBaseCommit,
          `deos/agent/${work.linear_identifier}/run-${plan.targetSequence}`,work.branch,
          work.allowed_linear_user_id,work.human_binding_revision,input.key,
          input.sha256,work.approved_files_json,work.requirements_json,
          plan.targetTreeSha,plan.targetCandidateKey,plan.targetCandidateSha256,
          plan.targetPatchKey,plan.targetPatchSha256,plan.targetBaseCommit,
          work.pr_number,work.pr_url,plan.targetCandidateCommit,now,now,
          plan.targetRunId,plan.targetDefinitionDigest),
      db.prepare(`UPDATE shared_test_run_handoffs SET state='admitted',updated_at=?
        WHERE source_run_id=? AND target_run_id=? AND plan_digest=? AND state='prepared'
        AND EXISTS(SELECT 1 FROM orchestration_runs WHERE run_id=?
          AND current_node='shared_test_decide' AND status='pending_dispatch')
        AND EXISTS(SELECT 1 FROM implementation_runs WHERE run_id=?
          AND pr_head_sha=? AND patch_sha=?)`)
        .bind(now,plan.sourceRunId,plan.targetRunId,digest,plan.targetRunId,
          plan.targetRunId,plan.targetCandidateCommit,plan.targetPatchSha256),
    ]);
    if(results[3]?.meta.changes!==1 ||
      results.slice(0,3).some(result=>result.meta.changes!==0 && result.meta.changes!==1))
      throw new Error('shared_test_handoff_admission_incomplete');
    const [savedHandoff,savedRun,savedWork]=await Promise.all([
      db.prepare(`SELECT state,plan_digest,target_run_id FROM shared_test_run_handoffs
        WHERE source_run_id=?`).bind(plan.sourceRunId).first<{
          state:string;plan_digest:string;target_run_id:string}>(),
      db.prepare(`SELECT status,definition_digest,workflow_instance_id,current_node
        FROM orchestration_runs WHERE run_id=?`).bind(plan.targetRunId).first<{
          status:string;definition_digest:string;workflow_instance_id:string;current_node:string}>(),
      db.prepare(`SELECT branch,pr_branch,pr_head_sha,patch_sha FROM implementation_runs
        WHERE run_id=?`).bind(plan.targetRunId).first<{
          branch:string;pr_branch:string;pr_head_sha:string;patch_sha:string}>(),
    ]);
    if(savedHandoff?.state!=='admitted' || savedHandoff.plan_digest!==digest ||
      savedHandoff.target_run_id!==plan.targetRunId ||
      savedRun?.status!=='pending_dispatch' ||
      savedRun.definition_digest!==plan.targetDefinitionDigest ||
      savedRun.workflow_instance_id!==plan.targetWorkflowInstanceId ||
      savedRun.current_node!=='shared_test_decide' ||
      savedWork?.pr_branch!==work.branch ||
      savedWork.branch!==`deos/agent/${work.linear_identifier}/run-${plan.targetSequence}` ||
      savedWork.pr_head_sha!==plan.targetCandidateCommit ||
      savedWork.patch_sha!==plan.targetPatchSha256)
      throw new Error('shared_test_handoff_admission_readback_changed');
  }

  private async dispatch(plan:Plan,digest:string):Promise<Response> {
    const db=this.env.DB,store=new D1OrchestrationStore(db);
    const target=await store.findRun(plan.targetRunId);
    if(!target || target.workflow_instance_id!==plan.targetWorkflowInstanceId ||
      target.definition_digest!==plan.targetDefinitionDigest)
      throw new Error('shared_test_handoff_target_changed');
    const deliveryId=`handoff:${plan.targetRunId}`;
    const intent=await store.createDispatchIntent(target,deliveryId,new Date().toISOString());
    if(intent.source_delivery_id!==deliveryId)
      throw new Error('shared_test_handoff_dispatch_identity_changed');
    if(intent.state!=='established') {
      if(target.current_node!=='shared_test_decide' || target.status!=='pending_dispatch')
        throw new Error('shared_test_handoff_target_changed');
      try {
        await this.env.ORCHESTRATION_WORKFLOW.createBatch([{id:plan.targetWorkflowInstanceId,
          params:{runId:plan.targetRunId,sourceDeliveryId:deliveryId}}]);
      } catch(error) {
        recordCaughtError(error,'shared_test_run_handoff.dispatch');
        try {
          const existing=await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId);
          await existing.status();
        } catch(readError) {
          throw new AggregateError([error,readError],
            'Shared test handoff dispatch and readback failed',{cause:error});
        }
      }
    }
    const instance=await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId);
    const status=(await instance.status()).status;
    if(!['queued','running','waiting','paused','complete','errored','terminated'].includes(status))
      throw new Error(`shared_test_handoff_target_status:${status}`);
    if(intent.state!=='established')
      await store.markDispatchAttempt(plan.targetRunId,'established',new Date().toISOString());
    const updated=await db.prepare(`UPDATE shared_test_run_handoffs
      SET state='dispatched',updated_at=? WHERE source_run_id=? AND target_run_id=?
      AND plan_digest=? AND state IN ('admitted','dispatched')`)
      .bind(new Date().toISOString(),plan.sourceRunId,plan.targetRunId,digest).run();
    if(updated.meta.changes!==1)throw new Error('shared_test_handoff_dispatch_save_failed');
    return Response.json({state:'dispatched',sourceRunId:plan.sourceRunId,
      targetRunId:plan.targetRunId,workflowStatus:status,planDigest:digest});
  }
}
