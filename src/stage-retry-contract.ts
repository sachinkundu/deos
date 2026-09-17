export type AgentStageRetryNode =
  | "planning_author"
  | "self_discovery"
  | "planning_self_repair"
  | "self_recheck_before_publish"
  | "self_recheck_after_publish"
  | "planning_revision_author"
  | "independent_discovery"
  | "independent_recheck"
  | "planning_independent_response"
  | "final_trace"
  | "design_author"
  | "design_revision_author"
  | "design_self_review"
  | "design_independent_review"
  | "design_self_response"
  | "design_independent_response"
  | "design_final_review"
  | "implementation_tasks"
  | "implementation_build"
  | "implementation_demo_plan"
  | "implementation_demo_gate";

export const RETRYABLE_AGENT_ATTEMPT_STATES = [
  "failed",
  "interrupted",
  "absolute_timeout",
] as const;

const agentStageRetryNodes = new Set<unknown>([
  "planning_author",
  "self_discovery",
  "planning_self_repair",
  "self_recheck_before_publish",
  "self_recheck_after_publish",
  "planning_revision_author",
  "independent_discovery",
  "independent_recheck",
  "planning_independent_response",
  "final_trace",
  "design_author",
  "design_revision_author",
  "design_self_review",
  "design_independent_review",
  "design_self_response",
  "design_independent_response",
  "design_final_review",
  "implementation_tasks",
  "implementation_build",
  "implementation_demo_plan",
  "implementation_demo_gate",
]);

export const isAgentStageRetryNode = (value: unknown): value is AgentStageRetryNode =>
  agentStageRetryNodes.has(value);

// Publication retries reuse the accepted candidate; they do not rerun its author.
export const publicationRetryActions = {
  publish_initial: "github.publish_planning_candidate",
  publish_update: "github.publish_planning_candidate",
  publish_planning_revision: "github.publish_planning_candidate",
  publish_design: "github.publish_design_candidate",
  publish_design_response: "github.publish_design_candidate",
  publish_design_revision: "github.publish_design_candidate",
  implementation_branch_write: "implementation.write_branch",
  implementation_publish: "implementation.publish",
} as const;
export type PublicationRetryNode = keyof typeof publicationRetryActions;
export const publicationRetryFailure = (node: PublicationRetryNode) =>
  node === "implementation_branch_write" || node === "implementation_publish"
    ? { node: "implementation_failed", cause: "implementation_failed" }
    : { node: "system_action_failed", cause: "system_action_invariant_failed" };
export type StageRetryNode = AgentStageRetryNode | PublicationRetryNode;
export const isPublicationRetryNode = (value: unknown): value is PublicationRetryNode =>
  typeof value === "string" && Object.hasOwn(publicationRetryActions, value);
export const isStageRetryNode = (value: unknown): value is StageRetryNode =>
  isAgentStageRetryNode(value) || isPublicationRetryNode(value);
