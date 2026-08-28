import type { CandidateEvidence } from "./planning-candidate.ts";
import type { TraceReviewMode, TraceReviewStage } from "./trace-review.ts";

export type TraceReviewPhaseState =
  | "awaiting_discovery"
  | "findings_open"
  | "awaiting_repair"
  | "awaiting_recheck"
  | "proof_conflict"
  | "closed_pass"
  | "closed_needs_judgment"
  | "stopped";

export interface TraceReviewPhaseRecord {
  run_id: string;
  round: number;
  stage: TraceReviewStage;
  state: TraceReviewPhaseState;
  current_candidate_id: string;
  current_head_sha: string | null;
  current_review_input_id: string | null;
  base_finding_set_digest: string | null;
  accepted_review_id: string | null;
  shared_repair_turns: number;
  review_job_count: number;
  proof_repair_count: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface TraceReviewRecord {
  review_id: string;
  review_input_id: string;
  run_id: string;
  attempt_id: string | null;
  phase: TraceReviewStage;
  mode: TraceReviewMode;
  round: number;
  candidate_id: string;
  reviewed_head_sha: string | null;
  author_model_provider: string;
  author_model: string;
  reviewer_provider: string;
  reviewer_model: string;
  agent_harness: string;
  agent_harness_version: string;
  reasoning_effort: string;
  prompt_version: string;
  prompt_sha256: string;
  tool_version: string;
  bundle_sha256: string;
  baseline_finding_set_digest: string | null;
  proof_manifest_id: string;
  sidecar_r2_key: string;
  overall_outcome: "pass" | "findings" | "needs_judgment" | "proof_conflict" | "failed" | "blocked";
  accepted: number;
  reused_from_review_id: string | null;
  conflicting_review_id: string | null;
  created_at: string;
  completed_at: string | null;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1TraceReviewStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async recordCandidate(input: CandidateEvidence): Promise<void> {
    const candidate = input.candidate;
    await this.db.prepare(
      `INSERT OR IGNORE INTO planning_candidates
       (candidate_id, run_id, round, source_attempt_id, base_commit, change_id,
        candidate_digest, review_set_digest, file_list_json, candidate_r2_key,
        candidate_sha256, validation_r2_key, validation_sha256, state, created_at, accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?, ?)`,
    ).bind(
      candidate.candidateId,
      candidate.runId,
      candidate.round,
      candidate.sourceAttemptId,
      candidate.baseCommit,
      candidate.change,
      candidate.candidateDigest,
      candidate.reviewSetDigest,
      JSON.stringify(candidate.files.map(({ content: _content, ...file }) => file)),
      input.candidateR2Key,
      input.candidateSha256,
      input.validationR2Key,
      input.validationSha256,
      input.validation.checkedAt,
      input.validation.checkedAt,
    ).run();
    const stored = await this.db.prepare(
      `SELECT candidate_digest, candidate_r2_key, candidate_sha256,
              validation_r2_key, validation_sha256, state
       FROM planning_candidates WHERE candidate_id = ?`,
    ).bind(candidate.candidateId).first<{
      candidate_digest: string;
      candidate_r2_key: string;
      candidate_sha256: string;
      validation_r2_key: string;
      validation_sha256: string;
      state: string;
    }>();
    if (
      stored?.candidate_digest !== candidate.candidateDigest ||
      stored.candidate_r2_key !== input.candidateR2Key ||
      stored.candidate_sha256 !== input.candidateSha256 ||
      stored.validation_r2_key !== input.validationR2Key ||
      stored.validation_sha256 !== input.validationSha256 ||
      stored.state !== "validated"
    ) throw new Error("planning candidate identity mismatch");
  }

  async ensurePhase(input: {
    runId: string;
    round: number;
    stage: TraceReviewStage;
    candidateId: string;
    headSha: string | null;
    sharedRepairTurns?: number;
    now: string;
  }): Promise<TraceReviewPhaseRecord> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO trace_review_phases
       (run_id, round, stage, state, current_candidate_id, current_head_sha,
        shared_repair_turns, created_at, updated_at)
       VALUES (?, ?, ?, 'awaiting_discovery', ?, ?, ?, ?, ?)`,
    ).bind(
      input.runId,
      input.round,
      input.stage,
      input.candidateId,
      input.headSha,
      input.sharedRepairTurns ?? 0,
      input.now,
      input.now,
    ).run();
    const phase = await this.findPhase(input.runId, input.round, input.stage);
    if (
      phase === null || phase.current_candidate_id !== input.candidateId ||
      phase.current_head_sha !== input.headSha
    ) throw new Error("trace review phase identity mismatch");
    return phase;
  }

  findPhase(runId: string, round: number, stage: TraceReviewStage): Promise<TraceReviewPhaseRecord | null> {
    return this.db.prepare(
      "SELECT * FROM trace_review_phases WHERE run_id = ? AND round = ? AND stage = ? LIMIT 1",
    ).bind(runId, round, stage).first<TraceReviewPhaseRecord>();
  }

  async compareAndSetPhase(input: {
    runId: string;
    round: number;
    stage: TraceReviewStage;
    expectedRevision: number;
    expectedState: TraceReviewPhaseState;
    nextState: TraceReviewPhaseState;
    candidateId: string;
    headSha: string | null;
    reviewInputId: string | null;
    baseFindingSetDigest: string | null;
    acceptedReviewId: string | null;
    sharedRepairTurns: number;
    reviewJobCount: number;
    proofRepairCount: number;
    now: string;
  }): Promise<TraceReviewPhaseRecord> {
    if (input.sharedRepairTurns < 0 || input.sharedRepairTurns > 3) {
      throw new Error("shared repair turn count is invalid");
    }
    const result = await this.db.prepare(
      `UPDATE trace_review_phases
       SET state = ?, current_candidate_id = ?, current_head_sha = ?,
           current_review_input_id = ?, base_finding_set_digest = ?, accepted_review_id = ?,
           shared_repair_turns = ?, review_job_count = ?, proof_repair_count = ?,
           revision = revision + 1, updated_at = ?
       WHERE run_id = ? AND round = ? AND stage = ? AND revision = ? AND state = ?`,
    ).bind(
      input.nextState,
      input.candidateId,
      input.headSha,
      input.reviewInputId,
      input.baseFindingSetDigest,
      input.acceptedReviewId,
      input.sharedRepairTurns,
      input.reviewJobCount,
      input.proofRepairCount,
      input.now,
      input.runId,
      input.round,
      input.stage,
      input.expectedRevision,
      input.expectedState,
    ).run();
    if (changes(result) !== 1) throw new Error("trace review phase compare-and-set failed");
    const phase = await this.findPhase(input.runId, input.round, input.stage);
    if (phase === null || phase.revision !== input.expectedRevision + 1 || phase.state !== input.nextState) {
      throw new Error("trace review phase read-back failed");
    }
    return phase;
  }

  findAcceptedInput(reviewInputId: string): Promise<TraceReviewRecord | null> {
    return this.db.prepare(
      "SELECT * FROM trace_reviews WHERE review_input_id = ? AND accepted = 1 LIMIT 1",
    ).bind(reviewInputId).first<TraceReviewRecord>();
  }

  async acceptReview(input: Omit<TraceReviewRecord, "accepted">): Promise<TraceReviewRecord> {
    const proof = await this.db.prepare(
      "SELECT state FROM artifact_manifests WHERE manifest_id = ? LIMIT 1",
    ).bind(input.proof_manifest_id).first<{ state: string }>();
    if (proof?.state !== "complete") throw new Error("review proof is not durable");
    await this.db.prepare(
      `INSERT OR IGNORE INTO trace_reviews
       (review_id, review_input_id, run_id, attempt_id, phase, mode, round,
        candidate_id, reviewed_head_sha, author_model_provider, author_model,
        reviewer_provider, reviewer_model, agent_harness, agent_harness_version,
        reasoning_effort, prompt_version,
        prompt_sha256, tool_version, bundle_sha256, baseline_finding_set_digest,
        proof_manifest_id, sidecar_r2_key, overall_outcome, accepted,
        reused_from_review_id, conflicting_review_id, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    ).bind(
      input.review_id,
      input.review_input_id,
      input.run_id,
      input.attempt_id,
      input.phase,
      input.mode,
      input.round,
      input.candidate_id,
      input.reviewed_head_sha,
      input.author_model_provider,
      input.author_model,
      input.reviewer_provider,
      input.reviewer_model,
      input.agent_harness,
      input.agent_harness_version,
      input.reasoning_effort,
      input.prompt_version,
      input.prompt_sha256,
      input.tool_version,
      input.bundle_sha256,
      input.baseline_finding_set_digest,
      input.proof_manifest_id,
      input.sidecar_r2_key,
      input.overall_outcome,
      input.reused_from_review_id,
      input.conflicting_review_id,
      input.created_at,
      input.completed_at,
    ).run();
    const stored = await this.findAcceptedInput(input.review_input_id);
    if (
      stored?.review_id !== input.review_id ||
      stored.proof_manifest_id !== input.proof_manifest_id ||
      stored.overall_outcome !== input.overall_outcome
    ) throw new Error("accepted review identity mismatch");
    return stored;
  }

  async recordReuse(input: Omit<TraceReviewRecord, "accepted">): Promise<TraceReviewRecord> {
    if (input.reused_from_review_id === null) throw new Error("review reuse source is missing");
    const source = await this.db.prepare(
      `SELECT proof_manifest_id, overall_outcome FROM trace_reviews
       WHERE review_id = ? AND accepted = 1 LIMIT 1`,
    ).bind(input.reused_from_review_id).first<{
      proof_manifest_id: string;
      overall_outcome: string;
    }>();
    if (
      source?.proof_manifest_id !== input.proof_manifest_id ||
      source.overall_outcome !== input.overall_outcome
    ) throw new Error("review reuse source identity mismatch");
    await this.db.prepare(
      `INSERT OR IGNORE INTO trace_reviews
       (review_id, review_input_id, run_id, attempt_id, phase, mode, round,
        candidate_id, reviewed_head_sha, author_model_provider, author_model,
        reviewer_provider, reviewer_model, agent_harness, agent_harness_version,
        reasoning_effort, prompt_version,
        prompt_sha256, tool_version, bundle_sha256, baseline_finding_set_digest,
        proof_manifest_id, sidecar_r2_key, overall_outcome, accepted,
        reused_from_review_id, conflicting_review_id, created_at, completed_at)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    ).bind(
      input.review_id,
      input.review_input_id,
      input.run_id,
      input.phase,
      input.mode,
      input.round,
      input.candidate_id,
      input.reviewed_head_sha,
      input.author_model_provider,
      input.author_model,
      input.reviewer_provider,
      input.reviewer_model,
      input.agent_harness,
      input.agent_harness_version,
      input.reasoning_effort,
      input.prompt_version,
      input.prompt_sha256,
      input.tool_version,
      input.bundle_sha256,
      input.baseline_finding_set_digest,
      input.proof_manifest_id,
      input.sidecar_r2_key,
      input.overall_outcome,
      input.reused_from_review_id,
      input.conflicting_review_id,
      input.created_at,
      input.completed_at,
    ).run();
    const stored = await this.db.prepare(
      "SELECT * FROM trace_reviews WHERE review_id = ? LIMIT 1",
    ).bind(input.review_id).first<TraceReviewRecord>();
    if (stored?.reused_from_review_id !== input.reused_from_review_id || stored.accepted !== 0) {
      throw new Error("review reuse read-back mismatch");
    }
    return stored;
  }

  async bindHead(input: {
    bindingId: string;
    reviewId: string;
    repository: string;
    pullRequestNumber: number;
    headSha: string;
    reviewedFilesDigest: string;
    receiptR2Key: string;
    receiptSha256: string;
    now: string;
  }): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO trace_review_head_bindings
       (binding_id, review_id, repository, pull_request_number, head_sha,
        reviewed_files_digest, comparison_receipt_r2_key, comparison_receipt_sha256, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.bindingId,
      input.reviewId,
      input.repository,
      input.pullRequestNumber,
      input.headSha,
      input.reviewedFilesDigest,
      input.receiptR2Key,
      input.receiptSha256,
      input.now,
    ).run();
    const stored = await this.db.prepare(
      `SELECT review_id, head_sha, reviewed_files_digest,
              comparison_receipt_r2_key, comparison_receipt_sha256
       FROM trace_review_head_bindings WHERE binding_id = ?`,
    ).bind(input.bindingId).first<{
      review_id: string;
      head_sha: string;
      reviewed_files_digest: string;
      comparison_receipt_r2_key: string;
      comparison_receipt_sha256: string;
    }>();
    if (
      stored?.review_id !== input.reviewId || stored.head_sha !== input.headSha ||
      stored.reviewed_files_digest !== input.reviewedFilesDigest ||
      stored.comparison_receipt_r2_key !== input.receiptR2Key ||
      stored.comparison_receipt_sha256 !== input.receiptSha256
    ) throw new Error("review head binding identity mismatch");
  }
}
