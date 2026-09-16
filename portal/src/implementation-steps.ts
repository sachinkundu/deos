import type { ImplementationProgress } from "../../src/implementation-progress.ts";
import type { WorkflowDisplayStatus } from "./workflow-phases.ts";
import type { ImplementationDemoView } from './implementation-demo-view.ts';

interface ImplementationVisit {
  sequence: number;
  nodeId: string;
  enteredAt: string;
  recovered?: boolean;
}

export interface ImplementationSteps {
  author: WorkflowDisplayStatus;
  verification: WorkflowDisplayStatus;
  demoPlan: WorkflowDisplayStatus;
  demoGate: WorkflowDisplayStatus;
  current: "implementation_author" | "implementation_verification" | "implementation_demo_plan" | "implementation_demo_gate";
  description: string;
}

const verificationNodes = new Set([
  "implementation_proof_check", "implementation_branch_write", "implementation_publish",
  "implementation_merge_recheck",
]);
const readyNodes = new Set(["implementation_review", "implementation_merge", "code_merged"]);

// A presentation of the current durable visit, not another workflow transition.
// Agent completion advances the flow; task counts never claim completion.
export function implementationSteps(
  visits: readonly ImplementationVisit[], runStatus: string,
  progress: ImplementationProgress | null | undefined,
  demo?: ImplementationDemoView | null,
): ImplementationSteps {
  const current = visits.filter(visit => !visit.recovered &&
    (visit.nodeId.startsWith("implementation_") || visit.nodeId === "code_merged"))
    .sort((a, b) => b.sequence - a.sequence);
  const latest = current[0];
  const work = current.find(visit => !["implementation_failed", "implementation_question",
    "implementation_clarification_wait", "implementation_publication_question", "implementation_publication_wait",
    "implementation_manual_reconciliation"].includes(visit.nodeId));
  const ready = latest !== undefined && readyNodes.has(latest.nodeId);
  const atPlan = work?.nodeId === 'implementation_demo_plan' || work?.nodeId === 'implementation_rebase_demo';
  const atGate = work?.nodeId === 'implementation_demo_gate';
  const verifying = ready || atGate || (work !== undefined && verificationNodes.has(work.nodeId));
  const result: ImplementationSteps = {
    author: !latest ? "Upcoming" : verifying ? "Complete" : "In progress",
    verification: ready ? "Complete" : verifying && !atGate ? "In progress" : "Upcoming",
    current: verifying ? "implementation_verification" : "implementation_author",
    demoPlan: demo?.plan?.current ? demo.plan.value.outcome === 'ready' ? 'Complete' : 'Blocked' : 'Upcoming',
    demoGate: demo?.gate?.repairComplete ? 'Needs work' : demo?.gate?.current ? ({pass:'Complete', needs_work:'Needs work', blocked:'Blocked'} as const)[demo.gate.value.outcome] : 'Upcoming',
    description: ready ? latest.nodeId === "implementation_review" ? "Ready for human review." : "Implementation published." : verifying
      ? work?.nodeId === "implementation_publish" || work?.nodeId === "implementation_branch_write"
        ? "Preparing the implementation PR." : "Passing the implementation to review."
      : "Sol is implementing and demonstrating the work.",
  };
  if (atPlan) {
    result.current = 'implementation_demo_plan';
    result.demoPlan = demo?.plan?.current ? result.demoPlan : 'In progress';
    result.author = 'Upcoming';
    result.verification = 'Upcoming';
    result.description = 'Claude is defining the required demos from the approved plan.';
  }
  if (atGate) {
    result.current = 'implementation_demo_gate';
    result.demoGate = demo?.gate?.current ? result.demoGate : 'In progress';
    result.verification = 'Upcoming';
    result.description = 'Claude is reviewing the implementation and demos.';
  }
  if (work?.nodeId === 'implementation_build' && demo?.gate?.value.outcome === 'needs_work')
    result.description = 'Sol is acting on Claude’s findings before human review.';
  if (!latest) return result;
  const stopped = runStatus === "failed" ? "Failed"
    : ["blocked", "denied", "manual_reconciliation_required"].includes(runStatus) ? "Blocked"
      : runStatus === "canceled" ? "Canceled" : null;
  const waiting = ["implementation_clarification_wait", "implementation_publication_wait"].includes(latest.nodeId);
  if (stopped || waiting) {
    result[atPlan ? 'demoPlan' : atGate ? 'demoGate' : verifying ? "verification" : "author"] = stopped ?? "Blocked";
    if (waiting) result.description = "Waiting for your reply in Linear.";
  }
  return result;
}

export const implementationVerificationVisit = (nodeId: string): boolean => verificationNodes.has(nodeId);
