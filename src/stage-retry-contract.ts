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
} as const;
export type PublicationRetryNode = keyof typeof publicationRetryActions;
export type StageRetryNode = AgentStageRetryNode | PublicationRetryNode;
export const isPublicationRetryNode = (value: unknown): value is PublicationRetryNode =>
  typeof value === "string" && Object.hasOwn(publicationRetryActions, value);
export const isStageRetryNode = (value: unknown): value is StageRetryNode =>
  isAgentStageRetryNode(value) || isPublicationRetryNode(value);
