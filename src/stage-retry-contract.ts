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
  | "design_final_review";

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
]);

export const isAgentStageRetryNode = (value: unknown): value is AgentStageRetryNode =>
  agentStageRetryNodes.has(value);
