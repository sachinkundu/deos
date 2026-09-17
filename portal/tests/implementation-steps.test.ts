import assert from "node:assert/strict";
import test from "node:test";
import { implementationSteps } from "../src/implementation-steps.ts";
import type { ImplementationProgress } from "../../src/implementation-progress.ts";

const visit = (sequence: number, nodeId: string, enteredAt = "2026-09-15T03:56:17Z") => ({sequence, nodeId, enteredAt});
const progress: ImplementationProgress = {completed: 50, total: 50, source: "author", observedAt: "2026-09-15T04:31:47Z"};
const build = visit(40, "implementation_build");

test("a full checklist stays with Sol until the agent finishes", () => {
  const steps = implementationSteps([build], "active", progress);
  assert.equal(steps.author, "In progress");
  assert.equal(steps.verification, "Upcoming");
  assert.equal(steps.current, "implementation_author");
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
  assert.equal(verifying.author, "Blocked");
  assert.equal(verifying.verification, "Upcoming");
  assert.equal(verifying.description, "Waiting for your reply in Linear.");
  const writing = implementationSteps(history, "awaiting_human", {...progress, completed: 20});
  assert.equal(writing.author, "Blocked");
  assert.equal(writing.verification, "Upcoming");
});

test("publication blocker keeps coding complete while waiting for a human reply",()=>{
  const history=[build,visit(41,'implementation_branch_write'),visit(42,'implementation_publication_question'),visit(43,'implementation_publication_wait')];
  const result=implementationSteps(history,'awaiting_human',progress);
  assert.equal(result.author,'Complete');
  assert.equal(result.verification,'Blocked');
  assert.equal(result.description,'Waiting for your reply in Linear.');
});

test("failure stays on the interrupted step and recovery resets to the new build", () => {
  const history = [build, visit(41, "implementation_failed")];
  assert.equal(implementationSteps(history, "failed", progress).author, "Failed");
  assert.equal(implementationSteps(history, "failed", {...progress, completed: 20}).author, "Failed");
  assert.equal(implementationSteps(history, "canceled", progress).author, "Canceled");
  const recovered = [build, {...history[1], recovered: true}, visit(42, "implementation_build", "2026-09-15T05:00:00Z")];
  assert.equal(implementationSteps(recovered, "active", progress).author, "In progress");
  assert.equal(implementationSteps(recovered, "active", progress).verification, "Upcoming");
});

test("merge recheck reopens verification for the reviewed base", () => {
  const history = [build, visit(41, "implementation_review"), visit(42, "implementation_merge_recheck")];
  assert.equal(implementationSteps(history, "active", null).verification, "In progress");
});

test('independent demo steps are distinct from author task completion and verification',()=>{
  const history=[visit(39,'implementation_demo_plan'),build];
  const plan=implementationSteps(history.slice(0,1),'active',null,{enabled:true,plan:null,gate:null});
  assert.equal(plan.current,'implementation_demo_plan');assert.equal(plan.demoPlan,'In progress');assert.equal(plan.author,'Upcoming');
  const gate=implementationSteps([...history,visit(41,'implementation_demo_gate')],'active',progress,{enabled:true,plan:null,gate:null});
  assert.equal(gate.current,'implementation_demo_gate');assert.equal(gate.verification,'Upcoming');assert.equal(gate.demoGate,'In progress');
  const failed=implementationSteps([...history,visit(41,'implementation_demo_gate'),visit(42,'implementation_failed')],'failed',progress,{enabled:true,plan:null,gate:null});
  assert.equal(failed.demoGate,'Failed');assert.equal(failed.verification,'Upcoming');
  const blocked=implementationSteps([...history,visit(41,'implementation_demo_gate'),visit(42,'implementation_question'),visit(43,'implementation_clarification_wait')],
    'awaiting_human',progress,{enabled:true,plan:null,gate:null});
  assert.equal(blocked.demoGate,'Blocked');assert.equal(blocked.description,'Waiting for your reply in Linear.');
});
