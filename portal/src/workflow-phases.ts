export type WorkflowPhaseId = "claim" | "planning" | "approval" | "design" | "complete" | "stopped";

export interface PhaseVisitLike {
  sequence: number;
  nodeId: string;
  stageId: string;
  recovered?: boolean;
  gate: { gate_kind: "plan" | "design"; round: number; decision_outcome: string | null } | null;
}

export interface WorkflowPhase {
  id: WorkflowPhaseId;
  label: string;
  visits: PhaseVisitLike[];
}

const PHASE_LABELS: Record<WorkflowPhaseId, string> = {
  claim: "Claim issue",
  planning: "Planning",
  approval: "Human Review",
  design: "Design",
  complete: "Completed",
  stopped: "Stopped",
};

export const phaseForVisit = (visit: Pick<PhaseVisitLike, "nodeId" | "stageId" | "gate">): WorkflowPhaseId | null => {
  if (visit.stageId === "claim") return "claim";
  if (["planning_review", "design_review"].includes(visit.nodeId) || visit.gate !== null) return "approval";
  if (["planning", "independent_review", "plan_merge"].includes(visit.stageId)) return "planning";
  if (["design", "design_merge"].includes(visit.stageId)) return "design";
  if (visit.stageId === "complete") return "complete";
  if (visit.stageId === "stopped") return "stopped";
  return null;
};

export const workflowPhases = (visits: PhaseVisitLike[]): WorkflowPhase[] => {
  const visibleVisits = visits.filter((visit) => visit.recovered !== true);
  const order: WorkflowPhaseId[] = ["claim", "planning", "approval", "design", "complete"];
  if (visibleVisits.some((visit) => phaseForVisit(visit) === "stopped")) order.push("stopped");
  return order.map((id) => ({
    id,
    label: PHASE_LABELS[id],
    visits: visibleVisits.filter((visit) => phaseForVisit(visit) === id),
  }));
};

export const isDesignStageWorkflow = (
  definitionVersion: number,
  stages: Array<{ id: string }>,
): boolean => definitionVersion >= 17 && stages.some((stage) => stage.id === "design");

export const latestPhaseId = (visits: PhaseVisitLike[]): WorkflowPhaseId | null => {
  const latest = visits.filter((visit) => visit.recovered !== true)
    .sort((left, right) => right.sequence - left.sequence)[0];
  return latest === undefined ? null : phaseForVisit(latest);
};

export const stoppedPhaseSourceId = (visits: PhaseVisitLike[]): WorkflowPhaseId | null => {
  const phases = visits.filter((visit) => visit.recovered !== true)
    .sort((left, right) => right.sequence - left.sequence)
    .map(phaseForVisit);
  if (phases[0] !== "stopped") return null;
  return phases.find((phase) => phase !== null && phase !== "stopped" && phase !== "complete") ?? null;
};

const terminalPhaseStatus = (
  runStatus: string,
): "Failed" | "Blocked" | "Canceled" | null =>
  runStatus === "failed" ? "Failed"
    : ["blocked", "denied"].includes(runStatus) ? "Blocked"
      : runStatus === "canceled" ? "Canceled" : null;

export const phaseDisplayStatus = (
  phase: WorkflowPhase,
  currentPhaseId: WorkflowPhaseId | null,
  runStatus: string,
  failedPhaseId: WorkflowPhaseId | null = null,
): "Succeeded" | "In progress" | "Complete" | "Upcoming" | "Failed" | "Blocked" | "Canceled" => {
  if (phase.id === "complete" && runStatus === "succeeded") return "Succeeded";
  const terminalStatus = terminalPhaseStatus(runStatus);
  if (phase.id === "stopped" && terminalStatus !== null) return terminalStatus;
  if (currentPhaseId === "stopped" && phase.id === failedPhaseId && terminalStatus !== null) return terminalStatus;
  const terminal = ["succeeded", "failed", "blocked", "denied", "canceled"].includes(runStatus);
  if (phase.id === currentPhaseId && !terminal) return "In progress";
  return phase.visits.length > 0 ? "Complete" : "Upcoming";
};

export const authorVisitStatus = (
  visit: { leftAt: string | null } | null,
  runStatus: string,
): "In progress" | "Complete" | "Upcoming" => {
  if (visit === null) return "Upcoming";
  const terminal = ["succeeded", "failed", "blocked", "denied", "canceled"].includes(runStatus);
  return visit.leftAt === null && !terminal ? "In progress" : "Complete";
};

export const isPlanningAuthorVisit = (visit: Pick<PhaseVisitLike, "nodeId">): boolean => [
  "planning_author",
  "planning_self_repair",
  "planning_independent_response",
  "planning_revision_author",
].includes(visit.nodeId);
