import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDesignCandidate,
  DesignCandidateRejectedError,
  isStoredDesignCandidateReplay,
  recoverDesignCandidateCheckedAt,
} from "../src/design-candidate.ts";

const content = `## Context

Use the approved plan.

## Component diagram

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

## Event flow

The service checks the event and saves the result.

## Minimal data model

One row binds the review to one head.

## Failure modes

A wrong head fails closed.
`;

const build = (overrides: Partial<Parameters<typeof buildDesignCandidate>[0]> = {}) =>
  buildDesignCandidate({
    candidateId: "design:attempt-123",
    runId: "workflow:project:issue:run:1",
    round: 1,
    sourceAttemptId: "attempt-123",
    baseCommit: "a".repeat(40),
    change: "sac-200",
    path: "openspec/changes/sac-200/design.md",
    content,
    reviewReplies: [],
    strictOpenSpecCheck: async () => {},
    checkedAt: "2026-09-01T10:00:00.000Z",
    ...overrides,
  });

test("design candidate binds one design path, base, sections, replies, and digest", async () => {
  const first = await build({ reviewReplies: [{ commentId: 42, body: "Added the missing failure path." }] });
  const replay = await build({ reviewReplies: [{ commentId: 42, body: "Added the missing failure path." }] });
  assert.equal(first.candidate.path, "openspec/changes/sac-200/design.md");
  assert.equal(first.candidate.designDigest.length, 64);
  assert.equal(first.candidate.candidateDigest, replay.candidate.candidateDigest);
  assert.equal(first.validation.requiredSections, "passed");
});

test("design candidate rejects extra paths, missing sections, whitespace, and unsafe replies", async () => {
  await assert.rejects(build({ path: "openspec/changes/sac-200/tasks.md" }), DesignCandidateRejectedError);
  await assert.rejects(build({ content: content.replace("## Failure modes\n", "") }), /required section/);
  await assert.rejects(build({ content: content.replace("Use the approved plan.", "Use the approved plan. ") }), /whitespace/);
  await assert.rejects(build({ reviewReplies: [{ commentId: 42, body: "<!-- hidden -->" }] }), /review reply/);
  await assert.rejects(
    build({ content: content.replace("Use the approved plan.", `Use the approved plan.\n\n${"x".repeat(32_000)}`) }),
    /revision context limit/,
  );
});

test("a saved source attempt reuses its round and exact candidate identity", async () => {
  const built = await build({ round: 2, checkedAt: "2026-09-01T10:05:00.000Z" });
  const stored = {
    candidate_id: built.candidate.candidateId,
    run_id: built.candidate.runId,
    round: 2,
    source_attempt_id: built.candidate.sourceAttemptId,
    base_commit: built.candidate.baseCommit,
    change_id: built.candidate.change,
    design_digest: built.candidate.designDigest,
    candidate_digest: built.candidate.candidateDigest,
    state: "validated",
    created_at: built.validation.checkedAt,
    accepted_at: built.validation.checkedAt,
  };
  assert.equal(isStoredDesignCandidateReplay(stored, built.candidate), true);
  assert.equal(isStoredDesignCandidateReplay({ ...stored, round: 3 }, built.candidate), false);
});

test("candidate replay recovers the validation timestamp written before D1", async () => {
  const built = await build({ checkedAt: "2026-09-01T10:05:00.000Z" });
  const bucket = {
    get: async (key: string) => key.endsWith("candidate-validation.json") ? {
      text: async () => JSON.stringify(built.validation),
    } : null,
  } as unknown as R2Bucket;
  assert.equal(
    await recoverDesignCandidateCheckedAt(bucket, built.candidate.runId, built.candidate.candidateId),
    built.validation.checkedAt,
  );
});
