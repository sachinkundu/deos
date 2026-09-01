export type WorkflowPhaseId = "claim" | "planning" | "design" | "complete" | "stopped";

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
  design: "Design",
  complete: "Completed",
  stopped: "Stopped",
};

export const phaseForVisit = (visit: Pick<PhaseVisitLike, "nodeId" | "stageId" | "gate">): WorkflowPhaseId | null => {
  if (visit.stageId === "claim") return "claim";
  if (visit.nodeId === "planning_review" || visit.gate?.gate_kind === "plan") return "planning";
  if (visit.nodeId === "design_review" || visit.gate?.gate_kind === "design") return "design";
  if (["planning", "independent_review", "plan_merge"].includes(visit.stageId)) return "planning";
  if (["design", "design_merge"].includes(visit.stageId)) return "design";
  if (visit.stageId === "complete") return "complete";
  if (visit.stageId === "stopped") return "stopped";
  return null;
};

export const workflowPhases = (visits: PhaseVisitLike[]): WorkflowPhase[] => {
  const visibleVisits = visits.filter((visit) => visit.recovered !== true);
  const order: WorkflowPhaseId[] = ["claim", "planning", "design", "complete"];
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

export const phaseDisplayStatus = (
  phase: WorkflowPhase,
  currentPhaseId: WorkflowPhaseId | null,
  runStatus: string,
): "Succeeded" | "In progress" | "Complete" | "Upcoming" | "Failed" | "Blocked" | "Canceled" => {
  if (phase.id === "complete" && runStatus === "succeeded") return "Succeeded";
  if (phase.id === "stopped" && ["failed", "blocked", "canceled"].includes(runStatus)) {
    return runStatus === "failed" ? "Failed" : runStatus === "blocked" ? "Blocked" : "Canceled";
  }
  const terminal = ["succeeded", "failed", "blocked", "denied", "canceled"].includes(runStatus);
  if (phase.id === currentPhaseId && !terminal) return "In progress";
  return phase.visits.length > 0 ? "Complete" : "Upcoming";
};
