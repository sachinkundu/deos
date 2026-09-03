import assert from "node:assert/strict";
import test from "node:test";

import {
  designReviewGateEligible,
  validateDesignReviewDispositions,
  validateDesignReviewInput,
  validateDesignReviewResult,
  type DesignReviewInput,
} from "../src/design-review.ts";
import { designReviewOutputSchema } from "../container/design-review-schema.mjs";

test("Codex design review schema types every constrained property", () => {
  assert.equal(designReviewOutputSchema.properties.version.type, "integer");
  assert.equal(designReviewOutputSchema.properties.phase.type, "string");
  assert.equal(designReviewOutputSchema.properties.outcome.type, "string");
  assert.equal(designReviewOutputSchema.properties.findings.items.properties.severity.type, "string");
  assert.equal(designReviewOutputSchema.properties.findings.items.properties.category.type, "string");
});

const input = (phase: "self" | "independent" = "self"): DesignReviewInput => ({
  version: 1,
  runId: "workflow:project-1:issue-1:run:1",
  round: 1,
  phase,
  candidateId: "design:attempt-1",
  candidateSha256: "a".repeat(64),
  approvedPlanManifestSha256: "b".repeat(64),
  baseCommit: "c".repeat(40),
  guidanceManifestSha256: "d".repeat(64),
  sources: [
    { path: "openspec/changes/sac-200/.openspec.yaml", sha256: "0".repeat(64) },
    { path: "openspec/changes/sac-200/proposal.md", sha256: "e".repeat(64) },
    { path: "openspec/changes/sac-200/design.md", sha256: "f".repeat(64) },
  ],
  modelProvider: phase === "self" ? "codex" : "openrouter",
  model: phase === "self" ? "gpt-5.6-sol" : "outside/model",
  reasoning: "high",
  pullRequestDatabaseId: phase === "self" ? null : "PR_node",
  headSha: phase === "self" ? null : "1".repeat(40),
});

test("canonical design review inputs bind model, context, and exact head", async () => {
  const first = await validateDesignReviewInput(input("independent"));
  const second = await validateDesignReviewInput({
    ...input("independent"),
    sources: [...input("independent").sources].reverse(),
  });
  assert.equal(first.inputSha256, second.inputSha256);
  assert.equal(first.inputSha256.length, 64);
  await assert.rejects(
    validateDesignReviewInput({ ...input("independent"), headSha: null }),
    /independent design review input is invalid/,
  );
  await assert.rejects(
    validateDesignReviewInput({ ...input("self"), modelProvider: "openrouter" }),
    /self design review input is invalid/,
  );
  await assert.rejects(
    validateDesignReviewInput({
      ...input(),
      sources: [
        ...input().sources,
        { path: "openspec/changes/sac-200/.env", sha256: "1".repeat(64) },
      ],
    }),
    /design review source is invalid/,
  );
});

test("design result validation keeps a closed finding inventory", async () => {
  const trusted = await validateDesignReviewInput(input());
  const result = validateDesignReviewResult({
    version: 1,
    inputSha256: trusted.inputSha256,
    phase: "self",
    outcome: "concerns",
    summary: "One failure path needs a decision.",
    findings: [{
      id: "missing-r2-failure",
      severity: "high",
      category: "operability",
      message: "The design does not say what happens when evidence read-back fails.",
      sourceRanges: [{
        path: "openspec/changes/sac-200/design.md",
        startLine: 10,
        endLine: 12,
      }],
    }],
  }, {
    inputSha256: trusted.inputSha256,
    phase: "self",
    sourcePaths: new Set(trusted.input.sources.map((source) => source.path)),
  });
  assert.equal(result.findings[0]?.id, "missing-r2-failure");
  assert.throws(() => validateDesignReviewResult({ ...result, outcome: "pass" }, {
    inputSha256: trusted.inputSha256,
    phase: "self",
    sourcePaths: new Set(trusted.input.sources.map((source) => source.path)),
  }), /outcome does not match/);
});

test("every outside concern requires exactly one bounded author disposition", () => {
  const findings = [{ id: "finding-a" }, { id: "finding-b" }];
  const dispositions = validateDesignReviewDispositions(findings, [
    { findingId: "finding-b", status: "declined", reason: "The invariant already covers it." },
    { findingId: "finding-a", status: "applied", reason: "Added the missing failure branch." },
  ]);
  assert.deepEqual(dispositions.map((item) => item.findingId), ["finding-a", "finding-b"]);
  assert.throws(
    () => validateDesignReviewDispositions(findings, [dispositions[0]!]),
    /inventory is incomplete/,
  );
});

test("design gate eligibility requires current exact-head proof and complete accounting", () => {
  const eligible = {
    selfRequired: true,
    selfAccepted: { candidateId: "design:1", outcome: "pass" },
    publishedCandidateId: "design:1",
    independentAccepted: {
      candidateId: "design:1",
      prDatabaseId: "PR_node",
      headSha: "a".repeat(40),
      outcome: "concerns",
      findingCount: 2,
      dispositionCount: 2,
    },
    currentPrDatabaseId: "PR_node",
    currentHeadSha: "a".repeat(40),
    unresolvedAttempts: 0,
  };
  assert.equal(designReviewGateEligible(eligible), true);
  assert.equal(designReviewGateEligible({ ...eligible, currentHeadSha: "b".repeat(40) }), false);
  assert.equal(designReviewGateEligible({ ...eligible, currentPrDatabaseId: "different" }), false);
  assert.equal(designReviewGateEligible({ ...eligible, unresolvedAttempts: 1 }), false);
  assert.equal(designReviewGateEligible({
    ...eligible,
    independentAccepted: { ...eligible.independentAccepted, candidateId: "design:stale" },
  }), false);
  assert.equal(designReviewGateEligible({
    ...eligible,
    independentAccepted: { ...eligible.independentAccepted, dispositionCount: 1 },
  }), false);
  assert.equal(designReviewGateEligible({
    ...eligible,
    selfAccepted: { candidateId: "design:1", outcome: "concerns" },
  }), false);
  assert.equal(designReviewGateEligible({
    ...eligible,
    selfRequired: false,
    selfAccepted: null,
  }), true);
});

test("review input context changes invalidate exact-input reuse", async () => {
  const first = await validateDesignReviewInput(input("independent"));
  for (const changed of [
    { ...input("independent"), approvedPlanManifestSha256: "0".repeat(64) },
    { ...input("independent"), guidanceManifestSha256: "1".repeat(64) },
    { ...input("independent"), baseCommit: "2".repeat(40) },
    { ...input("independent"), model: "outside/other-model" },
  ]) {
    assert.notEqual((await validateDesignReviewInput(changed)).inputSha256, first.inputSha256);
  }
});
