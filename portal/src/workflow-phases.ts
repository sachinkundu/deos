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

export interface ApprovalEvidenceVisitLike {
  sequence: number;
  nodeId: string;
  gate: { gate_kind: "plan" | "design" } | null;
  links: readonly { url: string }[];
}

export type WorkflowDisplayStatus =
  | "Succeeded"
  | "In progress"
  | "Complete"
  | "Upcoming"
  | "Failed"
  | "Blocked"
  | "Canceled";

export type WorkflowStatusTone = "succeeded" | "active" | "failed" | "upcoming";

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
): WorkflowDisplayStatus => {
  if (phase.id === "complete" && runStatus === "succeeded") return "Succeeded";
  const terminalStatus = terminalPhaseStatus(runStatus);
  if (phase.id === "stopped" && terminalStatus !== null) return terminalStatus;
  if (currentPhaseId === "stopped" && phase.id === failedPhaseId && terminalStatus !== null) return terminalStatus;
  const terminal = ["succeeded", "failed", "blocked", "denied", "canceled"].includes(runStatus);
  if (phase.id === currentPhaseId && !terminal) return "In progress";
  if (phase.id === "approval") {
    const gateKinds = new Set(phase.visits.flatMap((visit) => visit.gate?.gate_kind ?? []));
    if (!gateKinds.has("plan") || !gateKinds.has("design")) return "Upcoming";
  }
  return phase.visits.length > 0 ? "Complete" : "Upcoming";
};

export const workflowStatusTone = (status: string): WorkflowStatusTone =>
  status === "In progress" ? "active"
    : ["Failed", "Blocked", "Canceled"].includes(status) ? "failed"
      : ["Complete", "Succeeded", "Approved"].includes(status) ? "succeeded"
        : "upcoming";

export const planningSubstepForNode = (
  nodeId: string,
): "planning_author" | "self_review" | "independent_review" =>
  ["self_discovery", "self_recheck_before_publish", "self_recheck_after_publish"].includes(nodeId)
    ? "self_review"
    : ["independent_discovery", "independent_recheck", "final_trace"].includes(nodeId)
      ? "independent_review"
      : "planning_author";

export const authorVisitStatus = (
  visit: {
    leftAt: string | null;
    attempts: readonly { state: string; outcome: string | null }[];
  } | null,
  runStatus: string,
): "In progress" | "Complete" | "Upcoming" | "Failed" | "Blocked" => {
  if (visit === null) return "Upcoming";
  const attempt = visit.attempts.at(-1);
  if (attempt?.outcome === "blocked") return "Blocked";
  if (
    attempt?.state === "failed" ||
    ["failed", "invalid_candidate", "invalid_design_candidate"].includes(attempt?.outcome ?? "")
  ) return "Failed";
  const terminal = ["succeeded", "failed", "blocked", "denied", "canceled"].includes(runStatus);
  return visit.leftAt === null && !terminal ? "In progress" : "Complete";
};

export const isPlanningAuthorVisit = (visit: Pick<PhaseVisitLike, "nodeId">): boolean => [
  "planning_author",
  "planning_self_repair",
  "planning_independent_response",
  "planning_revision_author",
].includes(visit.nodeId);

const approvalPublicationKind = (nodeId: string): "plan" | "design" | null =>
  ["publish_initial", "publish_update", "publish_author_response", "publish_planning_candidate"].includes(nodeId)
    ? "plan"
    : ["publish_design", "publish_design_candidate"].includes(nodeId) ? "design" : null;

export const approvalEvidenceLinks = <Link extends { url: string }>(
  visits: readonly (Omit<ApprovalEvidenceVisitLike, "links"> & { links: readonly Link[] })[],
): readonly Link[] => [...new Map(visits
  .filter((visit) => visit.gate !== null || approvalPublicationKind(visit.nodeId) !== null)
  .flatMap((visit) => visit.links)
  .map((link) => [link.url, link])).values()];

export const selectedApprovalEvidenceUrls = (
  visits: readonly ApprovalEvidenceVisitLike[],
  selectedSequence: number | null,
): readonly string[] => {
  const selected = visits.find((visit) => visit.sequence === selectedSequence);
  if (selected === undefined) return [];
  const evidenceVisit = selected.gate === null ? selected : visits
    .filter((visit) =>
      visit.sequence < selected.sequence && visit.links.length > 0 &&
      approvalPublicationKind(visit.nodeId) === selected.gate?.gate_kind
    )
    .sort((left, right) => right.sequence - left.sequence)[0] ?? selected;
  return evidenceVisit.links.map((link) => link.url);
};
