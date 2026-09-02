import assert from "node:assert/strict";
import test from "node:test";
import {
  approvalEvidenceLinks,
  authorVisitStatus,
  isDesignStageWorkflow,
  isPlanningAuthorVisit,
  latestPhaseId,
  phaseDisplayStatus,
  phaseForVisit,
  stoppedPhaseSourceId,
  selectedApprovalEvidenceUrls,
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

test("shared Human Review stays upcoming until both planning and design gates exist", () => {
  const planningOnly = workflowPhases([
    visit(1, "claim_issue", "claim"),
    visit(2, "planning_review", "review", "plan"),
    visit(3, "design_author", "design"),
  ]).find((phase) => phase.id === "approval");
  assert.ok(planningOnly);
  assert.equal(phaseDisplayStatus(planningOnly, "design", "active"), "Upcoming");

  const bothGates = workflowPhases([
    visit(1, "planning_review", "review", "plan"),
    visit(2, "design_review", "review", "design"),
    visit(3, "merge_design_pr", "design_merge"),
  ]).find((phase) => phase.id === "approval");
  assert.ok(bothGates);
  assert.equal(phaseDisplayStatus(bothGates, "design", "active"), "Complete");
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
  assert.equal(authorVisitStatus({ leftAt: null, attempts: [] }, "active"), "In progress");
  assert.equal(authorVisitStatus({ leftAt: "2026-09-01T12:00:00.000Z", attempts: [] }, "active"), "Complete");
  assert.equal(authorVisitStatus({ leftAt: null, attempts: [] }, "failed"), "Complete");
  assert.equal(authorVisitStatus(null, "active"), "Upcoming");
});

test("planning and design author failures remain visible in their nested substeps", () => {
  const ended = "2026-09-01T12:00:00.000Z";
  assert.equal(authorVisitStatus({
    leftAt: ended,
    attempts: [{ state: "completed", outcome: "failed" }],
  }, "failed"), "Failed");
  assert.equal(authorVisitStatus({
    leftAt: ended,
    attempts: [{ state: "completed", outcome: "invalid_design_candidate" }],
  }, "failed"), "Failed");
  assert.equal(authorVisitStatus({
    leftAt: ended,
    attempts: [{ state: "completed", outcome: "blocked" }],
  }, "blocked"), "Blocked");
});

test("planning author selection includes revisions and excludes independent final trace", () => {
  assert.equal(isPlanningAuthorVisit(visit(8, "planning_revision_author", "planning")), true);
  assert.equal(isPlanningAuthorVisit(visit(10, "final_trace", "independent_review")), false);
});

test("the substantive phase that stops retains its terminal failure status", () => {
  const visits = [
    visit(1, "claim_issue", "claim"),
    visit(2, "design_author", "design"),
    visit(3, "agent_failed", "stopped"),
  ];
  const phases = workflowPhases(visits);
  const design = phases.find((phase) => phase.id === "design");
  const stopped = phases.find((phase) => phase.id === "stopped");
  assert.ok(design);
  assert.ok(stopped);
  assert.equal(stoppedPhaseSourceId(visits), "design");
  assert.equal(phaseDisplayStatus(design, "stopped", "failed", "design"), "Failed");
  assert.equal(phaseDisplayStatus(stopped, "stopped", "failed", "design"), "Failed");
  assert.equal(phaseDisplayStatus(design, "stopped", "blocked", "design"), "Blocked");
  assert.equal(phaseDisplayStatus(design, "stopped", "canceled", "design"), "Canceled");
});

test("human review collects and selects evidence from the preceding publication visit", () => {
  const planLink = { url: "https://github.com/acme/repo/pull/10" };
  const designLink = { url: "https://github.com/acme/repo/pull/11" };
  const visits = [
    { sequence: 5, nodeId: "publish_initial", gate: null, links: [planLink] },
    { sequence: 6, nodeId: "publish_author_response", gate: null, links: [] },
    { sequence: 7, nodeId: "planning_review", gate: { gate_kind: "plan" as const }, links: [] },
    { sequence: 9, nodeId: "publish_design", gate: null, links: [designLink] },
    { sequence: 10, nodeId: "design_review", gate: { gate_kind: "design" as const }, links: [] },
  ];
  assert.deepEqual(approvalEvidenceLinks(visits), [planLink, designLink]);
  assert.deepEqual(selectedApprovalEvidenceUrls(visits, 7), [planLink.url]);
  assert.deepEqual(selectedApprovalEvidenceUrls(visits, 10), [designLink.url]);
});
