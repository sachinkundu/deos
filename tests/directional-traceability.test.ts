import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error The pinned BettaView bundle is JavaScript by design.
import { normalizeDirectionalJudgments, validateDirectionalJudgment } from "../vendor/bettaview/src/review-traceability.js";

const inventory = {
  change: "add-review",
  documents: [{
    file: "proposal.md",
    source: [
      "## What Changes",
      "",
      "- Add a review step.",
      "",
      "## Capabilities",
      "",
      "### New Capabilities",
      "",
      "- `review-step`: Review the plan.",
    ].join("\n"),
    sha256: "a".repeat(64),
  }, {
    file: "specs/review-step/spec.md",
    source: "## ADDED Requirements\n\n### Requirement: Review the plan\n",
    sha256: "b".repeat(64),
  }],
  proposalStatements: [{ startLine: 3, endLine: 3 }],
  requirements: [{
    id: "review-step-requirement-3",
    capability: "review-step",
    specFile: "specs/review-step/spec.md",
    specStartLine: 3,
  }],
};

const passingJudgment = {
  coverage: "sufficient",
  scope: "in_scope",
  minimality: "minimal",
  rationale: "The requirement is clear and in scope.",
};

test("one-sided semantic links are valid evidence and remain visible as disagreements", () => {
  const proposalFirst = {
    proposalStatements: [{
      proposalLine: 3,
      requirementLinkIds: ["review-step-requirement-3"],
      coverage: "sufficient",
      rationale: "The requirement implements the proposed review step.",
    }],
  };
  const requirementFirst = {
    passingJudgment,
    capabilities: [{
      path: "review-step",
      capabilityLine: 9,
      judgment: passingJudgment,
      links: [{
        id: "review-step-requirement-3",
        proposalLines: [9],
        specStartLine: 3,
        judgment: passingJudgment,
      }],
    }],
    findings: [],
  };

  assert.doesNotThrow(() => validateDirectionalJudgment("proposal_to_spec", proposalFirst, inventory));
  assert.doesNotThrow(() => validateDirectionalJudgment("spec_to_proposal", requirementFirst, inventory));
  const normalized = normalizeDirectionalJudgments({ proposalFirst, requirementFirst }, {
    inventory,
    reviewerVersion: "test reviewer",
    reviewedAt: "2026-08-28T08:00:00.000Z",
  });

  assert.equal(normalized.directionalLinks.length, 1);
  assert.deepEqual(normalized.directionalLinks.map((link: { status: string }) => link.status), ["proposal_only"]);
  assert.equal(normalized.review.overall, "findings");
});
