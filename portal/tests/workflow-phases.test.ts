import assert from "node:assert/strict";
import test from "node:test";
import {
  authorVisitStatus,
  isDesignStageWorkflow,
  isPlanningAuthorVisit,
  latestPhaseId,
  phaseDisplayStatus,
  phaseForVisit,
  workflowPhases,
  type PhaseVisitLike,
} from "../src/workflow-phases.ts";

const visit = (
  sequence: number,
  nodeId: string,
  stageId: string,
  gateKind: "plan" | "design" | null = null,
): PhaseVisitLike => ({
  sequence,
  nodeId,
  stageId,
  gate: gateKind === null ? null : { gate_kind: gateKind, round: 1, decision_outcome: null },
});

test("version 17 folds granular nodes into progressive planning and design phases", () => {
  const visits = [
    visit(1, "claim_issue", "claim"),
    visit(2, "planning_author", "planning"),
    visit(7, "independent_discovery", "independent_review"),
    visit(12, "planning_review", "review", "plan"),
    visit(14, "verify_planning_merge", "plan_merge"),
    visit(15, "design_author", "design"),
    visit(17, "design_review", "review", "design"),
    visit(22, "merge_design_pr", "design_merge"),
    visit(23, "done", "complete"),
  ];
  assert.deepEqual(workflowPhases(visits).map((phase) => [phase.id, phase.visits.length]), [
    ["claim", 1],
    ["planning", 3],
    ["approval", 2],
    ["design", 2],
    ["complete", 1],
  ]);
  assert.equal(latestPhaseId(visits), "complete");
});

test("gate kind disambiguates the shared Human Review presentation stage", () => {
  assert.equal(phaseForVisit(visit(12, "planning_review", "review", "plan")), "approval");
  assert.equal(phaseForVisit(visit(17, "design_review", "review", "design")), "approval");
});

test("the grouped view is selected only for a design-stage definition", () => {
  assert.equal(isDesignStageWorkflow(17, [{ id: "design" }]), true);
  assert.equal(isDesignStageWorkflow(16, [{ id: "design" }]), false);
  assert.equal(isDesignStageWorkflow(17, [{ id: "planning" }]), false);
});

test("a visited current phase stays in progress until the run is terminal", () => {
  const phases = workflowPhases([
    visit(1, "claim_issue", "claim"),
    visit(2, "planning_author", "planning"),
  ]);
  const planning = phases.find((phase) => phase.id === "planning");
  assert.ok(planning);
  assert.equal(phaseDisplayStatus(planning, "planning", "active"), "In progress");
  assert.equal(phaseDisplayStatus(planning, "design", "active"), "Complete");
});

test("a recovered terminal visit does not add a stopped phase or replace the current phase", () => {
  const visits = [
    visit(1, "claim_issue", "claim"),
    { ...visit(2, "blocked", "stopped"), recovered: true },
    visit(3, "planning_author", "planning"),
  ];
  assert.deepEqual(workflowPhases(visits).map((phase) => phase.id), [
    "claim", "planning", "approval", "design", "complete",
  ]);
  assert.equal(latestPhaseId(visits), "planning");
});

test("an unfinished author visit stays in progress until the run is terminal", () => {
  assert.equal(authorVisitStatus({ leftAt: null }, "active"), "In progress");
  assert.equal(authorVisitStatus({ leftAt: "2026-09-01T12:00:00.000Z" }, "active"), "Complete");
  assert.equal(authorVisitStatus({ leftAt: null }, "failed"), "Complete");
  assert.equal(authorVisitStatus(null, "active"), "Upcoming");
});

test("planning author selection includes revisions and excludes independent final trace", () => {
  assert.equal(isPlanningAuthorVisit(visit(8, "planning_revision_author", "planning")), true);
  assert.equal(isPlanningAuthorVisit(visit(10, "final_trace", "independent_review")), false);
});
