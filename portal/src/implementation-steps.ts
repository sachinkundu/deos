import type { ImplementationProgress } from "../../src/implementation-progress.ts";
import type { WorkflowDisplayStatus } from "./workflow-phases.ts";

interface ImplementationVisit {
  sequence: number;
  nodeId: string;
  enteredAt: string;
  recovered?: boolean;
}

export interface ImplementationSteps {
  author: WorkflowDisplayStatus;
  verification: WorkflowDisplayStatus;
  current: "implementation_author" | "implementation_verification";
  description: string;
}

const verificationNodes = new Set([
  "implementation_proof_check", "implementation_branch_write", "implementation_publish",
  "implementation_merge_recheck",
]);
const readyNodes = new Set(["implementation_review", "implementation_merge", "code_merged"]);

// A presentation of the current durable visit, not another workflow transition.
// Checklist completion starts verification; only the real review handoff ends it.
export function implementationSteps(
  visits: readonly ImplementationVisit[], runStatus: string,
  progress: ImplementationProgress | null | undefined,
): ImplementationSteps {
  const current = visits.filter(visit => !visit.recovered &&
    (visit.nodeId.startsWith("implementation_") || visit.nodeId === "code_merged"))
    .sort((a, b) => b.sequence - a.sequence);
  const latest = current[0];
  const work = current.find(visit => !["implementation_failed", "implementation_question",
    "implementation_clarification_wait", "implementation_manual_reconciliation"].includes(visit.nodeId));
  const build = current.find(visit => visit.nodeId === "implementation_build");
  const checklistDone = work?.nodeId === "implementation_build" && progress?.source === "author" &&
    progress.total > 0 && progress.completed === progress.total && build !== undefined &&
    Date.parse(progress.observedAt) >= Date.parse(build.enteredAt);
  const ready = latest !== undefined && readyNodes.has(latest.nodeId);
  const verifying = ready || checklistDone || (work !== undefined && verificationNodes.has(work.nodeId));
  const result: ImplementationSteps = {
    author: !latest ? "Upcoming" : verifying ? "Complete" : "In progress",
    verification: ready ? "Complete" : verifying ? "In progress" : "Upcoming",
    current: verifying ? "implementation_verification" : "implementation_author",
    description: ready ? latest.nodeId === "implementation_review" ? "Ready for human review." : "Checks and proof complete." : verifying
      ? work?.nodeId === "implementation_publish" || work?.nodeId === "implementation_branch_write"
        ? "Preparing the implementation PR." : "Final checks and end-to-end proof."
      : "Checks, end-to-end proof and PR preparation follow the task checklist.",
  };
  if (!latest) return result;
  const stopped = runStatus === "failed" ? "Failed"
    : ["blocked", "denied", "manual_reconciliation_required"].includes(runStatus) ? "Blocked"
      : runStatus === "canceled" ? "Canceled" : null;
  const waiting = latest.nodeId === "implementation_clarification_wait";
  if (stopped || waiting) {
    result[verifying ? "verification" : "author"] = stopped ?? "Blocked";
    if (waiting) result.description = "Waiting for your reply in Linear.";
  }
  return result;
}

export const implementationVerificationVisit = (nodeId: string): boolean => verificationNodes.has(nodeId);
