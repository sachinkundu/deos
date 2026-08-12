export type WorkflowState =
  | "received"
  | "queued"
  | "requirements_in_progress"
  | "awaiting_human_approval"
  | "approved"
  | "rejected";

export interface WorkflowEvent {
  transition: string;
}

export type WorkflowAction =
  | { kind: "start"; transitions: Array<[WorkflowState, WorkflowState, string]> }
  | { kind: "approve"; transition: [WorkflowState, WorkflowState, string] }
  | { kind: "reject"; transition: [WorkflowState, WorkflowState, string] }
  | { kind: "ignore" };

const startTransitions: Array<[WorkflowState, WorkflowState, string]> = [
  ["received", "queued", "queue-consumed"],
  ["queued", "requirements_in_progress", "workflow-started"],
  ["requirements_in_progress", "awaiting_human_approval", "approval-required"],
];

export const decideWorkflowAction = (
  event: WorkflowEvent,
  currentState: WorkflowState | null,
): WorkflowAction => {
  if (currentState === null) return { kind: "start", transitions: startTransitions };
  if (currentState !== "awaiting_human_approval") return { kind: "ignore" };
  if (event.transition === "Canceled") {
    return { kind: "reject", transition: ["awaiting_human_approval", "rejected", "human-rejected"] };
  }
  return { kind: "approve", transition: ["awaiting_human_approval", "approved", "human-approved"] };
};
