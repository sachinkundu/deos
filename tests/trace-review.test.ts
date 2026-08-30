import assert from "node:assert/strict";
import test from "node:test";

import {
  canBindReviewToHead,
  deriveReviewOutcome,
  findingSetDigest,
  LATER_ROUND_REVIEW_STAGES,
  nextRepairTurn,
  reviewInputId,
  validateClosedSetRecheck,
  workflowOutcomeForReview,
  type TraceFinding,
} from "../src/trace-review.ts";

const digest = "a".repeat(64);
const findings: readonly TraceFinding[] = [{
  id: "missing-gate",
  type: "missing_coverage",
  message: "The proposal does not cover the approval gate.",
  capability: "workflow-state",
  allowedRanges: [{
    path: "openspec/changes/add-review/proposal.md",
    startLine: 10,
    endLine: 12,
  }],
}];

test("later human revision rounds initialize only the final-head trace phase", () => {
  assert.deepEqual(LATER_ROUND_REVIEW_STAGES, ["independent"]);
});

test("review input identity covers exact sources, models, mode, and tool bundle", async () => {
  const input = {
    stage: "self_check" as const,
    mode: "discovery" as const,
    round: 1,
    candidateDigest: digest,
    reviewedHeadSha: null,
    sources: [
      { path: "proposal.md", sha256: digest },
      { path: "specs/workflow-state/spec.md", sha256: "b".repeat(64) },
    ],
    baselineFindingSetDigest: null,
    author: { harness: "codex" as const, harnessVersion: "0.147.0", provider: "codex" as const, model: "gpt-5.6-sol", reasoning: "high" },
    reviewer: { harness: "codex" as const, harnessVersion: "0.147.0", provider: "codex" as const, model: "gpt-5.6-sol", reasoning: "high" },
    promptVersion: "trace-v2",
    promptSha256: "c".repeat(64),
    toolVersion: "bundle-v1",
    bundleSha256: "d".repeat(64),
  };
  const first = await reviewInputId(input);
  const second = await reviewInputId({ ...input, sources: [...input.sources].reverse() });
  const changed = await reviewInputId({ ...input, round: 2 });
  const changedHarness = await reviewInputId({
    ...input,
    author: { ...input.author, harnessVersion: "0.151.0" },
    reviewer: { ...input.reviewer, harnessVersion: "0.151.0" },
  });
  assert.equal(first, second);
  assert.notEqual(first, changed);
  assert.notEqual(first, changedHarness);
  assert.equal(first.length, 64);
});

test("independent review rejects the author model and requires an exact head", async () => {
  const common = {
    stage: "independent" as const,
    mode: "discovery" as const,
    round: 1,
    candidateDigest: digest,
    reviewedHeadSha: "1".repeat(40),
    sources: [
      { path: "proposal.md", sha256: digest },
      { path: "specs/workflow-state/spec.md", sha256: "b".repeat(64) },
    ],
    baselineFindingSetDigest: null,
    author: { harness: "codex" as const, harnessVersion: "0.147.0", provider: "codex" as const, model: "same/model", reasoning: "high" },
    reviewer: { harness: "codex" as const, harnessVersion: "0.147.0", provider: "openrouter" as const, model: "same/model", reasoning: "high" },
    promptVersion: "trace-v2",
    promptSha256: "c".repeat(64),
    toolVersion: "bundle-v1",
    bundleSha256: "d".repeat(64),
  };
  await assert.rejects(reviewInputId(common), /must differ/);
  await assert.rejects(reviewInputId({
    ...common,
    reviewedHeadSha: null,
    reviewer: { ...common.reviewer, model: "another/model" },
  }), /requires a head/);
});

test("closed-set recheck rates every original finding and cannot expand the inventory", async () => {
  const baselineFindingSetDigest = await findingSetDigest(findings);
  const accepted = await validateClosedSetRecheck(findings, {
    mode: "recheck",
    baselineFindingSetDigest,
    resolutions: [{
      findingId: "missing-gate",
      status: "fixed",
      rationale: "The approval rule is now present.",
      currentEvidence: [{
        path: "openspec/changes/add-review/proposal.md",
        startLine: 10,
        endLine: 12,
      }],
      causalSourceDigest: "e".repeat(64),
    }],
    sidecar: {},
  });
  assert.equal(deriveReviewOutcome(accepted).outcome, "pass");
  await assert.rejects(validateClosedSetRecheck(findings, {
    mode: "recheck",
    baselineFindingSetDigest,
    resolutions: [...accepted, { ...accepted[0], findingId: "new-finding" }],
    sidecar: {},
  }), /every baseline finding once/);
});

test("same-stage rating reversal without source cause becomes a proof conflict", () => {
  const outcome = deriveReviewOutcome([{
    findingId: "missing-gate",
    status: "still_present",
    rationale: "The concern is still visible.",
    currentEvidence: [{
      path: "openspec/changes/add-review/proposal.md",
      startLine: 10,
      endLine: 12,
    }],
    causalSourceDigest: null,
  }], new Set(["missing-gate"]));
  assert.equal(outcome.outcome, "proof_conflict");
  assert.deepEqual(outcome.conflictingFindingIds, ["missing-gate"]);
});

test("head rebinding requires the complete reviewed path and hash list", () => {
  const sources = [
    { path: "proposal.md", sha256: digest },
    { path: "specs/workflow-state/spec.md", sha256: "b".repeat(64) },
  ];
  assert.equal(canBindReviewToHead(sources, [...sources].reverse()), true);
  assert.equal(canBindReviewToHead(sources, [sources[0], { ...sources[1], sha256: "c".repeat(64) }]), false);
});

test("shared author repair turns stop exactly at three", () => {
  assert.equal(nextRepairTurn(0), 1);
  assert.equal(nextRepairTurn(2), 3);
  assert.throws(() => nextRepairTurn(3), /exhausted/);
});

test("independent semantic concerns complete the external stage for human judgment", () => {
  assert.equal(workflowOutcomeForReview("independent", "pass", 0), "pass");
  assert.equal(workflowOutcomeForReview("independent", "findings", 0), "pass");
  assert.equal(workflowOutcomeForReview("independent", "proof_conflict", 3), "pass");
  assert.equal(workflowOutcomeForReview("self_check", "findings", 2), "findings");
  assert.equal(workflowOutcomeForReview("self_check", "findings", 3), "needs_judgment");
});
