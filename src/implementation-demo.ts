import { ImplementationError, subjectMatches } from './implementation-contract.ts';
import { ImplementationStore, type ImplementationInput, type ImplementationRun } from './implementation-store.ts';
import { sha256Hex } from './implementation-hash.ts';
import { demoRequirements, validateDemoPlan, validateDemoResult,
  type DemoContext, type DemoCorrection, type DemoCorrectionRequest, type DemoEvidence, type DemoKind, type DemoPlan, type DemoResult, type DemoSource } from './implementation-demo-contract.ts';
import type { AgentAttemptRecord } from './sandbox-controller.ts';
import type { ArtifactCollectionResult } from './artifact-collector.ts';
import type { OrchestrationRunRecord } from './orchestration-store.ts';
import type { MaterializedJobInput } from './job-inputs.ts';
import type { WorkflowJob } from './workflow-definition.ts';
import { ImplementationHostedPreview } from './implementation-hosted-preview.ts';

export interface DemoReviewRow {
  attempt_id: string; run_id: string; visit_sequence: number; kind: DemoKind;
  input_sha: string; plan_sha: string | null; candidate_sha: string | null;
  tested_base_sha: string; tree_sha: string; outcome: string; summary: string;
  payload_key: string; payload_sha: string; created_at: string;
}
export const isDemoJob = (job: Pick<WorkflowJob, 'reviewKind'>) =>
  job.reviewKind === 'demo_plan' || job.reviewKind === 'demo_gate';

export class ImplementationDemoService {
  readonly store: ImplementationStore;
  readonly db: D1Database;
  readonly bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) {
    this.db = db;
    this.bucket = bucket;
    this.store = new ImplementationStore(db, bucket);
  }
  latest(runId: string, kind: DemoKind): Promise<DemoReviewRow | null> {
    return this.db.prepare('SELECT * FROM implementation_demo_reviews WHERE run_id=? AND kind=? ORDER BY visit_sequence DESC LIMIT 1')
      .bind(runId, kind).first<DemoReviewRow>();
  }
  async read<T extends DemoPlan | DemoResult>(row: DemoReviewRow): Promise<T> {
    return this.store.read<T>(row.payload_key, row.payload_sha);
  }
  async buildInput(runId: string) {
    const planRow = await this.latest(runId, 'plan');
    if (!planRow || planRow.outcome !== 'ready') throw new ImplementationError('demo_plan_missing', 'A ready independent demo plan is required before implementation');
    const gateRow = await this.latest(runId, 'gate');
    return { plan: { sha256: planRow.payload_sha, value: await this.read<DemoPlan>(planRow) },
      feedback: gateRow ? await this.read<DemoResult>(gateRow) : null };
  }
  async materialize(run: OrchestrationRunRecord, job: WorkflowJob, base: MaterializedJobInput): Promise<MaterializedJobInput> {
    const work = await this.store.requireRun(run.run_id);
    const input = await this.store.read<ImplementationInput>(work.input_key, work.input_sha);
    const kind: DemoKind = job.reviewKind === 'demo_plan' ? 'plan' : 'gate';
    const priorRow = await this.latest(run.run_id, 'plan');
    const gateRow = await this.latest(run.run_id, 'gate');
    const priorPlan = priorRow ? await this.read<DemoPlan>(priorRow) : null;
    const sources: DemoSource[] = input.approvedFiles.map(source => ({ ...source, path: `approved/${source.path}` }));
    const evidence: DemoEvidence[] = [];
    const candidate = kind === 'gate' ? await this.store.candidate(work) : null;
    const subject = { change: work.change_id, approvedDesignSha: work.approved_design_sha,
      testedBaseSha: work.tested_base_sha, treeSha: candidate?.treeSha ?? work.tree_sha ?? work.tested_base_sha };
    const addSource = async (path: string, content: string) => { sources.push({ path, content, sha256: await sha256Hex(content) }); };
    const build = JSON.parse(base.context);
    const hostedPreview = await new ImplementationHostedPreview({DB:this.db, ARTIFACTS:this.bucket}).latest(work);
    if (hostedPreview) await addSource('context/hosted-preview.json', JSON.stringify(hostedPreview, null, 2));
    await addSource('context/issue-and-feedback.json', JSON.stringify({ issue: build.issue,
      feedback: build.implementationReviewFeedback, question: build.question, reply: build.reply }, null, 2));
    await addSource('context/runtime-capabilities.json', JSON.stringify({
      execution: 'Local workerd inside an isolated Cloudflare Sandbox',
      browser: { sessionsPerAttempt: 1, resetWithinAttempt: false,
        keyboard: true, viewport: { min: 200, max: 3840 },
        navigation: hostedPreview ? 'The local preview and the checked immutable hosted preview, using target: hosted. Hosted proof must match its saved code tree.' : 'Only the registered preview origin for this attempt' },
      documentationHosts: input.policy.documentationHosts,
      safeAdapters: input.policy.safeAdapters,
      deployment: 'No provider credentials in the agent. An approved hosted preview requires an explicitly available trusted deployment path. Local workerd does not replace an approved hosted preview.',
      recovery: 'Runtime failure ends the attempt. A fresh attempt restores saved work and must capture its own current evidence. Do not require destroying and reallocating a service browser within an application demo.',
    }, null, 2));
    let correction: DemoCorrection | null = null;
    if (kind === 'plan' && priorRow) {
      const audit = await this.db.prepare(`SELECT plan_json,plan_digest FROM implementation_demo_upgrades
        WHERE run_id=? AND target_definition_digest=? ORDER BY created_at DESC LIMIT 1`)
        .bind(run.run_id, run.definition_digest).first<{ plan_json: string; plan_digest: string }>();
      if (audit) {
        if (await sha256Hex(audit.plan_json) !== audit.plan_digest)
          throw new ImplementationError('demo_context_integrity', 'Demo correction audit digest differs');
        const saved = JSON.parse(audit.plan_json) as {input: {runId: string; requestedBy: string; correction?: DemoCorrectionRequest}; targetDigest: string; approvedInputSha: string};
        if (saved.input.runId !== run.run_id || saved.targetDigest !== run.definition_digest || saved.approvedInputSha !== work.input_sha)
          throw new ImplementationError('demo_context_integrity', 'Demo correction audit subject differs');
        if (saved.input.correction?.planSha256 === priorRow.payload_sha)
          correction = {...saved.input.correction, upgradeDigest: audit.plan_digest, requestedBy: saved.input.requestedBy};
      }
    }
    if (candidate) {
      if (!priorRow || priorRow.outcome !== 'ready' || !priorPlan) throw new ImplementationError('demo_plan_missing', 'Demo gate requires its saved ready plan');
      if (candidate.outcome !== 'completed' || candidate.kind !== 'build') throw new ImplementationError('implementation_incomplete', 'Demo gate requires a completed build candidate');
      for (const file of candidate.files) {
        if (file.contentBase64 === null) continue;
        const bytes = Uint8Array.from(atob(file.contentBase64), char => char.charCodeAt(0));
        let content: string;
        try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes); }
        catch (error) {
          // Binary files remain in the candidate inventory; they cannot be source text.
          if (error instanceof TypeError) continue;
          throw error;
        }
        await addSource(`candidate/${file.path}`, content);
      }
      await addSource('context/checks.json', JSON.stringify(candidate.checks, null, 2));
      await addSource('context/tasks.md', candidate.tasks);
      for (const proof of candidate.proof) {
        const row = await this.db.prepare('SELECT * FROM implementation_proof WHERE run_id=? AND attempt_id=? AND proof_id=? AND sanitized=1')
          .bind(run.run_id, candidate.attemptId, proof.id).first<{ r2_key: string; sha256: string; media_type: string; kind: DemoEvidence['kind']; caption: string }>();
        if (!row || row.sha256 !== proof.sha256 || !subjectMatches(proof, subject))
          throw new ImplementationError('untrusted_proof', `Demo evidence does not match candidate: ${proof.id}`);
        await this.store.readBytes(row.r2_key, row.sha256);
        evidence.push({ ...subject, id: proof.id, kind: row.kind, caption: row.caption,
          sha256: row.sha256, r2Key: row.r2_key, contentType: row.media_type });
      }
    }
    const content = { version: 1 as const, kind, runId: run.run_id, approvedInputSha: work.input_sha,
      subject, candidateSha: candidate ? work.candidate_sha : null, requirements: demoRequirements(sources),
      sources, evidence, plan: kind === 'gate' && priorRow && priorPlan ? { sha256: priorRow.payload_sha, value: priorPlan } : null,
      priorPlan: kind === 'plan' ? priorPlan : null, priorPlanSha256: kind === 'plan' ? priorRow?.payload_sha ?? null : null,
      correction, feedback: gateRow ? await this.read<DemoResult>(gateRow) : null };
    const demo: DemoContext = { ...content, inputSha256: await sha256Hex(JSON.stringify(content)) };
    return { ...base, context: JSON.stringify({ demo }), continuationPatch: null };
  }
  async accept({ run, attempt, collection }: { run: OrchestrationRunRecord; attempt: AgentAttemptRecord; collection: ArtifactCollectionResult }): Promise<string> {
    const job = JSON.parse(attempt.job_spec_json);
    const context: DemoContext = JSON.parse(job.materializedContext).demo;
    const { inputSha256, ...content } = context;
    if (context.runId !== run.run_id || inputSha256 !== await sha256Hex(JSON.stringify(content)))
      throw new ImplementationError('demo_context_integrity', 'Demo input digest differs from the frozen job');
    const artifact = await this.db.prepare("SELECT r2_key,sha256 FROM artifacts WHERE manifest_id=? AND logical_name='raw-review-output.json'")
      .bind(collection.manifestId).first<{ r2_key: string; sha256: string }>();
    if (!artifact) throw new ImplementationError('demo_result_missing', 'Demo result artifact is missing');
    const result = await this.store.read<DemoPlan | DemoResult>(artifact.r2_key, artifact.sha256);
    const work = await this.store.requireRun(run.run_id);
    if (work.input_sha !== context.approvedInputSha || work.tested_base_sha !== context.subject.testedBaseSha)
      throw new ImplementationError('stale_proof', 'Demo subject changed while the reviewer was running');
    if (context.kind === 'plan') {
      const latestPlan = await this.latest(run.run_id, 'plan');
      if (context.priorPlanSha256 !== undefined && latestPlan?.attempt_id !== attempt.attempt_id &&
          (latestPlan?.payload_sha ?? null) !== context.priorPlanSha256)
        throw new ImplementationError('stale_proof', 'Demo plan changed while the reviewer was running');
      validateDemoPlan(result as DemoPlan, context);
    }
    else {
      if (work.candidate_sha !== context.candidateSha || work.tree_sha !== context.subject.treeSha ||
          (await this.latest(run.run_id, 'plan'))?.payload_sha !== context.plan?.sha256)
        throw new ImplementationError('stale_proof', 'Demo verdict is for an older candidate or plan');
      const accesses = await this.db.prepare('SELECT proof_id FROM implementation_demo_access WHERE attempt_id=?')
        .bind(attempt.attempt_id).all<{ proof_id: string }>();
      validateDemoResult(result as DemoResult, context, accesses.results.map(row => row.proof_id));
    }
    if (collection.result.reviewOutcome !== result.outcome || collection.result.summary !== result.summary)
      throw new ImplementationError('demo_result_integrity', 'Demo summary differs from its trusted result');
    const saved = await this.store.put(run.run_id, 'demo-review.json', JSON.stringify(result));
    await this.db.prepare(`INSERT OR IGNORE INTO implementation_demo_reviews
      (attempt_id,run_id,visit_sequence,kind,input_sha,plan_sha,candidate_sha,tested_base_sha,tree_sha,outcome,summary,payload_key,payload_sha,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(attempt.attempt_id, run.run_id, attempt.visit_sequence, context.kind,
        inputSha256, context.plan?.sha256 ?? context.priorPlanSha256 ?? null, context.candidateSha, context.subject.testedBaseSha, context.subject.treeSha,
        result.outcome, result.summary, saved.key, saved.sha256, new Date().toISOString()).run();
    const accepted = await this.db.prepare('SELECT payload_sha FROM implementation_demo_reviews WHERE attempt_id=?')
      .bind(attempt.attempt_id).first<{ payload_sha: string }>();
    if (accepted?.payload_sha !== saved.sha256) throw new ImplementationError('demo_result_integrity', 'Demo acceptance read-back differs');
    // A refreshed plan consumes the reply as context, but the next author still
    // needs it. Build acceptance closes the question once the author addresses it.
    if (context.kind === 'gate' && result.outcome !== 'blocked') await this.db.prepare("UPDATE implementation_questions SET status='closed' WHERE run_id=? AND status='answered'")
      .bind(run.run_id).run();
    return result.outcome;
  }
  async requirePass(work: ImplementationRun): Promise<DemoResult> {
    const plan = await this.latest(work.run_id, 'plan');
    const gate = await this.latest(work.run_id, 'gate');
    if (!plan || plan.outcome !== 'ready' || !gate || gate.outcome !== 'pass' || gate.plan_sha !== plan.payload_sha ||
        gate.candidate_sha !== work.candidate_sha || gate.tree_sha !== work.tree_sha || gate.tested_base_sha !== work.tested_base_sha)
      throw new ImplementationError('demo_gate_incomplete', 'Current independent demo gate must pass before publication or final review');
    return this.read<DemoResult>(gate);
  }
  async blocker(run: OrchestrationRunRecord) {
    const kind: DemoKind = run.previous_node === 'implementation_demo_plan' ? 'plan' : 'gate';
    const row = await this.latest(run.run_id, kind);
    if (!row || row.outcome !== 'blocked') throw new ImplementationError('demo_blocker_missing', 'No current demo blocker');
    return (await this.read<DemoPlan | DemoResult>(row)).question;
  }
  async evidence(attempt: AgentAttemptRecord, evidenceId: string) {
    const job = JSON.parse(attempt.job_spec_json);
    if (!['demo_plan', 'demo_gate'].includes(job.reviewKind)) throw new ImplementationError('demo_access_denied', 'Only demo reviewers may read demo evidence');
    const context: DemoContext = JSON.parse(job.materializedContext).demo;
    const { inputSha256, ...content } = context;
    if (context.runId !== attempt.run_id || inputSha256 !== await sha256Hex(JSON.stringify(content)))
      throw new ImplementationError('demo_context_integrity', 'Demo evidence input changed');
    const evidence = context.evidence.find(item => item.id === evidenceId);
    if (!evidence || !subjectMatches(evidence, context.subject)) throw new ImplementationError('demo_access_denied', 'Evidence is outside this frozen demo review');
    const bytes = await this.store.readBytes(evidence.r2Key, evidence.sha256);
    const image = evidence.contentType.startsWith('image/');
    if (bytes.byteLength > (image ? 8_000_000 : 2_000_000)) throw new ImplementationError('demo_evidence_size', `Evidence is too large for one review tool response: ${bytes.byteLength}`);
    const block = image ? { type: 'image', mimeType: evidence.contentType, data: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')) }
      : { type: 'text', text: new TextDecoder().decode(bytes) };
    await this.db.prepare('INSERT OR IGNORE INTO implementation_demo_access (attempt_id,proof_id,sha256,opened_at) VALUES (?,?,?,?)')
      .bind(attempt.attempt_id, evidence.id, evidence.sha256, new Date().toISOString()).run();
    return { content: [{ type: 'text', text: `${evidence.kind}: ${evidence.caption}\nSHA-256: ${evidence.sha256}` }, block] };
  }
}
