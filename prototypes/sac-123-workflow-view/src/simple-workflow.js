import { sac130RecordedRun } from "./sac-130-recorded-run.js";

export const simpleWorkflowPresentation = Object.freeze({
  id: "simple",
  label: "Simple planning workflow",
  version: 5,
  startNode: "claim_issue",
  stages: [
    {
      id: "claim",
      label: "Claim issue",
      phase: "Start",
      kind: "action",
      icon: "claim",
      nodeIds: ["claim_issue"],
      result: "Issue delegated and started",
      summary: "Confirm the issue is ready, preserve its owner, and start the governed run.",
      agents: [],
      files: [],
      x: 40,
      y: 54,
    },
    {
      id: "planning",
      label: "Create planning PR",
      phase: "Plan",
      kind: "agent",
      icon: "planning",
      nodeIds: ["openspec_planning"],
      result: "Proposal and specifications ready",
      summary: "Create or revise one planning pull request with the proposal and specifications.",
      agents: ["Planning Agent"],
      files: ["proposal.md", "specs/.../spec.md"],
      x: 330,
      y: 54,
    },
    {
      id: "review",
      label: "Human approval",
      phase: "Approval",
      kind: "gate",
      icon: "review",
      nodeIds: ["planning_review"],
      result: "Plan approved for merge",
      summary: "Approve in Linear by moving the issue to Merging, request a revision, or cancel the run.",
      agents: [],
      files: [],
      x: 620,
      y: 54,
    },
    {
      id: "merge",
      label: "Automatic merge & check",
      phase: "Finish",
      kind: "action",
      icon: "merge",
      nodeIds: ["merge_planning_pr"],
      result: "Planning pull request merged",
      summary: "Automatically merge the approved planning pull request using its recorded identity and exact head.",
      agents: [],
      files: [],
      x: 620,
      y: 252,
    },
    {
      id: "complete",
      label: "Completed",
      phase: "Outcome",
      kind: "action",
      icon: "complete",
      nodeIds: ["done"],
      result: "Workflow completed successfully",
      summary: "The planning workflow reached its successful terminal outcome.",
      agents: [],
      files: [],
      x: 330,
      y: 252,
    },
    {
      id: "stopped",
      label: "Stopped",
      phase: "Outcome",
      kind: "terminal",
      icon: "stopped",
      nodeIds: ["canceled", "agent_blocked", "agent_failed", "system_action_failed"],
      result: "Workflow ended without a merge",
      summary: "Cancellation, blocked planning, agent failure, and trusted action failure end here.",
      agents: [],
      files: [],
      x: 40,
      y: 252,
    },
  ],
  nodeToStage: {
    claim_issue: "claim",
    openspec_planning: "planning",
    planning_review: "review",
    merge_planning_pr: "merge",
    done: "complete",
    canceled: "stopped",
    agent_blocked: "stopped",
    agent_failed: "stopped",
    system_action_failed: "stopped",
  },
  connections: [
    { source: "claim", target: "planning", kind: "forward", sourceHandle: "right-out", targetHandle: "left" },
    { source: "planning", target: "review", kind: "forward", sourceHandle: "right-out", targetHandle: "left" },
    { source: "review", target: "planning", kind: "return", label: "Revision requested", sourceHandle: "top-out", targetHandle: "top" },
    { source: "review", target: "merge", kind: "forward", sourceHandle: "bottom", targetHandle: "top" },
    { source: "merge", target: "complete", kind: "forward", sourceHandle: "left-out", targetHandle: "right" },
    { source: "claim", target: "stopped", kind: "branch", sourceHandle: "bottom", targetHandle: "top" },
    { source: "planning", target: "stopped", kind: "branch", sourceHandle: "bottom", targetHandle: "top" },
    { source: "review", target: "stopped", kind: "branch", sourceHandle: "top-out", targetHandle: "right" },
    { source: "merge", target: "stopped", kind: "branch", sourceHandle: "bottom", targetHandle: "bottom-in" },
  ],
});

export const simpleWorkflowIssues = Object.freeze({
  "SAC-130": sac130RecordedRun,
});

export function cycleCountForStage(stage, issue, status, isCurrent) {
  if (!stage.cycleBased || (status !== "completed" && !isCurrent)) return 0;
  return issue.cycles?.[stage.id] ?? 0;
}

export function runCountForStage(stage, issue, status, isCurrent) {
  if (!stage.agents?.length || (status !== "completed" && !isCurrent)) return 0;
  return issue.runs?.[stage.id] ?? 0;
}
