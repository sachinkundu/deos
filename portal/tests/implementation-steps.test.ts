import assert from "node:assert/strict";
import test from "node:test";
import { implementationSteps } from "../src/implementation-steps.ts";
import type { ImplementationProgress } from "../../src/implementation-progress.ts";

const visit = (sequence: number, nodeId: string, enteredAt = "2026-09-15T03:56:17Z") => ({sequence, nodeId, enteredAt});
const progress: ImplementationProgress = {completed: 50, total: 50, source: "author", observedAt: "2026-09-15T04:31:47Z"};
const build = visit(40, "implementation_build");

test("a full current checklist starts verification without claiming review readiness", () => {
  const steps = implementationSteps([build], "active", progress);
  assert.equal(steps.author, "Complete");
  assert.equal(steps.verification, "In progress");
  assert.equal(steps.current, "implementation_verification");
  assert.equal(steps.description, "Final checks and end-to-end proof.");
});

test("empty, partial and reopened checklists stay with Author", () => {
  for (const counts of [{completed: 0, total: 0}, {completed: 0, total: 57}, {completed: 49, total: 50}]) {
    const steps = implementationSteps([build], "active", {...progress, ...counts});
    assert.equal(steps.author, "In progress");
    assert.equal(steps.verification, "Upcoming");
    assert.equal(steps.current, "implementation_author");
  }
  assert.equal(implementationSteps([], "active", null).author, "Upcoming");
});

test("a new build cannot inherit a previous full checklist or review", () => {
  const history = [build, visit(41, "implementation_review"), visit(42, "implementation_build", "2026-09-15T05:00:00Z")];
  for (const stale of [progress, {...progress, source: "saved" as const, observedAt: "2026-09-15T05:01:00Z"}, null]) {
    const steps = implementationSteps(history, "active", stale);
    assert.equal(steps.author, "In progress");
    assert.equal(steps.verification, "Upcoming");
  }
  assert.equal(implementationSteps([...history, visit(43, "implementation_rebase_tasks")], "active", progress).verification, "Upcoming");
});

test("proof and publication stay active until the durable review handoff", () => {
  for (const node of ["implementation_proof_check", "implementation_branch_write", "implementation_publish"]) {
    const steps = implementationSteps([build, visit(41, node)], "active", null);
    assert.equal(steps.author, "Complete");
    assert.equal(steps.verification, "In progress");
  }
  const ready = implementationSteps([build, visit(41, "implementation_review")], "awaiting_human", null);
  assert.equal(ready.author, "Complete");
  assert.equal(ready.verification, "Complete");
  assert.equal(ready.description, "Ready for human review.");
  assert.equal(implementationSteps([build, visit(41, "code_merged")], "succeeded", null).verification, "Complete");
});

test("clarification pauses the unfinished step and never completes verification", () => {
  const history = [build, visit(41, "implementation_question"), visit(42, "implementation_clarification_wait")];
  const verifying = implementationSteps(history, "awaiting_human", progress);
  assert.equal(verifying.author, "Complete");
  assert.equal(verifying.verification, "Blocked");
  assert.equal(verifying.description, "Waiting for your reply in Linear.");
  const writing = implementationSteps(history, "awaiting_human", {...progress, completed: 20});
  assert.equal(writing.author, "Blocked");
  assert.equal(writing.verification, "Upcoming");
});

test("failure stays on the interrupted step and recovery resets to the new build", () => {
  const history = [build, visit(41, "implementation_failed")];
  assert.equal(implementationSteps(history, "failed", progress).verification, "Failed");
  assert.equal(implementationSteps(history, "failed", {...progress, completed: 20}).author, "Failed");
  assert.equal(implementationSteps(history, "canceled", progress).verification, "Canceled");
  const recovered = [build, {...history[1], recovered: true}, visit(42, "implementation_build", "2026-09-15T05:00:00Z")];
  assert.equal(implementationSteps(recovered, "active", progress).author, "In progress");
  assert.equal(implementationSteps(recovered, "active", progress).verification, "Upcoming");
});

test("merge recheck reopens verification for the reviewed base", () => {
  const history = [build, visit(41, "implementation_review"), visit(42, "implementation_merge_recheck")];
  assert.equal(implementationSteps(history, "active", null).verification, "In progress");
});
