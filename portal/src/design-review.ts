const RUN_ID = /^workflow:[0-9a-f-]+:[0-9a-f-]+:run:[1-9][0-9]*$/i;
const REVIEW_ATTEMPT_ID = /^design-review:[0-9a-f-]{36}$/i;
const ALLOWED_ARTIFACTS = new Set([
  "raw-review-output.json",
  "normalized-review.json",
  "design-review-input.json",
  "candidate-inventory.json",
  "review-validation.txt",
  "transcript.jsonl",
]);

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export class DesignReviewNotFoundError extends Error {}
export class DesignReviewArtifactError extends Error {}

export const designReviewSelfStatus = (required: unknown): "required" | "not_required" =>
  required === 1 ? "required" : "not_required";

export const supportsDesignReview = (definitionVersion: unknown): boolean =>
  typeof definitionVersion === "number" && definitionVersion >= 19;

export const designReviewFreshness = (input: {
  phase: unknown;
  round: unknown;
  reviewedHeadSha: unknown;
  currentHeadSha: unknown;
  hasInitialIndependentReview: boolean;
}): "current" | "stale" | "historical" | "private" => {
  if (input.reviewedHeadSha === null) {
    return input.phase === "self" && input.round === 1 && input.hasInitialIndependentReview
      ? "historical"
      : "private";
  }
  return input.reviewedHeadSha === input.currentHeadSha ? "current" : "stale";
};

export class DesignReviewReadStore {
  private readonly db: D1Database;
  private readonly artifacts: R2Bucket;

  constructor(db: D1Database, artifacts: R2Bucket) {
    this.db = db;
    this.artifacts = artifacts;
  }

  async projection(runId: string): Promise<Record<string, unknown> | null> {
    if (!RUN_ID.test(runId)) return null;
    const run = await this.db.prepare(
      `SELECT run.run_id, run.status, run.updated_at, run.definition_id, run.definition_version,
              issue.issue_key, issue.title, issue.linear_url, work.repository,
              work.pull_request_number, work.pull_request_url, work.head_sha
       FROM orchestration_runs run
       JOIN project_workflow_policies route ON route.project_id = run.project_id
       JOIN linear_issue_index issue
         ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
       LEFT JOIN design_work_products work ON work.run_id = run.run_id
       WHERE run.run_id = ? LIMIT 1`,
    ).bind(runId).first<Record<string, unknown>>();
    if (run === null) return null;
    const rounds = await this.db.prepare(
      `SELECT round_id, round_no, kind, self_required, author_provider, author_model,
              author_reasoning, outside_provider, outside_model, outside_reasoning,
              status, response_turns, created_at, updated_at
       FROM design_review_rounds WHERE run_id = ? ORDER BY round_no`,
    ).bind(runId).all<Record<string, unknown>>();
    const attempts = await this.db.prepare(
      `SELECT attempt.review_attempt_id, attempt.round_id, round.round_no, attempt.phase,
              attempt.input_sha256, attempt.candidate_id, attempt.pr_database_id,
              attempt.head_sha, attempt.model_provider, attempt.model, attempt.reasoning,
              attempt.outcome, attempt.evidence_manifest_id, attempt.accepted,
              attempt.created_at, attempt.completed_at
       FROM design_review_attempts attempt
       JOIN design_review_rounds round ON round.round_id = attempt.round_id
       WHERE round.run_id = ? ORDER BY round.round_no, attempt.created_at, attempt.review_attempt_id`,
    ).bind(runId).all<Record<string, unknown>>();
    const attemptDtos = await Promise.all(attempts.results.map(async (attempt) => {
      const reviewAttemptId = String(attempt.review_attempt_id);
      const [findings, dispositions, artifacts] = await Promise.all([
        this.db.prepare(
          `SELECT finding_id, severity, category, message, source_ranges_json
           FROM design_review_findings WHERE review_attempt_id = ? ORDER BY finding_id`,
        ).bind(reviewAttemptId).all<Record<string, unknown>>(),
        this.db.prepare(
          `SELECT finding_id, disposition, reason, resulting_candidate_id, created_at
           FROM design_review_dispositions WHERE review_attempt_id = ? ORDER BY finding_id`,
        ).bind(reviewAttemptId).all<Record<string, unknown>>(),
        attempt.evidence_manifest_id === null ? Promise.resolve({ results: [] }) : this.db.prepare(
          `SELECT logical_name, sha256, byte_size FROM artifacts
           WHERE manifest_id = ? AND policy_outcome = 'accepted' ORDER BY logical_name`,
        ).bind(attempt.evidence_manifest_id).all<Record<string, unknown>>(),
      ]);
      return {
        id: reviewAttemptId,
        round: attempt.round_no,
        phase: attempt.phase,
        inputSha256: attempt.input_sha256,
        candidateId: attempt.candidate_id,
        pullRequestDatabaseId: attempt.pr_database_id,
        reviewedHeadSha: attempt.head_sha,
        reviewer: { provider: attempt.model_provider, model: attempt.model, reasoning: attempt.reasoning },
        outcome: attempt.outcome,
        accepted: attempt.accepted === 1,
        startedAt: attempt.created_at,
        completedAt: attempt.completed_at,
        findings: findings.results.map((finding) => ({
          id: finding.finding_id,
          severity: finding.severity,
          category: finding.category,
          message: finding.message,
          sourceRanges: JSON.parse(String(finding.source_ranges_json)) as unknown,
          disposition: dispositions.results.find((value) => value.finding_id === finding.finding_id) ?? null,
        })),
        artifacts: artifacts.results.filter((artifact) => ALLOWED_ARTIFACTS.has(String(artifact.logical_name))).map((artifact) => ({
          name: artifact.logical_name,
          sha256: artifact.sha256,
          byteSize: artifact.byte_size,
          url: `/api/design-reviews/${encodeURIComponent(reviewAttemptId)}/artifacts/${encodeURIComponent(String(artifact.logical_name))}`,
        })),
      };
    }));
    const bindings = await this.db.prepare(
      `SELECT visit_sequence, round_id, pr_database_id, head_sha, self_review_attempt_id,
              independent_review_attempt_id, independent_input_sha256, created_at
       FROM design_gate_bindings WHERE run_id = ? ORDER BY visit_sequence`,
    ).bind(runId).all<Record<string, unknown>>();
    return {
      run,
      supported: supportsDesignReview(run.definition_version),
      rounds: rounds.results.map((round) => ({
        ...round,
        selfStatus: designReviewSelfStatus(round.self_required),
      })),
      attempts: attemptDtos.map((attempt) => ({
        ...attempt,
        freshness: designReviewFreshness({
          phase: attempt.phase,
          round: attempt.round,
          reviewedHeadSha: attempt.reviewedHeadSha,
          currentHeadSha: run.head_sha,
          hasInitialIndependentReview: attemptDtos.some((value) => value.round === 1 && value.phase === "independent"),
        }),
      })),
      gateBindings: bindings.results,
    };
  }

  async artifact(reviewAttemptId: string, logicalName: string): Promise<{
    bytes: ArrayBuffer; mediaType: string; sha256: string;
  }> {
    if (!REVIEW_ATTEMPT_ID.test(reviewAttemptId) || !ALLOWED_ARTIFACTS.has(logicalName)) {
      throw new DesignReviewNotFoundError();
    }
    const row = await this.db.prepare(
      `SELECT artifact.r2_key, artifact.media_type, artifact.sha256
       FROM design_review_attempts review
       JOIN design_review_rounds round ON round.round_id = review.round_id
       JOIN orchestration_runs run ON run.run_id = round.run_id
       JOIN project_workflow_policies route ON route.project_id = run.project_id
       JOIN artifact_manifests manifest ON manifest.manifest_id = review.evidence_manifest_id
       JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
       WHERE review.review_attempt_id = ? AND review.accepted = 1
         AND manifest.state = 'complete' AND artifact.logical_name = ?
         AND artifact.policy_outcome = 'accepted' LIMIT 1`,
    ).bind(reviewAttemptId, logicalName).first<{ r2_key: string; media_type: string; sha256: string }>();
    if (row === null) throw new DesignReviewNotFoundError();
    const object = await this.artifacts.get(row.r2_key);
    if (object === null) throw new DesignReviewArtifactError();
    const bytes = await object.arrayBuffer();
    if (await sha256Hex(bytes) !== row.sha256) throw new DesignReviewArtifactError();
    return { bytes, mediaType: row.media_type, sha256: row.sha256 };
  }
}
