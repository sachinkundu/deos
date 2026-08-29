const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const ATTEMPT_ID = /^[0-9a-f-]{36}$/i;

const ALLOWED_STORY_ARTIFACTS = new Set([
  "author-completion.json",
  "bettaview-traceability.json",
  "candidate-inventory.json",
  "failure-summary.json",
  "normalized-review.json",
  "patch.diff",
  "provider-references.json",
  "raw-review-output.json",
  "result.json",
  "review-dispositions.json",
  "review-replies.json",
  "status.json",
  "trace-validation.txt",
  "transcript.jsonl",
  "validation.txt",
]);

const INLINE_JSON_ARTIFACTS = new Set([
  "failure-summary.json",
  "normalized-review.json",
  "result.json",
  "review-dispositions.json",
]);

const sha256Hex = async (bytes: ArrayBuffer): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

interface GovernedPullRequestRow {
  run_id: string;
  run_status: string;
  current_node: string;
  definition_version: number;
  workflow_instance_id: string;
  run_created_at: string;
  run_updated_at: string;
  issue_key: string;
  issue_title: string;
  linear_url: string;
  repository: string;
  pull_request_number: number;
  pull_request_url: string;
  head_sha: string;
  change_id: string;
}

interface StoryArtifactRow {
  attempt_id: string;
  logical_name: string;
  r2_key: string;
  media_type: string;
  byte_size: number;
  sha256: string;
}

export class ReviewStoryNotFoundError extends Error {}
export class ReviewStoryArtifactError extends Error {}

const artifactUrl = (attemptId: string, logicalName: string): string =>
  `/api/process-attempts/${encodeURIComponent(attemptId)}/artifacts/${encodeURIComponent(logicalName)}`;

export class ReviewStoryReadStore {
  private readonly db: D1Database;
  private readonly artifacts: R2Bucket;
  private readonly projectId: string;

  constructor(db: D1Database, artifacts: R2Bucket, projectId: string) {
    this.db = db;
    this.artifacts = artifacts;
    this.projectId = projectId;
  }

  private async verifiedBytes(row: StoryArtifactRow): Promise<ArrayBuffer> {
    const object = await this.artifacts.get(row.r2_key);
    if (object === null) throw new ReviewStoryArtifactError(`${row.logical_name} is unavailable`);
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== row.byte_size || await sha256Hex(bytes) !== row.sha256) {
      throw new ReviewStoryArtifactError(`${row.logical_name} failed verification`);
    }
    return bytes;
  }

  private async inlineJson(row: StoryArtifactRow): Promise<unknown> {
    const bytes = await this.verifiedBytes(row);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ReviewStoryArtifactError(`${row.logical_name} is not valid JSON`);
    }
  }

  async projection(repository: string, pullRequestNumber: number): Promise<Record<string, unknown> | null> {
    if (!REPOSITORY.test(repository) || !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) return null;
    const governed = await this.db.prepare(
      `SELECT run.run_id, run.status AS run_status, run.current_node,
              run.definition_version, run.workflow_instance_id,
              run.created_at AS run_created_at, run.updated_at AS run_updated_at,
              issue.issue_key, issue.title AS issue_title, issue.linear_url,
              work.repository, work.pull_request_number, work.pull_request_url,
              work.head_sha, work.change_id
       FROM run_work_products work
       JOIN orchestration_runs run ON run.run_id = work.run_id
       JOIN linear_issue_index issue
         ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
       WHERE work.repository = ? AND work.pull_request_number = ?
         AND run.project_id = ? LIMIT 1`,
    ).bind(repository, pullRequestNumber, this.projectId).first<GovernedPullRequestRow>();
    if (governed === null) return null;

    const runId = governed.run_id;
    const [phaseRows, reviewRows, candidateRows, bindingRows, attemptRows, artifactRows,
      transitionRows, providerRows, waitRows, cleanupRows] = await Promise.all([
      this.db.prepare(
        `SELECT round, stage, state, current_candidate_id, current_head_sha,
                shared_repair_turns, review_job_count, proof_repair_count, updated_at
         FROM trace_review_phases WHERE run_id = ? ORDER BY round, stage`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT review_id, review_input_id, attempt_id, phase, mode, round,
                candidate_id, reviewed_head_sha, author_model_provider, author_model,
                reviewer_provider, reviewer_model, reasoning_effort, prompt_version,
                tool_version, bundle_sha256, overall_outcome, accepted,
                reused_from_review_id, conflicting_review_id, created_at, completed_at,
                agent_harness, agent_harness_version
         FROM trace_reviews WHERE run_id = ? ORDER BY created_at, review_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT candidate_id, round, base_commit, change_id, candidate_digest,
                review_set_digest, state, created_at, accepted_at
         FROM planning_candidates WHERE run_id = ? ORDER BY created_at, candidate_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT binding.review_id, binding.repository, binding.pull_request_number,
                binding.head_sha, binding.reviewed_files_digest, binding.created_at
         FROM trace_review_head_bindings binding
         JOIN trace_reviews review ON review.review_id = binding.review_id
         WHERE review.run_id = ? ORDER BY binding.created_at`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT attempt_id, node_id, visit_sequence, state, result_class,
                cleanup_state, cleanup_error_category, created_at, started_at,
                ended_at, manifest_id
         FROM agent_attempts WHERE run_id = ? ORDER BY created_at, attempt_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT attempt.attempt_id, artifact.logical_name, artifact.r2_key,
                artifact.media_type, artifact.byte_size, artifact.sha256
         FROM agent_attempts attempt
         JOIN artifact_manifests manifest
           ON manifest.manifest_id = attempt.manifest_id AND manifest.run_id = attempt.run_id
         JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
         WHERE attempt.run_id = ? AND manifest.state = 'complete'
           AND artifact.policy_outcome = 'accepted'
         ORDER BY attempt.created_at, artifact.logical_name`,
      ).bind(runId).all<StoryArtifactRow>(),
      this.db.prepare(
        `SELECT transition_id, from_node, to_node, from_visit_sequence,
                to_visit_sequence, cause_type, cause_reference, actor_type,
                provider_operation_id, occurred_at
         FROM workflow_transitions_v2 WHERE run_id = ? ORDER BY occurred_at, transition_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT operation_id, attempt_id, capability, action, sanitized_target,
                state, provider_resource_id, safe_error_category, diagnostic_id,
                started_at, updated_at, completed_at
         FROM provider_operations WHERE run_id = ? ORDER BY started_at, operation_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT wait_id, node_id, visit_sequence, status, resume_event_type,
                cancel_event_type, cause_reference, created_at, consumed_at
         FROM workflow_waits WHERE run_id = ? ORDER BY created_at, wait_id`,
      ).bind(runId).all<Record<string, unknown>>(),
      this.db.prepare(
        `SELECT sandbox_id, attempt_id, cleanup_state, safe_error_category,
                created_at, updated_at, last_attempt_at
         FROM cleanup_work_items WHERE run_id = ? ORDER BY created_at, sandbox_id`,
      ).bind(runId).all<Record<string, unknown>>(),
    ]);

    const artifactsByAttempt = new Map<string, Array<Record<string, unknown>>>();
    const artifactRowByKey = new Map<string, StoryArtifactRow>();
    for (const row of artifactRows.results) {
      if (!ALLOWED_STORY_ARTIFACTS.has(row.logical_name)) continue;
      artifactRowByKey.set(`${row.attempt_id}:${row.logical_name}`, row);
      const list = artifactsByAttempt.get(row.attempt_id) ?? [];
      list.push({
        name: row.logical_name,
        mediaType: row.media_type,
        byteSize: row.byte_size,
        sha256: row.sha256,
        url: artifactUrl(row.attempt_id, row.logical_name),
      });
      artifactsByAttempt.set(row.attempt_id, list);
    }

    const inlineByAttempt = new Map<string, Record<string, unknown>>();
    for (const row of artifactRows.results) {
      if (!INLINE_JSON_ARTIFACTS.has(row.logical_name) || !ALLOWED_STORY_ARTIFACTS.has(row.logical_name)) continue;
      try {
        const values = inlineByAttempt.get(row.attempt_id) ?? {};
        values[row.logical_name] = await this.inlineJson(row);
        inlineByAttempt.set(row.attempt_id, values);
      } catch (error) {
        const values = inlineByAttempt.get(row.attempt_id) ?? {};
        values[row.logical_name] = {
          unavailable: true,
          reason: error instanceof Error ? error.message : "artifact verification failed",
        };
        inlineByAttempt.set(row.attempt_id, values);
      }
    }

    const reviewByAttempt = new Map(reviewRows.results
      .filter((row) => typeof row.attempt_id === "string")
      .map((row) => [row.attempt_id as string, row]));
    const attempts = attemptRows.results.map((attempt) => ({
      ...attempt,
      review: reviewByAttempt.get(attempt.attempt_id as string) ?? null,
      artifacts: artifactsByAttempt.get(attempt.attempt_id as string) ?? [],
      content: inlineByAttempt.get(attempt.attempt_id as string) ?? {},
    }));

    const acceptedIndependent = [...reviewRows.results].reverse().find((review) =>
      review.accepted === 1 && review.phase === "independent" &&
      review.reviewed_head_sha === governed.head_sha && typeof review.attempt_id === "string");
    const acceptedFallback = [...reviewRows.results].reverse().find((review) =>
      review.accepted === 1 && typeof review.attempt_id === "string");
    const traceReview = acceptedIndependent ?? acceptedFallback ?? null;
    let acceptedTrace: Record<string, unknown> | null = null;
    if (traceReview !== null) {
      const row = artifactRowByKey.get(`${traceReview.attempt_id as string}:bettaview-traceability.json`);
      if (row !== undefined) {
        try {
          acceptedTrace = {
            reviewId: traceReview.review_id,
            attemptId: traceReview.attempt_id,
            reviewedHeadSha: traceReview.reviewed_head_sha,
            round: traceReview.round,
            phase: traceReview.phase,
            outcome: traceReview.overall_outcome,
            sha256: row.sha256,
            manifest: await this.inlineJson(row),
          };
        } catch (error) {
          acceptedTrace = {
            reviewId: traceReview.review_id,
            unavailable: true,
            reason: error instanceof Error ? error.message : "trace verification failed",
          };
        }
      }
    }

    const events = [
      ...attempts.map((attempt) => ({
        id: `attempt:${String((attempt as Record<string, unknown>).attempt_id)}`,
        type: "attempt",
        time: (attempt as Record<string, unknown>).created_at,
        data: attempt,
      })),
      ...transitionRows.results.map((transition) => ({
        id: `transition:${transition.transition_id}`,
        type: "transition",
        time: transition.occurred_at,
        data: transition,
      })),
      ...providerRows.results.map((operation) => ({
        id: `provider:${operation.operation_id}`,
        type: "provider",
        time: operation.started_at,
        data: operation,
      })),
      ...waitRows.results.map((wait) => ({
        id: `wait:${wait.wait_id}`,
        type: "wait",
        time: wait.created_at,
        data: wait,
      })),
      ...cleanupRows.results.map((cleanup) => ({
        id: `cleanup:${cleanup.sandbox_id}`,
        type: "cleanup",
        time: cleanup.created_at,
        data: cleanup,
      })),
    ].sort((left, right) => String(left.time).localeCompare(String(right.time)) || left.id.localeCompare(right.id));

    return {
      governed: {
        runId,
        status: governed.run_status,
        currentNode: governed.current_node,
        definitionVersion: governed.definition_version,
        workflowInstanceId: governed.workflow_instance_id,
        startedAt: governed.run_created_at,
        updatedAt: governed.run_updated_at,
        issue: { key: governed.issue_key, title: governed.issue_title, url: governed.linear_url },
        pullRequest: {
          repository: governed.repository,
          number: governed.pull_request_number,
          url: governed.pull_request_url,
          recordedHeadSha: governed.head_sha,
        },
        change: governed.change_id,
      },
      phases: phaseRows.results,
      reviews: reviewRows.results,
      candidates: candidateRows.results,
      headBindings: bindingRows.results,
      events,
      acceptedTrace,
    };
  }

  async artifact(attemptId: string, logicalName: string): Promise<{
    bytes: ArrayBuffer;
    mediaType: string;
    sha256: string;
  }> {
    if (!ATTEMPT_ID.test(attemptId) || !ALLOWED_STORY_ARTIFACTS.has(logicalName)) {
      throw new ReviewStoryNotFoundError();
    }
    const row = await this.db.prepare(
      `SELECT attempt.attempt_id, artifact.logical_name, artifact.r2_key,
              artifact.media_type, artifact.byte_size, artifact.sha256
       FROM agent_attempts attempt
       JOIN orchestration_runs run ON run.run_id = attempt.run_id
       JOIN artifact_manifests manifest
         ON manifest.manifest_id = attempt.manifest_id AND manifest.run_id = attempt.run_id
       JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
       WHERE attempt.attempt_id = ? AND run.project_id = ?
         AND manifest.state = 'complete' AND artifact.logical_name = ?
         AND artifact.policy_outcome = 'accepted' LIMIT 1`,
    ).bind(attemptId, this.projectId, logicalName).first<StoryArtifactRow>();
    if (row === null) throw new ReviewStoryNotFoundError();
    return { bytes: await this.verifiedBytes(row), mediaType: row.media_type, sha256: row.sha256 };
  }
}
