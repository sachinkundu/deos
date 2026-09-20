import { demoHandoff } from './implementation-demo-handoff.ts';
import { ImplementationError } from './implementation-contract.ts';
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
import { implementationRuntimeContext } from './implementation-runtime-context.ts';

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
      feedback: build.implementationReviewFeedback, question: build.question, reply: build.reply,
      clarifications: await this.store.clarifications(run.run_id) }, null, 2));
    await addSource('context/runtime-capabilities.json', JSON.stringify({
      ...implementationRuntimeContext(input.policy),
      browser: { sessionsPerAttempt: 1, resetWithinAttempt: true, reallocateWithinAttempt: false,
        execution: 'Chromium inside the implementation sandbox; local pipe control, no external browser service or local preview tunnel.',
        demoCollection: 'One action: demo request holds the browser for the ordered scenario list. Each scenario starts with a fresh context; browser storage, cookies and page state reset, while server data must be prepared separately. Fixed viewport and target per scenario. A failed action stops collection; fix the cause and rerun from zero. Completed collections accumulate; a correction or failed collection never removes prior evidence.',
        keyboard: true, keyboardModifiers: ['Alt','Control','Meta','Shift'],
        keyTrace: 'operation: trace with enabled: true records real key events in a visible overlay. Turn it off with enabled: false for plain application proof.',
        measurements: 'Exploratory operation: measure records live origin, CSS viewport, document width, geometry and text as diagnostic Showboat proof. It is not a supported ordered demo step. Do not require these measurements in the PR gallery; selected behavior demonstrations and trusted preview receipts remain available to review.',
        selection: 'Keep before/after captures for each claimed transition. Author status and select_proof expose captures grouped by scenario, including omitted images. Selection adds to carried evidence; omitting an item needs a reason. The author fills an evidence checklist for the saved scenarios. Publication checks item accounting and links, not image quality or semantic sufficiency.',
        viewport: { min: 200, max: 3840, persistsAcrossCommands: true },
        navigation: hostedPreview ? 'The local preview and the checked immutable hosted preview, using target: hosted. The saved deployment receipt identifies its code revision for review.' : 'Only the registered preview origin for this attempt' },
      recovery: 'Runtime or browser process failure ends the attempt. A fresh attempt restores saved work and evidence. Sol decides which checks or demos need to run again. Reset creates a fresh context in the same local browser, not a new service allocation.',
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
      if (candidate.evidenceChecklist)
        await addSource('context/evidence-checklist.json', JSON.stringify(candidate.evidenceChecklist, null, 2));
      if (candidate.proofOmissions?.length)
        await addSource('context/evidence-omissions.json', JSON.stringify(candidate.proofOmissions, null, 2));
      for (const proof of candidate.proof) {
        const row = await this.db.prepare('SELECT * FROM implementation_proof WHERE run_id=? AND attempt_id=? AND proof_id=? AND sanitized=1')
          .bind(run.run_id, candidate.attemptId, proof.id).first<{ r2_key: string; sha256: string; media_type: string; kind: DemoEvidence['kind']; caption: string }>();
        evidence.push({ ...proof, r2Key: row?.r2_key ?? proof.path,
          contentType: row?.media_type ?? (proof.kind === 'browser_image' ? 'image/png' : 'text/plain') });
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
  async accept({ run, attempt, collection, dryRun = false }: { run: OrchestrationRunRecord; attempt: AgentAttemptRecord; collection: ArtifactCollectionResult; dryRun?: boolean }): Promise<string> {
    const job = JSON.parse(attempt.job_spec_json);
    const context: DemoContext = JSON.parse(job.materializedContext).demo;
    const { inputSha256, ...content } = context;
    const artifact = await this.db.prepare("SELECT r2_key,sha256 FROM artifacts WHERE manifest_id=? AND logical_name='raw-review-output.json'")
      .bind(collection.manifestId).first<{ r2_key: string; sha256: string }>();
    if (!artifact) throw new ImplementationError('demo_result_missing', 'Demo result artifact is missing');
    const result = await this.store.read<DemoPlan | DemoResult>(artifact.r2_key, artifact.sha256);
    if (context.kind === 'plan') {
      validateDemoPlan(result as DemoPlan, context);
    }
    else {
      validateDemoResult(result as DemoResult, context);
    }
    if (dryRun) return result.outcome;
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
  handoff(work: ImplementationRun) {
    return demoHandoff(this.db,this.bucket,work);
  }
  async requireHandoff(work: ImplementationRun) {
    const handoff = await this.handoff(work);
    if (!handoff) throw new ImplementationError('demo_gate_incomplete', 'Demo review or its one repair pass must finish before human review');
    return handoff;
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
    if (!evidence) throw new ImplementationError('demo_access_denied', 'Evidence is outside this review message');
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
