import { D1OrchestrationStore, type OrchestrationRunRecord } from './orchestration-store.ts';
import { restoreWorkflowDefinition, type LoadedWorkflowDefinition } from './workflow-definition.ts';
import { D1BoundedReviewStore } from './bounded-review-store.ts';
import { ClaudeReviewStore } from './claude-review-store.ts';
import { validateClaudeTurn, type ClaudeReceipt } from './claude-review.ts';
import { D1DesignStore, type DesignWorkProductRecord } from './design-store.ts';
import { D1DesignReviewStore } from './design-review-store.ts';
import { canonicalDesignReviewJson as canonical, validateDesignReviewInput,
  validateDesignReviewResult, type DesignReviewResult } from './design-review.ts';
import { unwrapGroundedReview, claimStrings } from '../container/grounded-review.mjs';
import { reduceReviewCycle, validateSources } from '../container/bounded-review.mjs';
import { implementationGitHub, type ImplementationPull } from './implementation-github.ts';
import { workflowInstanceIdentity } from './orchestration-identity.ts';
import { sha256Hex } from './implementation-hash.ts';
import { recordCaughtError } from './error-context.ts';

export interface IndependentReceiptInput {
  version: 1; runId: string; sourceAttemptId: string; failedAttemptId: string;
  workflowInstanceId: string; definitionDigest: string; visitSequence: number;
  headSha: string; requestedBy: string; execute?: boolean; planDigest?: string;
}
interface Attempt {
  attempt_id: string; run_id: string; node_id: string; visit_sequence: number;
  state: string; cleanup_state: string; job_spec_json: string; job_spec_digest: string;
  manifest_id: string; result_class: string;
}
interface Entry { logicalName: string; r2Key: string; mediaType: string; byteSize: number; sha256: string }
interface Plan {
  input: Omit<IndependentReceiptInput, 'execute' | 'planDigest'>;
  sourceJobSha256: string; failedJobSha256: string; sourceManifestId: string; failedManifestId: string;
  sourceErrorSha256: string; receiptKey: string; receiptSha256: string; providerInputSha256: string;
  inputSha256: string; inputR2Key: string; roundId: string; candidateId: string;
  candidateDigest: string; prDatabaseId: string; pullNumber: number; baseBranch: string;
  previousCycleSha256: string; previousCycleRevision: number; nextCycleSha256: string;
  retryId: string; waitId: string; reviewAttemptId: string; manifestId: string;
  aggregateDigest: string; manifestKey: string; manifestSha256: string; entries: Entry[];
  sourceDeliveryId: string; targetWorkflowInstanceId: string; toNode: string;
  model: string; reasoning: string; findingCount: number;
}
interface Audit {
  reconciliation_id: string; run_id: string; plan_digest: string; plan_json: string;
  state: 'prepared' | 'applied' | 'established';
}
interface Providers {
  pull(run: OrchestrationRunRecord, work: Pick<DesignWorkProductRecord, 'pull_request_number'>): Promise<ImplementationPull>;
  sync(run: OrchestrationRunRecord, definition: LoadedWorkflowDefinition, plan: Plan): Promise<void>;
}
const ORIGINAL_FAILURE = 'uncited_search_result: source must be cited by an existing claim';

/** Only the authenticated controller can make this transition; it is not a
 * journal event that an author or reviewer may supply. No retry counter changes. */
export function restoreIndependentReceipt(cycle: any, input: {
  head: string; sourceAttemptId: string; sourceManifestId: string; failedManifestId: string;
  reconciliationId: string; receiptSha256: string; result: DesignReviewResult; sourceEvidence: unknown;
}) {
  if (cycle.phase !== 'design' || cycle.status !== 'manual_reconciliation_required' ||
    cycle.currentHead !== input.head || cycle.independent.result || cycle.independent.invalidCount !== 2 ||
    cycle.response.result || cycle.response.invalidCount !== 0 || input.result.outcome !== 'concerns' ||
    canonical(cycle.independent.causes?.map((cause: any) => cause.manifestId)) !==
      canonical([input.sourceManifestId, input.failedManifestId]))
    throw new Error('independent_receipt_cycle_not_eligible');
  const next = reduceReviewCycle({ ...structuredClone(cycle), status: 'active' }, {
    type: 'independent_result', head: input.head, attemptId: input.sourceAttemptId,
    result: { findings: input.result.findings.map(f => ({ id: f.id, summary: f.message, location: JSON.stringify(f.sourceRanges) })),
      sourceEvidence: [input.sourceEvidence] },
  });
  next.independent.receiptReconciliation = { id: input.reconciliationId, receiptSha256: input.receiptSha256 };
  return next;
}

/** Recover a complete Claude concerns result rejected only by the old envelope
 * citation parser. This cannot create a model call, a pass, or a human decision. */
export class IndependentReviewReconciliationController {
  readonly env: Env;
  readonly providers: Providers;
  constructor(env: Env, providers?: Providers) {
    this.env = env;
    this.providers = providers ?? {
      pull: (run, work) => implementationGitHub(env, run).json<ImplementationPull>(`/pulls/${work.pull_request_number}`),
      sync: async (run, definition, plan) => {
        const { CloudflareWorkflowServices } = await import('./workflow-services.ts');
        const complete = await new CloudflareWorkflowServices(env, definition).syncDesignReviewProviders({
          run, reviewAttemptId: plan.reviewAttemptId, phase: 'independent', outcome: 'concerns',
          findingCount: plan.findingCount, headSha: plan.input.headSha,
          receiptReconciliationId: `independent-receipt:${plan.input.failedAttemptId}`,
        });
        if (!complete) throw new Error('reconciled_design_review_provider_proof_incomplete');
      },
    };
  }

  async handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    if (!this.env.STAGE_RETRY_SECRET || request.headers.get('Authorization') !== `Bearer ${this.env.STAGE_RETRY_SECRET}`)
      return Response.json({ error: 'invalid_operator_capability' }, { status: 401 });
    const input = await request.json() as IndependentReceiptInput;
    if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== 1 ||
      Object.keys(input).some(k => !['version','runId','sourceAttemptId','failedAttemptId','workflowInstanceId',
        'definitionDigest','visitSequence','headSha','requestedBy','execute','planDigest'].includes(k)) ||
      !['runId','sourceAttemptId','failedAttemptId','workflowInstanceId','requestedBy'].every(k =>
        typeof input[k as keyof IndependentReceiptInput] === 'string' && /^[A-Za-z0-9:._@-]{1,512}$/.test(String(input[k as keyof IndependentReceiptInput]))) ||
      !/^[a-f0-9]{64}$/.test(input.definitionDigest) || !/^[a-f0-9]{40}$/.test(input.headSha) ||
      !Number.isSafeInteger(input.visitSequence) || input.visitSequence < 4 || input.sourceAttemptId === input.failedAttemptId ||
      (input.execute !== undefined && typeof input.execute !== 'boolean')) throw new Error('invalid_independent_receipt_request');
    const { execute, planDigest, ...identity } = input;
    const id = `independent-receipt:${input.failedAttemptId}`;
    const existing = await this.audit(id);
    if (existing) {
      const saved = JSON.parse(existing.plan_json) as Plan;
      if (await sha256Hex(existing.plan_json) !== existing.plan_digest || canonical(saved.input) !== canonical(identity))
        throw new Error('independent_receipt_audit_identity_mismatch');
      if (execute && planDigest !== existing.plan_digest) throw new Error('independent_receipt_plan_mismatch');
      if (existing.state !== 'prepared') return execute ? this.establish(existing, saved)
        : Response.json({ state: existing.state, planDigest: existing.plan_digest, plan: saved });
    }
    const checked = await this.preflight(identity, id);
    const encoded = canonical(checked.plan), digest = await sha256Hex(encoded);
    if (existing && digest !== existing.plan_digest) throw new Error('independent_receipt_plan_changed');
    if (!execute) return Response.json({ ready: true, planDigest: digest, plan: checked.plan });
    if (planDigest !== digest) throw new Error('independent_receipt_plan_mismatch');
    for (const [key, content] of checked.objects) {
      await this.env.ARTIFACTS.put(key, content, { onlyIf: { etagDoesNotMatch: '*' } });
      const stored = await this.env.ARTIFACTS.get(key);
      if (!stored || await sha256Hex(await stored.text()) !== await sha256Hex(content))
        throw new Error('independent_receipt_object_write_mismatch');
    }
    const now = new Date().toISOString();
    await this.env.DB.prepare(`INSERT OR IGNORE INTO independent_review_receipt_reconciliations
      (reconciliation_id,run_id,source_attempt_id,failed_attempt_id,plan_digest,plan_json,state,
       target_workflow_instance_id,created_at,updated_at) VALUES (?,?,?,?,?,?,'prepared',?,?,?)`)
      .bind(id,input.runId,input.sourceAttemptId,input.failedAttemptId,digest,encoded,checked.plan.targetWorkflowInstanceId,now,now).run();
    const prepared = await this.audit(id);
    if (prepared?.plan_digest !== digest || prepared.plan_json !== encoded) throw new Error('independent_receipt_preparation_conflict');
    if (prepared.state !== 'prepared') return this.establish(prepared, checked.plan);
    const source = await this.env.ORCHESTRATION_WORKFLOW.get(input.workflowInstanceId);
    const status = (await source.status()).status;
    if (status !== 'paused') {
      if (!['waiting','running'].includes(status)) throw new Error(`independent_receipt_source_status:${status}`);
      await source.pause();
      if ((await source.status()).status !== 'paused') throw new Error('independent_receipt_source_not_paused');
    }
    try {
      // Recheck the live head after pausing, before committing any acceptance.
      this.checkPull(await this.providers.pull(checked.run, { pull_request_number: checked.plan.pullNumber }), checked.plan);
      await this.apply(id, digest, checked);
    } catch (error) {
      try {
        const after = await new D1OrchestrationStore(this.env.DB).findRun(input.runId);
        if (after?.workflow_instance_id === input.workflowInstanceId) await source.resume();
      } catch (secondary) { throw new AggregateError([error, secondary], 'Receipt recovery and source resume failed', { cause: error }); }
      throw error;
    }
    return this.establish((await this.audit(id))!, checked.plan);
  }

  private audit(id: string) {
    return this.env.DB.prepare('SELECT * FROM independent_review_receipt_reconciliations WHERE reconciliation_id=?').bind(id).first<Audit>();
  }
  private checkPull(pull: ImplementationPull, plan: Pick<Plan, 'input'|'prDatabaseId'|'pullNumber'|'baseBranch'>) {
    if (pull.state !== 'open' || pull.merged || String(pull.id) !== plan.prDatabaseId || pull.number !== plan.pullNumber ||
      pull.head.sha !== plan.input.headSha || pull.base.ref !== plan.baseBranch) throw new Error('independent_receipt_github_subject_changed');
  }

  private async preflight(input: Plan['input'], id: string) {
    const db = this.env.DB, store = new D1OrchestrationStore(db), reviews = new D1BoundedReviewStore(db, this.env.ARTIFACTS);
    const run = await store.findRun(input.runId);
    if (!run || run.status !== 'manual_reconciliation_required' || run.current_node !== 'review_reconciliation' ||
      run.current_visit_sequence !== input.visitSequence || run.workflow_instance_id !== input.workflowInstanceId ||
      run.definition_digest !== input.definitionDigest) throw new Error('independent_receipt_run_changed');
    const source = await db.prepare('SELECT * FROM agent_attempts WHERE attempt_id=? AND run_id=?')
      .bind(input.sourceAttemptId,input.runId).first<Attempt>();
    const failed = await db.prepare('SELECT * FROM agent_attempts WHERE attempt_id=? AND run_id=?')
      .bind(input.failedAttemptId,input.runId).first<Attempt>();
    if (!source || !failed || [source,failed].some(a => a.node_id !== 'design_independent_review' || a.state !== 'failed' ||
      a.cleanup_state !== 'destroyed' || !a.manifest_id || a.result_class !== 'codex_exit_nonzero') ||
      failed.visit_sequence !== input.visitSequence-1 || source.visit_sequence !== failed.visit_sequence-2)
      throw new Error('independent_receipt_attempt_not_eligible');
    const retry = await db.prepare(`SELECT retry_id FROM agent_stage_retries WHERE run_id=? AND failed_attempt_id=?
      AND retry_node=? AND from_visit_sequence=? AND to_visit_sequence=? AND state='established'`)
      .bind(input.runId,source.attempt_id,source.node_id,source.visit_sequence+1,failed.visit_sequence).first<{ retry_id: string }>();
    const wait = await db.prepare(`SELECT wait_id FROM workflow_waits WHERE run_id=? AND node_id='review_reconciliation'
      AND visit_sequence=? AND status='awaiting'`).bind(input.runId,input.visitSequence).first<{ wait_id: string }>();
    const busy = await db.prepare(`SELECT 1 FROM agent_attempts WHERE run_id=? AND
      (state IN ('pending','starting','running','collecting') OR visit_sequence>?)
      UNION ALL SELECT 1 FROM human_gate_visits WHERE run_id=? AND state='open'
      UNION ALL SELECT 1 FROM review_transcript_owners WHERE owner_kind='independent_review_attempt' AND owner_id=? LIMIT 1`)
      .bind(input.runId,failed.visit_sequence,input.runId,source.attempt_id).first();
    if (!retry || !wait || busy) throw new Error('independent_receipt_recovery_boundary_changed');
    const jobs = await Promise.all([source,failed].map(async a => {
      if (await sha256Hex(a.job_spec_json) !== a.job_spec_digest) throw new Error('independent_receipt_job_corrupt');
      const j = JSON.parse(a.job_spec_json);
      if (j.attemptId !== a.attempt_id || j.runId !== input.runId || j.nodeId !== a.node_id || j.visitSequence !== a.visit_sequence ||
        j.modelProvider !== 'claude' || j.agentRole !== 'reviewer' || j.reviewKind !== 'design' ||
        j.boundedReview !== 'deos-bounded-review-v1') throw new Error('independent_receipt_job_identity_mismatch');
      return j;
    }));
    const saved = JSON.parse(jobs[0].materializedContext).designReview;
    if (canonical(saved) !== canonical(JSON.parse(jobs[1].materializedContext).designReview))
      throw new Error('independent_receipt_review_subject_changed');
    const validated = await validateDesignReviewInput(saved.input);
    if (validated.inputSha256 !== saved.inputSha256 || saved.phase !== 'independent' || validated.input.phase !== 'independent' ||
      validated.input.runId !== input.runId || validated.input.headSha !== input.headSha ||
      jobs.some(j => j.model !== validated.input.model || j.reasoning !== validated.input.reasoning || j.modelProvider !== validated.input.modelProvider))
      throw new Error('independent_receipt_input_identity_mismatch');
    const storedInput = await this.env.ARTIFACTS.get(saved.inputR2Key);
    if (!storedInput || await sha256Hex(await storedInput.text()) !== saved.inputSha256) throw new Error('independent_receipt_input_corrupt');
    if (!Array.isArray(saved.sources) || saved.sources.length !== validated.input.sources.length) throw new Error('independent_receipt_sources_missing');
    for (const file of validated.input.sources) {
      const content = saved.sources.find((s: any) => s.path === file.path)?.content;
      if (typeof content !== 'string' || await sha256Hex(content) !== file.sha256) throw new Error('independent_receipt_source_corrupt');
    }
    const originalErrors = await reviews.artifact(source.manifest_id, 'original-errors.jsonl');
    const errors = originalErrors.split('\n').filter(Boolean).map(line => JSON.parse(line));
    if (errors[0]?.location !== 'runner fatal' || errors[0]?.message !== ORIGINAL_FAILURE)
      throw new Error('independent_receipt_wrong_original_failure');
    await reviews.verifyCapabilities(source.attempt_id, source.manifest_id);
    const provider = new ClaudeReviewStore(db,this.env.ARTIFACTS), invocation = await provider.invocation(source.attempt_id);
    const turns = await db.prepare('SELECT * FROM claude_review_turns WHERE attempt_id=? ORDER BY ordinal').bind(source.attempt_id).all<any>();
    const failedInvocation = await provider.invocation(failed.attempt_id);
    const failedTurns = await db.prepare('SELECT * FROM claude_review_turns WHERE attempt_id=? ORDER BY ordinal').bind(failed.attempt_id).all<any>();
    if (!invocation || invocation.cleanup_state !== 'destroyed' || invocation.job_digest !== source.job_spec_digest ||
      invocation.account_binding !== run.independent_review_account_binding ||
      !failedInvocation || failedInvocation.cleanup_state !== 'destroyed' || failedInvocation.job_digest !== failed.job_spec_digest ||
      failedTurns.results.length !== 1 || failedTurns.results[0].ordinal !== 0 || failedTurns.results[0].receipt_key !== null ||
      turns.results.length !== 1 || turns.results[0].ordinal !== 0 || !turns.results[0].receipt_key ||
      turns.results[0].receipt_key !== `protected/claude-reviews/${await sha256Hex(source.attempt_id)}/0.json`)
      throw new Error('independent_receipt_provider_identity_mismatch');
    const turn = turns.results[0], receipt = await provider.receipt(turn) as ClaudeReceipt & {
      transcript: { text: string; sha256: string; eventCount: number }; grounding: { capabilityDigest: string };
    } | null;
    if (!receipt || receipt.attemptId !== source.attempt_id || receipt.turn !== 0 || receipt.inputSha256 !== turn.input_sha256 ||
      receipt.accountBinding !== invocation.account_binding || receipt.secretVersion !== invocation.secret_version ||
      receipt.grounding?.capabilityDigest !== await sha256Hex(JSON.stringify(jobs[0].grounding)) ||
      typeof receipt.transcript?.text !== 'string' || await sha256Hex(receipt.transcript.text) !== receipt.transcript.sha256)
      throw new Error('independent_receipt_provider_proof_mismatch');
    const events = receipt.transcript.text.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    if (events.length !== receipt.transcript.eventCount ||
      await reviews.artifact(source.manifest_id,'transcript.jsonl') !== receipt.transcript.text)
      throw new Error('independent_receipt_transcript_mismatch');
    const revalidated = validateClaudeTurn({ events, appliedEfforts: receipt.appliedEfforts, attemptId: source.attempt_id,
      turn: 0, inputSha256: turn.input_sha256, sessionId: receipt.sessionId,
      enrollment: { accountBinding: invocation.account_binding, secretVersion: invocation.secret_version } });
    for (const [key,value] of Object.entries(revalidated)) if (canonical(value) !== canonical(receipt[key as keyof ClaudeReceipt]))
      throw new Error(`independent_receipt_provider_field_mismatch:${key}`);
    // Prove this is precisely the old envelope-pointer rejection before using
    // the repaired parser. Any different validation failure still propagates.
    let legacyRejected = false;
    try { validateSources(receipt.result, claimStrings(receipt.result.review)); }
    catch (error) { if (!(error instanceof Error) || error.message !== ORIGINAL_FAILURE) throw error; legacyRejected = true; }
    if (!legacyRejected) throw new Error('independent_receipt_not_envelope_rejection');
    const envelope = unwrapGroundedReview(receipt.result);
    const result = validateDesignReviewResult(envelope.review, { inputSha256: saved.inputSha256, phase: 'independent',
      sourcePaths: new Set(validated.input.sources.map(s => s.path)) });
    if (result.outcome !== 'concerns') throw new Error('independent_receipt_requires_author_response');
    for (const finding of result.findings) for (const range of finding.sourceRanges)
      if (range.endLine > saved.sources.find((s: any) => s.path === range.path).content.split('\n').length)
        throw new Error('independent_receipt_finding_out_of_bounds');
    const design = new D1DesignStore(db), work = await design.findWorkProduct(input.runId);
    const candidate = await db.prepare('SELECT * FROM design_candidates WHERE candidate_id=? AND run_id=?')
      .bind(validated.input.candidateId,input.runId).first<any>();
    const round = await new D1DesignReviewStore(db).findRound(input.runId,validated.input.round);
    if (!work || work.repository !== run.route_repository || work.head_sha !== input.headSha || work.merge_commit_sha ||
      work.pull_request_database_id !== validated.input.pullRequestDatabaseId || !work.pull_request_number ||
      !candidate || candidate.state !== 'validated' || candidate.candidate_digest !== validated.input.candidateSha256 ||
      candidate.base_commit !== validated.input.baseCommit || !round || round.status !== 'active' || round.response_turns !== 0 ||
      round.outside_provider !== 'claude' || round.outside_model !== jobs[0].model || round.outside_reasoning !== jobs[0].reasoning ||
      await new D1DesignReviewStore(db).findAcceptedInput(saved.inputSha256)) throw new Error('independent_receipt_design_changed');
    const row = await reviews.read(input.runId,'design');
    if (!row) throw new Error('independent_receipt_cycle_missing');
    const cycle = restoreIndependentReceipt(JSON.parse(row.state_json), { head: input.headSha,
      sourceAttemptId: source.attempt_id, sourceManifestId: source.manifest_id, failedManifestId: failed.manifest_id,
      reconciliationId: id, receiptSha256: turn.receipt_sha256, result, sourceEvidence: envelope });
    const snapshot = await store.findDefinitionSnapshot(run.definition_id,run.definition_version);
    if (!snapshot) throw new Error('independent_receipt_definition_missing');
    const definition = await restoreWorkflowDefinition(snapshot.canonical_json,input.definitionDigest);
    const node = definition.nodes[source.node_id];
    if (node?.type !== 'agent' || node.edges.concerns !== 'design_independent_response' ||
      definition.nodes.design_independent_response?.type !== 'agent') throw new Error('independent_receipt_frozen_edge_mismatch');
    const dispatch = await db.prepare('SELECT source_delivery_id FROM dispatch_intents WHERE run_id=? AND workflow_instance_id=?')
      .bind(input.runId,input.workflowInstanceId).first<{ source_delivery_id: string }>();
    if (!dispatch) throw new Error('independent_receipt_dispatch_missing');
    const manifestId = `manifest:${id}`, prefix = `independent-review-reconciliations/${await sha256Hex(id)}`;
    const files = { 'normalized-review.json': canonical(result), 'review-sources.json': JSON.stringify([{ index: 0, ...envelope }]),
      'transcript.jsonl': receipt.transcript.text,
      'agent-input-manifest.json': await reviews.artifact(source.manifest_id,'agent-input-manifest.json') };
    const entries = await Promise.all(Object.entries(files).map(async ([logicalName, content]) => ({ logicalName,
      r2Key: `${prefix}/${logicalName}`, mediaType: logicalName.endsWith('.jsonl') ? 'application/x-ndjson' : 'application/json',
      byteSize: new TextEncoder().encode(content).length, sha256: await sha256Hex(content) })));
    const aggregateDigest = await sha256Hex(JSON.stringify(entries));
    const manifestKey = `${prefix}/manifest.json`, manifest = JSON.stringify({ version: 1, manifestId, runId: input.runId,
      attemptId: source.attempt_id, aggregateDigest, entries });
    const plan: Plan = { input, sourceJobSha256: source.job_spec_digest, failedJobSha256: failed.job_spec_digest,
      sourceManifestId: source.manifest_id, failedManifestId: failed.manifest_id, sourceErrorSha256: await sha256Hex(originalErrors),
      receiptKey: turn.receipt_key, receiptSha256: turn.receipt_sha256, providerInputSha256: turn.input_sha256,
      inputSha256: saved.inputSha256, inputR2Key: saved.inputR2Key, roundId: round.round_id,
      candidateId: validated.input.candidateId, candidateDigest: validated.input.candidateSha256,
      prDatabaseId: work.pull_request_database_id!, pullNumber: work.pull_request_number, baseBranch: work.base_branch,
      previousCycleSha256: row.state_sha256, previousCycleRevision: row.revision, nextCycleSha256: await sha256Hex(JSON.stringify(cycle)),
      retryId: retry.retry_id, waitId: wait.wait_id, reviewAttemptId: `design-review:${id}`, manifestId,
      aggregateDigest, manifestKey, manifestSha256: await sha256Hex(manifest), entries,
      sourceDeliveryId: dispatch.source_delivery_id, targetWorkflowInstanceId: await workflowInstanceIdentity(`${input.runId}:${id}`),
      toNode: node.edges.concerns, model: jobs[0].model, reasoning: jobs[0].reasoning, findingCount: result.findings.length };
    this.checkPull(await this.providers.pull(run,work),plan);
    return { plan, run, result, cycle, eventCount: events.length,
      objects: [...entries.map(e => [e.r2Key, files[e.logicalName as keyof typeof files]] as const), [manifestKey, manifest] as const] };
  }

  private async apply(id: string, digest: string, checked: Awaited<ReturnType<IndependentReviewReconciliationController['preflight']>>) {
    const { plan: p, result, cycle } = checked, db = this.env.DB, i = p.input;
    const now = new Date().toISOString(), transitionId = `transition:${id}`;
    const guard = `EXISTS(SELECT 1 FROM orchestration_runs WHERE run_id=? AND last_transition_id=? AND workflow_instance_id=?)`;
    const bindGuard = [i.runId,transitionId,p.targetWorkflowInstanceId];
    const statements = [db.prepare(`UPDATE orchestration_runs SET workflow_instance_id=?,previous_node=current_node,
      current_node=?,current_visit_sequence=current_visit_sequence+1,last_transition_id=?,status='active',
      gate_origin_node=NULL,terminal_at=NULL,terminal_cause=NULL,updated_at=?
      WHERE run_id=? AND workflow_instance_id=? AND definition_digest=? AND current_visit_sequence=?
        AND current_node='review_reconciliation' AND status='manual_reconciliation_required'
        AND EXISTS(SELECT 1 FROM independent_review_receipt_reconciliations WHERE reconciliation_id=? AND plan_digest=? AND state='prepared')
        AND EXISTS(SELECT 1 FROM phase_review_cycles WHERE run_id=? AND phase='design' AND revision=? AND state_sha256=?)
        AND EXISTS(SELECT 1 FROM workflow_waits WHERE wait_id=? AND status='awaiting')
        AND EXISTS(SELECT 1 FROM dispatch_intents WHERE run_id=? AND workflow_instance_id=?)
        AND EXISTS(SELECT 1 FROM design_review_rounds WHERE round_id=? AND status='active' AND response_turns=0)
        AND EXISTS(SELECT 1 FROM claude_review_turns WHERE attempt_id=? AND ordinal=0 AND receipt_key=? AND receipt_sha256=?)
        AND EXISTS(SELECT 1 FROM claude_review_turns WHERE attempt_id=? AND ordinal=0 AND receipt_key IS NULL)
        AND EXISTS(SELECT 1 FROM design_work_products WHERE run_id=? AND head_sha=? AND merge_commit_sha IS NULL)
        AND EXISTS(SELECT 1 FROM design_candidates WHERE candidate_id=? AND candidate_digest=? AND state='validated')
        AND EXISTS(SELECT 1 FROM agent_attempts WHERE attempt_id=? AND state='failed' AND cleanup_state='destroyed' AND job_spec_digest=? AND manifest_id=?)
        AND EXISTS(SELECT 1 FROM agent_attempts WHERE attempt_id=? AND state='failed' AND cleanup_state='destroyed' AND job_spec_digest=? AND manifest_id=?)
        AND NOT EXISTS(SELECT 1 FROM agent_attempts WHERE run_id=? AND (state IN ('pending','starting','running','collecting') OR visit_sequence>?))
        AND NOT EXISTS(SELECT 1 FROM human_gate_visits WHERE run_id=? AND state='open')
        AND NOT EXISTS(SELECT 1 FROM design_review_attempts WHERE input_sha256=? AND accepted=1)
        AND NOT EXISTS(SELECT 1 FROM review_transcript_owners WHERE owner_kind='independent_review_attempt' AND owner_id=?)`)
      .bind(p.targetWorkflowInstanceId,p.toNode,transitionId,now,i.runId,i.workflowInstanceId,i.definitionDigest,i.visitSequence,
        id,digest,i.runId,p.previousCycleRevision,p.previousCycleSha256,p.waitId,
        i.runId,i.workflowInstanceId,p.roundId,i.sourceAttemptId,p.receiptKey,p.receiptSha256,i.failedAttemptId,
        i.runId,i.headSha,p.candidateId,p.candidateDigest,
        i.sourceAttemptId,p.sourceJobSha256,p.sourceManifestId,i.failedAttemptId,p.failedJobSha256,p.failedManifestId,
        i.runId,i.visitSequence-1,i.runId,p.inputSha256,i.sourceAttemptId),
      db.prepare(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,aggregate_digest,object_count,total_bytes,created_at,completed_at)
        SELECT ?,?,?,?,'complete',?,?,?,?,? WHERE ${guard}`)
        .bind(p.manifestId,i.runId,i.sourceAttemptId,p.manifestKey,p.aggregateDigest,p.entries.length,
          p.entries.reduce((n,e)=>n+e.byteSize,0),now,now,...bindGuard),
      ...p.entries.map(e => db.prepare(`INSERT INTO artifacts (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,policy_outcome)
        SELECT ?,?,?,?,?,?,?,'accepted' WHERE ${guard}`).bind(p.manifestId,e.logicalName,e.r2Key,e.mediaType,e.byteSize,e.sha256,now,...bindGuard)),
    ];
    const normalized = p.entries.find(e => e.logicalName === 'normalized-review.json')!, transcript = p.entries.find(e => e.logicalName === 'transcript.jsonl')!;
    statements.push(db.prepare(`INSERT INTO design_review_attempts
      (review_attempt_id,round_id,agent_attempt_id,phase,input_sha256,input_r2_key,input_object_sha256,candidate_id,
       pr_database_id,head_sha,model_provider,model,reasoning,outcome,evidence_manifest_id,evidence_r2_key,evidence_sha256,accepted,created_at,completed_at)
      SELECT ?,?,?,'independent',?,?,?,?,?,?,'claude',?,?,'concerns',?,?,?,1,?,? WHERE ${guard}`)
      .bind(p.reviewAttemptId,p.roundId,i.sourceAttemptId,p.inputSha256,p.inputR2Key,p.inputSha256,p.candidateId,p.prDatabaseId,i.headSha,
        p.model,p.reasoning,p.manifestId,normalized.r2Key,normalized.sha256,now,now,...bindGuard),
      ...result.findings.map(f => db.prepare(`INSERT INTO design_review_findings
        (review_attempt_id,finding_id,severity,category,message,source_ranges_json,created_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`)
        .bind(p.reviewAttemptId,f.id,f.severity,f.category,f.message,JSON.stringify(f.sourceRanges),now,...bindGuard)),
      db.prepare(`INSERT INTO review_transcript_owners
        (owner_kind,owner_id,attempt_id,manifest_id,logical_name,sha256,byte_size,event_count,format_version)
        SELECT 'independent_review_attempt',?,?,?,'transcript.jsonl',?,?,?,'deos-transcript-v1' WHERE ${guard}`)
        .bind(i.sourceAttemptId,i.sourceAttemptId,p.manifestId,transcript.sha256,transcript.byteSize,checked.eventCount,...bindGuard),
      db.prepare(`UPDATE phase_review_cycles SET state_json=?,state_sha256=?,revision=revision+1
        WHERE run_id=? AND phase='design' AND revision=? AND state_sha256=? AND ${guard}`)
        .bind(JSON.stringify(cycle),p.nextCycleSha256,i.runId,p.previousCycleRevision,p.previousCycleSha256,...bindGuard),
      db.prepare(`UPDATE workflow_waits SET status='consumed',consumed_at=? WHERE wait_id=? AND status='awaiting' AND ${guard}`)
        .bind(now,p.waitId,...bindGuard),
      db.prepare(`UPDATE dispatch_intents SET workflow_instance_id=?,updated_at=? WHERE run_id=? AND workflow_instance_id=? AND ${guard}`)
        .bind(p.targetWorkflowInstanceId,now,i.runId,i.workflowInstanceId,...bindGuard),
      db.prepare(`INSERT INTO workflow_transitions_v2 (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,
        cause_type,cause_reference,actor_id,actor_type,provider_operation_id,occurred_at)
        SELECT ?,?,'review_reconciliation',?,?,?,'operator_reconciliation',?,?,'operator',NULL,? WHERE ${guard}`)
        .bind(transitionId,i.runId,p.toNode,i.visitSequence,i.visitSequence+1,id,i.requestedBy,now,...bindGuard),
      db.prepare(`UPDATE independent_review_receipt_reconciliations SET state='applied',updated_at=?
        WHERE reconciliation_id=? AND state='prepared' AND plan_digest=? AND ${guard}`).bind(now,id,digest,...bindGuard));
    const results = await db.batch(statements);
    if (results.some(r => r.meta.changes !== 1)) throw new Error('independent_receipt_compare_and_set_failed');
  }

  private async establish(audit: Audit, plan: Plan): Promise<Response> {
    const store = new D1OrchestrationStore(this.env.DB), run = await store.findRun(plan.input.runId);
    if (!run || run.workflow_instance_id !== plan.targetWorkflowInstanceId || run.definition_digest !== plan.input.definitionDigest)
      throw new Error('independent_receipt_replacement_changed');
    if (audit.state !== 'established') {
      const snapshot = await store.findDefinitionSnapshot(run.definition_id,run.definition_version);
      if (!snapshot) throw new Error('independent_receipt_definition_missing');
      // Normal publication of the review's provider check/link precedes author dispatch.
      await this.providers.sync(run,await restoreWorkflowDefinition(snapshot.canonical_json,run.definition_digest),plan);
      const source = await this.env.ORCHESTRATION_WORKFLOW.get(plan.input.workflowInstanceId);
      if ((await source.status()).status !== 'terminated') await source.terminate();
      if ((await source.status()).status !== 'terminated') throw new Error('independent_receipt_source_not_terminated');
      try { await this.env.ORCHESTRATION_WORKFLOW.createBatch([{ id: plan.targetWorkflowInstanceId,
        params: { runId: run.run_id, sourceDeliveryId: plan.sourceDeliveryId } }]); }
      catch (error) {
        recordCaughtError(error,'independent_receipt.create_replacement');
        try { await (await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId)).status(); }
        catch (readError) { throw new AggregateError([error,readError],'Receipt recovery replacement could not be read',{ cause: error }); }
      }
      const status = (await (await this.env.ORCHESTRATION_WORKFLOW.get(plan.targetWorkflowInstanceId)).status()).status;
      if (!['queued','running','waiting','paused'].includes(status)) throw new Error(`independent_receipt_target_status:${status}`);
      await this.env.DB.prepare(`UPDATE independent_review_receipt_reconciliations SET state='established',updated_at=?
        WHERE reconciliation_id=? AND state='applied' AND plan_digest=?`).bind(new Date().toISOString(),audit.reconciliation_id,audit.plan_digest).run();
    }
    return Response.json({ state: 'established', reconciliationId: audit.reconciliation_id, planDigest: audit.plan_digest, plan });
  }
}
