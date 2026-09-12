import { REVIEW_SCHEMA, reduceReviewCycle, verifyReviewJournal, reviewGateEvidence } from '../container/bounded-review.mjs';
import { unwrapGroundedReview } from '../container/grounded-review.mjs';
import { lineClaims } from '../container/grounded-review.mjs';
import { validateSources } from '../container/bounded-review.mjs';
const sha256Hex = async (text: string): Promise<string> => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
)).map(byte => byte.toString(16).padStart(2, "0")).join("");

/** All writes require the owning attempt's destroyed cleanup receipt. */
export class D1BoundedReviewStore {
  private db: D1Database;
  private bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) { this.db = db; this.bucket = bucket; }

  async prepare(attemptId: string, jobDigest: string, manifestId: string, payload: unknown) {
    const encoded = JSON.stringify(payload);
    const digest = await sha256Hex(encoded);
    const key = `bounded-review/collections/${attemptId}/${digest}.json`;
    await this.bucket.put(key, encoded, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
    const object = await this.bucket.get(key);
    if (!object || await sha256Hex(await object.text()) !== digest) throw new Error("bounded collection write verification failed");
    await this.db.prepare(`INSERT OR IGNORE INTO bounded_review_collections (attempt_id, job_spec_digest, manifest_id, r2_key, sha256)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM agent_attempts WHERE attempt_id = ? AND job_spec_digest = ? AND state = 'collecting')`)
      .bind(attemptId, jobDigest, manifestId, key, digest, attemptId, jobDigest).run();
    const saved = await this.prepared(attemptId, jobDigest);
    if (!saved || JSON.stringify(saved) !== encoded) throw new Error("bounded collection checkpoint conflict");
  }

  async prepared(attemptId: string, jobDigest: string): Promise<any | null> {
    const row = await this.db.prepare(`SELECT r2_key, sha256, job_spec_digest FROM bounded_review_collections WHERE attempt_id = ?`)
      .bind(attemptId).first<{ r2_key: string; sha256: string; job_spec_digest: string }>();
    if (!row) return null;
    if (row.job_spec_digest !== jobDigest) throw new Error("bounded collection job digest mismatch");
    const object = await this.bucket.get(row.r2_key);
    if (!object) throw new Error("bounded collection checkpoint missing");
    const content = await object.text();
    if (await sha256Hex(content) !== row.sha256) throw new Error("bounded collection checkpoint hash mismatch");
    return JSON.parse(content);
  }

  async artifact(manifestId: string, name: string): Promise<string> {
    const row = await this.db.prepare(`SELECT artifact.r2_key, artifact.sha256, artifact.byte_size
      FROM artifacts artifact JOIN artifact_manifests manifest ON manifest.manifest_id = artifact.manifest_id
      WHERE artifact.manifest_id = ? AND artifact.logical_name = ? AND artifact.policy_outcome = 'accepted'
        AND manifest.state = 'complete'`).bind(manifestId, name)
      .first<{ r2_key: string; sha256: string; byte_size: number }>();
    if (!row) throw new Error(`required review artifact missing: ${name}`);
    const object = await this.bucket.get(row.r2_key);
    if (!object || object.size !== row.byte_size) throw new Error(`review artifact size mismatch: ${name}`);
    const content = await object.text();
    if (await sha256Hex(content) !== row.sha256) throw new Error(`review artifact hash mismatch: ${name}`);
    return content;
  }

  async acceptJournal(input: { runId: string; attemptId: string; manifestId: string; inputDigest: string; candidateFiles: {path: string; content: string}[] }) {
    const [journalText, transcript] = await Promise.all([
      this.artifact(input.manifestId, 'review-progress.json'), this.artifact(input.manifestId, 'transcript.jsonl'),
    ]);
    const journal = JSON.parse(journalText);
    const attempt = await this.db.prepare('SELECT job_spec_json FROM agent_attempts WHERE attempt_id = ?').bind(input.attemptId).first<{ job_spec_json: string }>();
    if (!attempt) throw new Error('review journal owning attempt missing');
    const job = JSON.parse(attempt.job_spec_json);
    const continuation = job.reviewContinuation ? await this.recovery(job.reviewContinuation.sourceAttemptId) : null;
    const state = await verifyReviewJournal(journal, { ...input, parentTranscript: transcript, hash: sha256Hex, continuation });
    if (state.discovery.status !== 'accepted' || !['accepted', 'unavailable', 'not_required'].includes(state.recheck.status)) {
      throw new Error('nested_review_incomplete');
    }
    const encoded = JSON.stringify(state);
    const digest = await sha256Hex(encoded);
    await this.db.prepare(`INSERT OR IGNORE INTO phase_review_cycles
      (run_id, phase, schema_version, origin_attempt_id, state_json, state_sha256, initial_state_sha256, journal_manifest_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM agent_attempts WHERE attempt_id = ? AND run_id = ? AND cleanup_state = 'destroyed'
          AND state IN ('collecting', 'completed') AND EXISTS (SELECT 1 FROM bounded_review_collections saved WHERE saved.attempt_id = agent_attempts.attempt_id AND saved.manifest_id = ?))`)
      .bind(input.runId, state.phase, REVIEW_SCHEMA, input.attemptId, encoded, digest, digest, input.manifestId,
        input.attemptId, input.runId, input.manifestId).run();
    const saved = await this.read(input.runId, state.phase);
    if (!saved || saved.initial_state_sha256 !== digest || saved.origin_attempt_id !== input.attemptId) {
      throw new Error('review cycle collection conflict or cleanup incomplete');
    }
    for (let index = 0; index < journal.children.length; index++) {
      const child = journal.children[index];
      const bytes = new TextEncoder().encode(child.transcript).length;
      await this.db.prepare(`INSERT OR IGNORE INTO review_transcript_owners
        (owner_kind, owner_id, attempt_id, parent_attempt_id, manifest_id, logical_name, child_index, sha256, byte_size, event_count, format_version)
        VALUES ('native_child_invocation', ?, ?, ?, ?, 'review-progress.json', ?, ?, ?, ?, 'codex-session-jsonl-v1')`)
        .bind(child.invocationId, input.attemptId, input.attemptId, input.manifestId, index, child.sha256, bytes, child.eventCount).run();
    }
    return state;
  }

  async read(runId: string, phase: string) {
    const row = await this.db.prepare(`SELECT revision, state_json, state_sha256, initial_state_sha256, origin_attempt_id
      FROM phase_review_cycles WHERE run_id = ? AND phase = ?`).bind(runId, phase)
      .first<{ revision: number; state_json: string; state_sha256: string; initial_state_sha256: string; origin_attempt_id: string }>();
    if (row && await sha256Hex(row.state_json) !== row.state_sha256) throw new Error('review cycle integrity mismatch');
    return row;
  }

  async apply(runId: string, phase: string, event: Record<string, unknown>) {
    const row = await this.read(runId, phase);
    if (!row) throw new Error('review cycle is missing');
    const prior = JSON.parse(row.state_json);
    const eventDigest = await sha256Hex(JSON.stringify(event));
    if (prior.acceptedEvents?.includes(eventDigest)) return prior;
    const next = reduceReviewCycle(prior, event);
    next.acceptedEvents = [...(prior.acceptedEvents ?? []), eventDigest];
    const encoded = JSON.stringify(next);
    const digest = await sha256Hex(encoded);
    const result = await this.db.prepare(`UPDATE phase_review_cycles SET state_json = ?, state_sha256 = ?, revision = revision + 1
      WHERE run_id = ? AND phase = ? AND revision = ? AND state_sha256 = ?`)
      .bind(encoded, digest, runId, phase, row.revision, row.state_sha256).run();
    if (result.meta.changes !== 1) throw new Error('review cycle concurrent update conflict');
    return next;
  }

  async acceptIndependent(input: { runId: string; phase: string; attemptId: string; manifestId: string; head: string;
    findings: { id: string; summary: string; location: string }[] }) {
    const owner = await this.db.prepare(`SELECT 1 AS valid FROM agent_attempts WHERE attempt_id = ? AND run_id = ?
      AND cleanup_state = 'destroyed' AND state IN ('collecting', 'completed')`).bind(input.attemptId, input.runId).first();
    if (!owner) throw new Error('independent review cleanup is incomplete');
    const envelopes = JSON.parse(await this.artifact(input.manifestId, 'review-sources.json'));
    if (!Array.isArray(envelopes) || !envelopes.length) throw new Error('independent source evidence is missing');
    const sourceEvidence = envelopes.map(unwrapGroundedReview);
    return this.apply(input.runId, input.phase, { type: 'independent_result', attemptId: input.attemptId,
      manifestId: input.manifestId, head: input.head, result: { findings: input.findings, sourceEvidence } });
  }

  async bindGate(runId: string, phase: 'planning' | 'design', visit: number, currentHead: string) {
    const row = await this.read(runId, phase);
    if (!row) throw new Error('bounded human gate review cycle missing');
    const state = JSON.parse(row.state_json);
    const evidence = reviewGateEvidence(state);
    if (evidence.currentHead !== currentHead) throw new Error('bounded human gate published head mismatch');
    const active = await this.db.prepare(`SELECT COUNT(*) AS count FROM agent_attempts WHERE run_id = ?
      AND state IN ('pending', 'starting', 'running', 'collecting')`).bind(runId).first<{ count: number }>();
    if (active?.count !== 0) throw new Error('bounded human gate has unfinished attempts');
    const encoded = JSON.stringify(evidence);
    await this.db.prepare(`INSERT OR IGNORE INTO bounded_review_gate_bindings
      (run_id, phase, visit_sequence, state_sha256, evidence_json) VALUES (?, ?, ?, ?, ?)`)
      .bind(runId, phase, visit, row.state_sha256, encoded).run();
    const saved = await this.db.prepare(`SELECT state_sha256, evidence_json FROM bounded_review_gate_bindings
      WHERE run_id = ? AND phase = ? AND visit_sequence = ?`).bind(runId, phase, visit)
      .first<{ state_sha256: string; evidence_json: string }>();
    if (saved?.state_sha256 !== row.state_sha256 || saved.evidence_json !== encoded) throw new Error('bounded human gate binding conflict');
    return evidence;
  }

  async recovery(attemptId: string): Promise<any> {
    const row = await this.db.prepare(`SELECT recovery_json, sha256, eligible FROM bounded_review_recoveries WHERE attempt_id = ?`)
      .bind(attemptId).first<{ recovery_json: string; sha256: string; eligible: number }>();
    if (!row || await sha256Hex(row.recovery_json) !== row.sha256) throw new Error('review recovery evidence missing or corrupt');
    const value = JSON.parse(row.recovery_json);
    if (Boolean(row.eligible) !== value.eligible) throw new Error('review recovery eligibility mismatch');
    return value;
  }

  async recordFailure(attemptId: string) {
    const existing = await this.db.prepare('SELECT attempt_id FROM bounded_review_recoveries WHERE attempt_id = ?').bind(attemptId).first();
    if (existing) return this.recovery(attemptId);
    const attempt = await this.db.prepare(`SELECT run_id, node_id, state, cleanup_state, manifest_id, result_class, job_spec_json, job_spec_digest
      FROM agent_attempts WHERE attempt_id = ?`).bind(attemptId).first<{
        run_id: string; node_id: string; state: string; cleanup_state: string; manifest_id: string; result_class: string; job_spec_json: string; job_spec_digest: string;
      }>();
    if (!attempt || !['failed', 'interrupted', 'absolute_timeout'].includes(attempt.state) || attempt.cleanup_state !== 'destroyed') throw new Error('review recovery requires a terminal cleaned attempt');
    if (await sha256Hex(attempt.job_spec_json) !== attempt.job_spec_digest) throw new Error('review recovery job digest mismatch');
    const job = JSON.parse(attempt.job_spec_json);
    let value: any;
    try {
      if (job.nativeSelfReview?.schema === REVIEW_SCHEMA) {
        const journal = JSON.parse(await this.artifact(attempt.manifest_id, 'review-progress.json'));
        const transcript = await this.artifact(attempt.manifest_id, 'transcript.jsonl');
        const continuation = job.reviewContinuation ? await this.recovery(job.reviewContinuation.sourceAttemptId) : null;
        const inputDigest = await sha256Hex(job.materializedContext);
        let cycle = await verifyReviewJournal(journal, { attemptId, runId: attempt.run_id, inputDigest,
          candidateFiles: journal.checkedCandidate.files, parentTranscript: transcript, hash: sha256Hex, continuation });
        validateSources(journal.checkedSources, lineClaims(journal.checkedCandidate.files));
        for (const slot of ['discovery', 'recheck']) {
          const active = cycle[slot].invocations.at(-1);
          if (active?.status === 'started') {
            const event = { type: 'failure', slot, invocationId: active.id,
              cause: { message: `Author attempt ended during ${slot}: ${attempt.result_class}`, manifestId: attempt.manifest_id } };
            cycle = reduceReviewCycle(cycle, event); journal.events.push(event);
          }
        }
        // An interrupted repair consumes the turn; recovery keeps the last checked candidate.
        if (cycle.repair.started && cycle.repair.outcome === null) {
          const event = { type: 'repair_finished', passed: false, candidateDigest: cycle.currentDigest };
          cycle = reduceReviewCycle(cycle, event); journal.events.push(event);
        }
        const slot = cycle.discovery.status === 'accepted' ? 'recheck' : 'discovery';
        const eligible = cycle.status === 'active' && ['failed', 'pending'].includes(cycle[slot].status) && cycle[slot].invocations.length < 2;
        value = { eligible, slot, inputDigest, cycle, journal, sourceAttemptId: attemptId, sourceManifestId: attempt.manifest_id };
      } else if (job.agentRole === 'reviewer' || ['planning_independent_response', 'design_independent_response'].includes(attempt.node_id)) {
        const phase = job.reviewKind === 'design' || attempt.node_id.startsWith('design_') ? 'design' : 'planning';
        const slot = job.agentRole === 'reviewer' ? 'independent' : 'response';
        const cycle = await this.apply(attempt.run_id, phase, { type: 'invalid_result', slot, attemptId,
          cause: { message: attempt.result_class, manifestId: attempt.manifest_id } });
        value = { eligible: cycle.status === 'active' && cycle[slot].invalidCount < 2, slot, sourceAttemptId: attemptId };
      } else value = { eligible: true, slot: 'human_revision', sourceAttemptId: attemptId };
    } catch (error) {
      value = { eligible: false, status: 'manual_reconciliation_required', sourceAttemptId: attemptId,
        cause: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null,
          cause: error instanceof Error && error.cause ? String(error.cause) : null, originalManifestId: attempt.manifest_id } };
    }
    const encoded = JSON.stringify(value);
    const digest = await sha256Hex(encoded);
    await this.db.prepare(`INSERT OR IGNORE INTO bounded_review_recoveries (attempt_id, eligible, recovery_json, sha256) VALUES (?, ?, ?, ?)`)
      .bind(attemptId, value.eligible ? 1 : 0, encoded, digest).run();
    const saved = await this.recovery(attemptId);
    if (JSON.stringify(saved) !== encoded) throw new Error('review failure recovery conflict');
    return saved;
  }
}
