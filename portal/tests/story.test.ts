import assert from "node:assert/strict";
import test from "node:test";
import { ReviewStoryReadStore } from "../src/story.ts";

const digest = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

test("pull request story keeps failed attempts and selects a verified exact-head trace", async () => {
  const runId = "workflow:99426d9b-cda7-4db4-9136-692a95a0b090:dcde8049-91b0-4f81-a6ad-ca57b3f968a1:run:1";
  const reviewAttempt = "01a04805-0f3e-7643-a22d-aafbd9bde4eb";
  const failedAttempt = "01a0473e-9c2f-7bf9-83d4-df80a9f44245";
  const authorAttempt = "01a04729-5143-74b3-8e00-461ce7f6cbde";
  const sidecar = new TextEncoder().encode(JSON.stringify({
    version: 4,
    change: "add-calculator-cli",
    review: { documents: [{ file: "proposal.md", sha256: "a".repeat(64) }] },
    links: [],
    proposalStatements: [],
    directionalLinks: [],
  }));
  const normalized = new TextEncoder().encode(JSON.stringify({ review: { overall: "pass" } }));
  const failure = new TextEncoder().encode(JSON.stringify({ category: "codex_exit_nonzero" }));
  const authorCompletion = new TextEncoder().encode(JSON.stringify({ outcome: "passed", rounds: [] }));
  const rows = [
    { attempt_id: authorAttempt, logical_name: "author-completion.json", r2_key: "author", media_type: "application/json", byte_size: authorCompletion.byteLength, sha256: await digest(authorCompletion) },
    { attempt_id: reviewAttempt, logical_name: "bettaview-traceability.json", r2_key: "trace", media_type: "application/json", byte_size: sidecar.byteLength, sha256: await digest(sidecar) },
    { attempt_id: reviewAttempt, logical_name: "normalized-review.json", r2_key: "normalized", media_type: "application/json", byte_size: normalized.byteLength, sha256: await digest(normalized) },
    { attempt_id: failedAttempt, logical_name: "failure-summary.json", r2_key: "failure", media_type: "application/json", byte_size: failure.byteLength, sha256: await digest(failure) },
  ];
  const datasets = (query: string): Record<string, unknown>[] => {
    if (query.includes("FROM trace_review_phases")) return [{ round: 1, stage: "independent", state: "closed_pass", updated_at: "2026-08-28T11:03:18Z" }];
    if (query.includes("FROM trace_reviews WHERE")) return [{
      review_id: `review:${reviewAttempt}`,
      review_input_id: "input",
      attempt_id: reviewAttempt,
      phase: "independent",
      mode: "discovery",
      round: 1,
      candidate_id: "candidate:one",
      reviewed_head_sha: "1".repeat(40),
      reviewer_provider: "openrouter",
      reviewer_model: "deepseek/deepseek-v4-pro",
      agent_harness: "codex",
      overall_outcome: "pass",
      accepted: 1,
      created_at: "2026-08-28T10:58:06Z",
      completed_at: "2026-08-28T11:03:18Z",
    }];
    if (query.includes("FROM planning_candidates")) return [{ candidate_id: "candidate:one", round: 1, state: "validated", created_at: "2026-08-28T10:50:00Z" }];
    if (query.includes("FROM trace_review_head_bindings")) return [{ review_id: `review:${reviewAttempt}`, head_sha: "1".repeat(40), created_at: "2026-08-28T11:03:19Z" }];
    if (query.includes("FROM agent_attempts WHERE")) return [
      { attempt_id: authorAttempt, node_id: "planning_author", state: "completed", result_class: "completed", cleanup_state: "destroyed", created_at: "2026-08-28T06:58:05Z" },
      { attempt_id: failedAttempt, node_id: "independent_discovery", state: "failed", result_class: "codex_exit_nonzero", cleanup_state: "destroyed", created_at: "2026-08-28T07:21:20Z" },
      { attempt_id: reviewAttempt, node_id: "independent_discovery", state: "completed", result_class: "pass", cleanup_state: "destroyed", created_at: "2026-08-28T10:58:06Z" },
    ];
    if (query.includes("JOIN artifacts artifact") && query.includes("attempt.run_id = ?")) return rows;
    if (query.includes("FROM workflow_transitions_v2")) return [];
    if (query.includes("FROM provider_operations")) return [];
    if (query.includes("FROM workflow_waits")) return [];
    if (query.includes("FROM cleanup_work_items")) return [];
    throw new Error(`Unexpected query: ${query}`);
  };
  const db = {
    prepare(query: string) {
      return {
        bind: (..._values: unknown[]) => ({
          first: async () => {
            if (!query.includes("FROM run_work_products work")) throw new Error(`Unexpected first query: ${query}`);
            return {
              run_id: runId,
              run_status: "awaiting_human",
              current_node: "planning_review",
              definition_version: 12,
              workflow_instance_id: "workflow-instance",
              run_created_at: "2026-08-28T06:58:00Z",
              run_updated_at: "2026-08-28T11:10:00Z",
              issue_key: "SAC-139",
              issue_title: "Specify a calculator CLI",
              linear_url: "https://linear.app/example/issue/SAC-139",
              repository: "sachinkundu/deos-sample-project",
              pull_request_number: 5,
              pull_request_url: "https://github.com/sachinkundu/deos-sample-project/pull/5",
              head_sha: "1".repeat(40),
              change_id: "add-calculator-cli",
            };
          },
          all: async () => ({ results: datasets(query) }),
        }),
      };
    },
  } as unknown as D1Database;
  const objects = new Map<string, Uint8Array>([["trace", sidecar], ["normalized", normalized], ["failure", failure], ["author", authorCompletion]]);
  const bucket = {
    get: async (key: string) => {
      const value = objects.get(key);
      return value ? { arrayBuffer: async () => value.buffer } : null;
    },
  } as unknown as R2Bucket;

  const story = await new ReviewStoryReadStore(db, bucket)
    .projection("sachinkundu/deos-sample-project", 5) as Record<string, any>;
  assert.equal(story.governed.issue.key, "SAC-139");
  assert.equal(story.acceptedTrace.reviewId, `review:${reviewAttempt}`);
  assert.deepEqual(story.acceptedTrace.manifest, JSON.parse(new TextDecoder().decode(sidecar)));
  const failed = story.events.find((event: any) => event.id === `attempt:${failedAttempt}`);
  assert.equal(failed.data.state, "failed");
  assert.deepEqual(failed.data.content["failure-summary.json"], { category: "codex_exit_nonzero" });
  const accepted = story.events.find((event: any) => event.id === `attempt:${reviewAttempt}`);
  assert.deepEqual(accepted.data.content["normalized-review.json"], { review: { overall: "pass" } });
  assert.match(accepted.data.artifacts[0].url, /^\/api\/process-attempts\//);
  const author = story.events.find((event: any) => event.id === `attempt:${authorAttempt}`);
  assert.deepEqual(author.data.content["author-completion.json"], { outcome: "passed", rounds: [] });
});
