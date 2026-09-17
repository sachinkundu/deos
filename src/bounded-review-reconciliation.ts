import { D1BoundedReviewStore } from './bounded-review-store.ts';
import { verifyReviewJournal, validateSources } from '../container/bounded-review.mjs';
import { lineClaims } from '../container/grounded-review.mjs';
import { sha256Hex } from './implementation-hash.ts';

interface Input {
  version: 1; runId: string; attemptId: string; workflowInstanceId: string;
  definitionDigest: string; visitSequence: number; transcript: string;
  observedAt: string; requestedBy: string; execute?: boolean; planDigest?: string;
}
const KIND = 'operator_transcript_restore';

/** Restore missing transport evidence; never replace a review result or reset a slot. */
export class BoundedReviewReconciliationController {
  readonly env: Pick<Env, 'DB' | 'ARTIFACTS' | 'STAGE_RETRY_SECRET'>;
  constructor(env: Pick<Env, 'DB' | 'ARTIFACTS' | 'STAGE_RETRY_SECRET'>) { this.env = env; }
  async handle(request: Request): Promise<Response> {
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    if (!this.env.STAGE_RETRY_SECRET || request.headers.get('Authorization') !== `Bearer ${this.env.STAGE_RETRY_SECRET}`)
      return Response.json({ error: 'invalid_operator_capability' }, { status: 401 });
    const input = await request.json() as Input;
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['version','runId','attemptId','workflowInstanceId','definitionDigest',
        'visitSequence','transcript','observedAt','requestedBy','execute','planDigest'].includes(key)) ||
      input.version !== 1 || !['runId','attemptId','workflowInstanceId','definitionDigest','transcript','observedAt','requestedBy']
        .every(key => typeof input[key as keyof Input] === 'string' && String(input[key as keyof Input]).length > 0) ||
      !/^[a-f0-9]{64}$/.test(input.definitionDigest) || !Number.isSafeInteger(input.visitSequence) ||
      input.visitSequence < 1 || !/^[A-Za-z0-9._@-]{1,100}$/.test(input.requestedBy) ||
      !Number.isFinite(Date.parse(input.observedAt)) || new TextEncoder().encode(input.transcript).length > 4_000_000 ||
      (input.execute !== undefined && typeof input.execute !== 'boolean')) throw new Error('invalid_review_reconciliation');
    const { transcript, execute, planDigest: requestedDigest, ...identity } = input;
    const transcriptSha = await sha256Hex(transcript);
    const requestIdentity = { ...identity, transcriptSha256: transcriptSha };
    const existing = await this.env.DB.prepare('SELECT * FROM bounded_review_reconciliations WHERE attempt_id=?')
      .bind(input.attemptId).first<{ plan_digest: string; plan_json: string }>();
    if (existing) {
      if (await sha256Hex(existing.plan_json) !== existing.plan_digest) throw new Error('review_reconciliation_audit_corrupt');
      const saved = JSON.parse(existing.plan_json);
      if (JSON.stringify(saved.input) !== JSON.stringify(requestIdentity)) throw new Error('review_reconciliation_identity_mismatch');
      if (execute && requestedDigest !== existing.plan_digest) throw new Error('review_reconciliation_plan_mismatch');
      return Response.json({ state: 'applied', planDigest: existing.plan_digest, plan: saved });
    }
    const row = await this.env.DB.prepare(`SELECT attempt.*, run.current_visit_sequence, run.workflow_instance_id,
      run.definition_digest, run.status AS run_status, run.current_node, recovery.recovery_json,
      recovery.sha256 AS recovery_sha, recovery.eligible
      FROM agent_attempts attempt JOIN orchestration_runs run ON run.run_id=attempt.run_id
      JOIN bounded_review_recoveries recovery ON recovery.attempt_id=attempt.attempt_id
      WHERE attempt.attempt_id=? AND attempt.run_id=?`).bind(input.attemptId, input.runId).first<any>();
    if (!row || row.run_status !== 'manual_reconciliation_required' || row.current_node !== 'review_reconciliation' ||
      row.current_visit_sequence !== input.visitSequence || row.visit_sequence !== input.visitSequence - 1 ||
      row.workflow_instance_id !== input.workflowInstanceId || row.definition_digest !== input.definitionDigest ||
      row.state !== 'failed' || row.cleanup_state !== 'destroyed' || row.eligible !== 0 ||
      !['planning_author','design_author'].includes(row.node_id) ||
      Date.parse(input.observedAt) < Date.parse(row.created_at) || Date.parse(input.observedAt) > Date.parse(row.ended_at))
      throw new Error('review_reconciliation_not_eligible');
    const old = JSON.parse(row.recovery_json);
    if (await sha256Hex(row.recovery_json) !== row.recovery_sha ||
      old.cause?.message !== 'required review artifact missing: transcript.jsonl' ||
      old.cause.originalManifestId !== row.manifest_id) throw new Error('review_reconciliation_wrong_failure');
    const job = JSON.parse(row.job_spec_json);
    if (await sha256Hex(row.job_spec_json) !== row.job_spec_digest ||
      job.nativeSelfReview?.schema !== 'deos-bounded-review-v1' || job.reviewContinuation)
      throw new Error('review_reconciliation_job_mismatch');
    const store = new D1BoundedReviewStore(this.env.DB, this.env.ARTIFACTS);
    const journal = JSON.parse(await store.artifact(row.manifest_id, 'review-progress.json'));
    const inputDigest = await sha256Hex(job.materializedContext);
    const cycle = await verifyReviewJournal(journal, { attemptId: input.attemptId, runId: input.runId,
      inputDigest, candidateFiles: journal.checkedCandidate.files, parentTranscript: transcript,
      hash: sha256Hex, model: job.model });
    validateSources(journal.checkedSources, lineClaims(journal.checkedCandidate.files));
    if (cycle.status !== 'active' || cycle.discovery.status !== 'accepted' || cycle.repair.outcome !== 'checked' ||
      cycle.recheck.status !== 'failed' || cycle.recheck.invocations.length !== 1 || cycle.currentHead !== null)
      throw new Error('review_reconciliation_no_recheck_slot');
    const absent = await this.env.DB.prepare(`SELECT 1 FROM artifacts WHERE manifest_id=? AND logical_name='transcript.jsonl'
      UNION ALL SELECT 1 FROM phase_review_cycles WHERE run_id=? AND phase=?
      UNION ALL SELECT 1 FROM agent_attempts WHERE run_id=? AND (state IN ('pending','starting','running','collecting') OR
        (node_id=? AND visit_sequence>?)) LIMIT 1`)
      .bind(row.manifest_id, input.runId, cycle.phase, input.runId, row.node_id, row.visit_sequence).first();
    if (absent) throw new Error('review_reconciliation_evidence_or_run_changed');
    const plan = { input: requestIdentity, manifestId: row.manifest_id, jobSpecDigest: row.job_spec_digest,
      originalRecoverySha256: row.recovery_sha, journalSha256: await sha256Hex(JSON.stringify(journal)),
      candidateDigest: cycle.currentDigest, phase: cycle.phase, slot: 'recheck', remainingInvocations: 1 };
    const encodedPlan = JSON.stringify(plan), digest = await sha256Hex(encodedPlan);
    if (!execute) return Response.json({ ready: true, planDigest: digest, plan });
    if (requestedDigest !== digest) throw new Error('review_reconciliation_plan_mismatch');
    const key = `bounded-review/reconciliations/${input.attemptId}/${transcriptSha}.jsonl`;
    await this.env.ARTIFACTS.put(key, transcript, { onlyIf: { etagDoesNotMatch: '*' } });
    const savedTranscript = await this.env.ARTIFACTS.get(key);
    if (!savedTranscript || await sha256Hex(await savedTranscript.text()) !== transcriptSha)
      throw new Error('review_reconciliation_transcript_storage_mismatch');
    const recovery = { eligible: true, slot: 'recheck', inputDigest, cycle, journal,
      sourceAttemptId: input.attemptId, sourceManifestId: row.manifest_id,
      reconciliation: { kind: KIND, planDigest: digest, transcriptKey: key, transcriptSha256: transcriptSha,
        observedAt: input.observedAt, requestedBy: input.requestedBy, originalRecoverySha256: row.recovery_sha } };
    const encoded = JSON.stringify(recovery), recoverySha = await sha256Hex(encoded);
    const cycleText = JSON.stringify(cycle), cycleSha = await sha256Hex(cycleText);
    const results = await this.env.DB.batch([
      this.env.DB.prepare(`INSERT INTO bounded_review_reconciliations
        (attempt_id,run_id,plan_digest,plan_json,original_recovery_json,transcript_r2_key,transcript_sha256,recovery_sha256,created_at)
        SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (
          SELECT 1 FROM orchestration_runs run JOIN agent_attempts attempt ON attempt.run_id=run.run_id
          JOIN bounded_review_recoveries recovery ON recovery.attempt_id=attempt.attempt_id
          WHERE run.run_id=? AND run.workflow_instance_id=? AND run.definition_digest=? AND run.current_visit_sequence=?
            AND run.status='manual_reconciliation_required' AND run.current_node='review_reconciliation'
            AND attempt.attempt_id=? AND attempt.state='failed' AND attempt.cleanup_state='destroyed'
            AND attempt.manifest_id=? AND attempt.job_spec_digest=? AND recovery.eligible=0 AND recovery.sha256=?)
          AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=? AND
            (state IN ('pending','starting','running','collecting') OR (node_id=? AND visit_sequence>?)))
          AND NOT EXISTS (SELECT 1 FROM phase_review_cycles WHERE run_id=? AND phase=?)`)
        .bind(input.attemptId,input.runId,digest,encodedPlan,row.recovery_json,key,transcriptSha,recoverySha,new Date().toISOString(),
          input.runId,input.workflowInstanceId,input.definitionDigest,input.visitSequence,input.attemptId,row.manifest_id,row.job_spec_digest,row.recovery_sha,
          input.runId,row.node_id,row.visit_sequence,input.runId,cycle.phase),
      this.env.DB.prepare(`INSERT INTO phase_review_cycles
        (run_id,phase,schema_version,origin_attempt_id,state_json,state_sha256,initial_state_sha256,journal_manifest_id)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM bounded_review_reconciliations WHERE attempt_id=? AND plan_digest=?)`)
        .bind(input.runId,cycle.phase,'deos-bounded-review-v1',cycle.originAttemptId,cycleText,cycleSha,cycleSha,row.manifest_id,input.attemptId,digest),
      this.env.DB.prepare(`UPDATE bounded_review_recoveries SET eligible=1,recovery_json=?,sha256=?
        WHERE attempt_id=? AND eligible=0 AND sha256=? AND EXISTS
          (SELECT 1 FROM bounded_review_reconciliations WHERE attempt_id=? AND plan_digest=?)`)
        .bind(encoded,recoverySha,input.attemptId,row.recovery_sha,input.attemptId,digest),
    ]);
    if (results.some(result => result.meta.changes !== 1)) throw new Error('review_reconciliation_compare_and_set_failed');
    if (JSON.stringify(await store.recovery(input.attemptId)) !== encoded) throw new Error('review_reconciliation_readback_failed');
    return Response.json({ state: 'applied', planDigest: digest, plan });
  }
}
