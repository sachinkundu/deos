const RUN_ID = /^workflow:[0-9a-f-]+:[0-9a-f-]+:run:[1-9][0-9]*$/i;
const REVIEW_ID = /^review:[0-9a-f-]{36}$/i;
const ALLOWED_ARTIFACTS = new Set([
  "raw-review-output.json",
  "normalized-review.json",
  "bettaview-traceability.json",
  "candidate-inventory.json",
  "trace-validation.txt",
  "transcript.jsonl",
]);

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

interface PhaseRow {
  run_id: string;
  round: number;
  stage: string;
  state: string;
  current_candidate_id: string;
  current_head_sha: string | null;
  shared_repair_turns: number;
  review_job_count: number;
  proof_repair_count: number;
  revision: number;
  updated_at: string;
}

interface ReviewRow {
  review_id: string;
  review_input_id: string;
  phase: string;
  mode: string;
  round: number;
  candidate_id: string;
  reviewed_head_sha: string | null;
  author_model_provider: string;
  author_model: string;
  reviewer_provider: string;
  reviewer_model: string;
  reasoning_effort: string;
  prompt_version: string;
  tool_version: string;
  bundle_sha256: string;
  baseline_finding_set_digest: string | null;
  proof_manifest_id: string;
  overall_outcome: string;
  reused_from_review_id: string | null;
  conflicting_review_id: string | null;
  created_at: string;
  completed_at: string | null;
}

interface CandidateRow {
  candidate_id: string;
  round: number;
  base_commit: string;
  change_id: string;
  candidate_digest: string;
  review_set_digest: string;
  candidate_r2_key: string;
  candidate_sha256: string;
  state: string;
  created_at: string;
}

interface ArtifactRow {
  logical_name: string;
  sha256: string;
  byte_size: number;
}

export class TraceReviewNotFoundError extends Error {}
export class TraceReviewArtifactError extends Error {}

export class TraceReviewReadStore {
  private readonly db: D1Database;
  private readonly artifacts: R2Bucket;
  private readonly projectId: string;

  constructor(
    db: D1Database,
    artifacts: R2Bucket,
    projectId: string,
  ) {
    this.db = db;
    this.artifacts = artifacts;
    this.projectId = projectId;
  }

  async projection(runId: string): Promise<Record<string, unknown> | null> {
    if (!RUN_ID.test(runId)) return null;
    const run = await this.db.prepare(
      `SELECT run.run_id, run.status, run.updated_at, issue.issue_key,
              issue.title, issue.linear_url, work.repository, work.pull_request_number,
              work.pull_request_url, work.head_sha
       FROM orchestration_runs run
       JOIN linear_issue_index issue
         ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
       LEFT JOIN run_work_products work ON work.run_id = run.run_id
       WHERE run.run_id = ? AND run.project_id = ? LIMIT 1`,
    ).bind(runId, this.projectId).first<Record<string, unknown>>();
    if (run === null) return null;
    const [phases, reviews, candidates, bindings] = await Promise.all([
      this.db.prepare(
        "SELECT * FROM trace_review_phases WHERE run_id = ? ORDER BY round, stage",
      ).bind(runId).all<PhaseRow>(),
      this.db.prepare(
        `SELECT * FROM trace_reviews WHERE run_id = ? AND (accepted = 1 OR reused_from_review_id IS NOT NULL)
         ORDER BY round, created_at, review_id`,
      ).bind(runId).all<ReviewRow>(),
      this.db.prepare(
        `SELECT candidate_id, round, base_commit, change_id, candidate_digest,
                review_set_digest, candidate_r2_key, candidate_sha256, state, created_at
         FROM planning_candidates WHERE run_id = ? ORDER BY round, created_at`,
      ).bind(runId).all<CandidateRow>(),
      this.db.prepare(
        `SELECT binding.review_id, binding.head_sha, binding.reviewed_files_digest,
                binding.created_at
         FROM trace_review_head_bindings binding
         JOIN trace_reviews review ON review.review_id = binding.review_id
         WHERE review.run_id = ? ORDER BY binding.created_at`,
      ).bind(runId).all<Record<string, unknown>>(),
    ]);
    const reviewDtos = await Promise.all(reviews.results.map(async (review) => {
      const result = await this.db.prepare(
        `SELECT logical_name, sha256, byte_size FROM artifacts
         WHERE manifest_id = ? AND policy_outcome = 'accepted'
         ORDER BY logical_name`,
      ).bind(review.proof_manifest_id).all<ArtifactRow>();
      return {
        id: review.review_id,
        inputId: review.review_input_id,
        stage: review.phase,
        mode: review.mode,
        round: review.round,
        candidateId: review.candidate_id,
        reviewedHeadSha: review.reviewed_head_sha,
        author: { provider: review.author_model_provider, model: review.author_model },
        reviewer: {
          provider: review.reviewer_provider,
          model: review.reviewer_model,
          reasoning: review.reasoning_effort,
        },
        promptVersion: review.prompt_version,
        toolVersion: review.tool_version,
        bundleSha256: review.bundle_sha256,
        findingSetDigest: review.baseline_finding_set_digest,
        outcome: review.overall_outcome,
        reusedFromReviewId: review.reused_from_review_id,
        conflictingReviewId: review.conflicting_review_id,
        startedAt: review.created_at,
        completedAt: review.completed_at,
        artifacts: result.results
          .filter((artifact) => ALLOWED_ARTIFACTS.has(artifact.logical_name))
          .map((artifact) => ({
            name: artifact.logical_name,
            sha256: artifact.sha256,
            byteSize: artifact.byte_size,
            url: `/api/reviews/${encodeURIComponent(review.reused_from_review_id ?? review.review_id)}/artifacts/${encodeURIComponent(artifact.logical_name)}`,
          })),
      };
    }));
    const candidateDtos = await Promise.all(candidates.results.map(async (candidate) => {
      const object = await this.artifacts.get(candidate.candidate_r2_key);
      if (object === null) throw new TraceReviewArtifactError();
      const bytes = await object.arrayBuffer();
      if (await sha256Hex(bytes) !== candidate.candidate_sha256) throw new TraceReviewArtifactError();
      const durable = JSON.parse(new TextDecoder().decode(bytes)) as {
        reviewDispositions?: unknown;
        reviewContextId?: unknown;
      };
      if (durable.reviewDispositions !== undefined && !Array.isArray(durable.reviewDispositions)) {
        throw new TraceReviewArtifactError();
      }
      return {
        id: candidate.candidate_id,
        round: candidate.round,
        baseCommit: candidate.base_commit,
        change: candidate.change_id,
        digest: candidate.candidate_digest,
        reviewSetDigest: candidate.review_set_digest,
        state: candidate.state,
        createdAt: candidate.created_at,
        reviewDispositions: durable.reviewDispositions ?? [],
        reviewContextId: typeof durable.reviewContextId === "string" ? durable.reviewContextId : null,
      };
    }));
    return {
      run,
      phases: phases.results.map((phase) => ({
        round: phase.round,
        stage: phase.stage,
        state: phase.state,
        candidateId: phase.current_candidate_id,
        reviewedHeadSha: phase.current_head_sha,
        sharedRepairTurns: phase.shared_repair_turns,
        reviewJobs: phase.review_job_count,
        proofRepairs: phase.proof_repair_count,
        revision: phase.revision,
        updatedAt: phase.updated_at,
      })),
      candidates: candidateDtos,
      reviews: reviewDtos,
      headBindings: bindings.results,
    };
  }

  async artifact(reviewId: string, logicalName: string): Promise<{
    bytes: ArrayBuffer;
    mediaType: string;
    sha256: string;
  }> {
    if (!REVIEW_ID.test(reviewId) || !ALLOWED_ARTIFACTS.has(logicalName)) {
      throw new TraceReviewNotFoundError();
    }
    const row = await this.db.prepare(
      `SELECT artifact.r2_key, artifact.media_type, artifact.sha256
       FROM trace_reviews review
       JOIN orchestration_runs run ON run.run_id = review.run_id
       JOIN artifact_manifests manifest ON manifest.manifest_id = review.proof_manifest_id
       JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
       LEFT JOIN trace_reviews source ON source.review_id = review.reused_from_review_id
       WHERE review.review_id = ? AND (review.accepted = 1 OR source.accepted = 1)
         AND run.project_id = ? AND manifest.state = 'complete'
         AND artifact.logical_name = ? AND artifact.policy_outcome = 'accepted'
       LIMIT 1`,
    ).bind(reviewId, this.projectId, logicalName).first<{
      r2_key: string;
      media_type: string;
      sha256: string;
    }>();
    if (row === null) throw new TraceReviewNotFoundError();
    const object = await this.artifacts.get(row.r2_key);
    if (object === null) throw new TraceReviewArtifactError();
    const bytes = await object.arrayBuffer();
    if (await sha256Hex(bytes) !== row.sha256) throw new TraceReviewArtifactError();
    return { bytes, mediaType: row.media_type, sha256: row.sha256 };
  }
}
