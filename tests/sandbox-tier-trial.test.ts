import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildTierTrialReport } from "../src/sandbox-tier-trial.ts";

const controls = {
  repository: "owner/repo",
  base: "a".repeat(40),
  workflow: "definition",
  author: ["codex", "same-model", "high"],
  reviewer: ["claude", "review-model", "high"],
};
const controlsDigest = createHash("sha256")
  .update(JSON.stringify(controls))
  .digest("hex");
const fixture = () => {
  const members = (["basic", "standard-2"] as const).map((tier, index) => ({
    comparison_id: "trial",
    pair_id: "pair",
    issue_id: `issue-${index}`,
    workload_digest: "b".repeat(64),
    controls_digest: controlsDigest,
    planned_tier: tier,
    launch_order: index + 1,
    run_id: `run-${index}`,
  }));
  const runs = members.map((member) => ({
    run_id: member.run_id,
    status: "succeeded",
    sandbox_tier: member.planned_tier,
    definition_digest: controls.workflow,
    route_repository: controls.repository,
    author_model_provider: "codex",
    author_model: "same-model",
    author_reasoning: "high",
    independent_review_provider: "claude",
    independent_review_model: "review-model",
    independent_review_reasoning: "high",
  }));
  const attempts = runs.map((run, index) => ({
    attempt_id: `attempt-${index}`,
    run_id: run.run_id,
    node_id: "author",
    visit_sequence: 1,
    sandbox_tier: run.sandbox_tier,
    started_at: "2026-09-12T00:00:00Z",
    ended_at: `2026-09-12T00:00:0${index + 1}Z`,
    state: "completed",
    created_at: "2026-09-12T00:00:00Z",
    job_spec_json: JSON.stringify({ checkoutCommit: controls.base }),
  }));
  return { members, runs, attempts };
};
test("paired report keeps failures and retries separate from first-pass success", async () => {
  const { members, runs, attempts } = fixture();
  attempts[0].state = "failed";
  attempts.push({ ...attempts[0], attempt_id: "retry", state: "completed" });
  const report = await buildTierTrialReport("trial", members, runs, attempts);
  assert.equal(report.exclusions.length, 0);
  assert.deepEqual(report.groups[0], {
    tier: "basic",
    stage: "author",
    completedAttemptCount: 2,
    medianElapsedMs: 1000,
    firstPassSuccessCount: 0,
    failedAttemptCount: 1,
    retryCount: 1,
  });
  assert.deepEqual(report.pairedElapsedDifferences, [
    { pairId: "pair", standard2MinusBasicMs: 0 },
  ]);
});
test("tier mismatch retains binding and excludes both members", async () => {
  const { members, runs, attempts } = fixture();
  runs[1].sandbox_tier = "basic";
  const report = await buildTierTrialReport("trial", members, runs, attempts);
  assert.equal(report.exclusions[0].reason, "planned_tier_mismatch");
  assert.equal(report.members[1].run_id, "run-1");
  assert.equal(report.groups[0].completedAttemptCount, 0);
  assert.equal(report.groups[0].medianElapsedMs, null);
});
test("changed frozen controls and incomplete attempts cannot enter the comparison", async () => {
  const { members, runs, attempts } = fixture();
  runs[1].author_model = "other";
  assert.equal(
    (await buildTierTrialReport("trial", members, runs, attempts)).exclusions[0]
      .reason,
    "frozen_controls_mismatch",
  );
  runs[1].author_model = "same-model";
  runs[1].status = "active";
  assert.equal(
    (await buildTierTrialReport("trial", members, runs, attempts)).exclusions[0]
      .reason,
    "incomplete_attempts",
  );
});
