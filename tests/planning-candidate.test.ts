import assert from "node:assert/strict";
import test from "node:test";

import { buildPlanningCandidate } from "../src/planning-candidate.ts";

const easyProposal = `## Why

People need a clear plan. It helps them review work with care.

## What Changes

- Add a clear review step. It checks the plan before approval.

## Capabilities

### New Capabilities

- \`review-step\`: Check the plan before approval.
`;

const easySpec = `## ADDED Requirements

### Requirement: Check the plan

The system SHALL check the plan before a person approves it.

#### Scenario: Plan is ready

- **WHEN** the plan is complete
- **THEN** the system checks it
`;

test("trusted candidate hashes exact repository bytes after deterministic checks", async () => {
  let strictChecks = 0;
  const result = await buildPlanningCandidate({
    candidateId: "candidate:12345678",
    runId: "project:run:12345678",
    round: 1,
    sourceAttemptId: "attempt-12345678",
    baseCommit: "1".repeat(40),
    change: "add-review",
    files: [
      { path: "openspec/changes/add-review/.openspec.yaml", content: "schema: spec-driven\n" },
      { path: "openspec/changes/add-review/proposal.md", content: easyProposal },
      { path: "openspec/changes/add-review/specs/review-step/spec.md", content: easySpec },
    ],
    reviewReplies: [{ commentId: 101, body: "Updated the scenario to state the exact check." }],
    strictOpenSpecCheck: async () => { strictChecks += 1; },
    checkedAt: "2026-08-27T08:00:00.000Z",
  });
  assert.equal(strictChecks, 1);
  assert.equal(result.candidate.files.length, 3);
  assert.equal(result.candidate.files[1].content, easyProposal);
  assert.deepEqual(result.candidate.reviewReplies, [
    { commentId: 101, body: "Updated the scenario to state the exact check." },
  ]);
  assert.equal(result.candidate.candidateDigest.length, 64);
  assert.equal(result.reviewedSources.length, 2);
  assert.equal(result.validation.strictOpenSpec, "passed");
});

test("trusted candidate rejects files outside the standard OpenSpec plan", async () => {
  await assert.rejects(buildPlanningCandidate({
    candidateId: "candidate:12345678",
    runId: "project:run:12345678",
    round: 1,
    sourceAttemptId: "attempt-12345678",
    baseCommit: "1".repeat(40),
    change: "add-review",
    files: [
      { path: "openspec/changes/add-review/.openspec.yaml", content: "schema: spec-driven\n" },
      { path: "openspec/changes/add-review/proposal.md", content: easyProposal },
      { path: "openspec/changes/add-review/specs/review-step/spec.md", content: easySpec },
      { path: "openspec/changes/add-review/tasks.md", content: "not allowed\n" },
    ],
    reviewReplies: [],
    strictOpenSpecCheck: async () => {},
    checkedAt: "2026-08-27T08:00:00.000Z",
  }), /invalid file/);
});

test("trusted candidate reports actionable readability scores", async () => {
  const difficultSpec = `## ADDED Requirements

### Requirement: Demonstrate deterministic comprehensibility

The implementation SHALL institutionalize multidimensional interoperability characteristics before authorization.

#### Scenario: Evaluation occurs

- **WHEN** administrative representatives initiate comprehensive verification
- **THEN** the implementation demonstrates deterministic comprehensibility
`;
  await assert.rejects(buildPlanningCandidate({
    candidateId: "candidate:12345678",
    runId: "project:run:12345678",
    round: 1,
    sourceAttemptId: "attempt-12345678",
    baseCommit: "1".repeat(40),
    change: "add-review",
    files: [
      { path: "openspec/changes/add-review/.openspec.yaml", content: "schema: spec-driven\n" },
      { path: "openspec/changes/add-review/proposal.md", content: easyProposal },
      { path: "openspec/changes/add-review/specs/review-step/spec.md", content: difficultSpec },
    ],
    reviewReplies: [],
    strictOpenSpecCheck: async () => {},
    checkedAt: "2026-08-27T08:00:00.000Z",
  }), /candidate readability failed for .*reading ease .*minimum 70.*grade .*maximum 8/);
});
