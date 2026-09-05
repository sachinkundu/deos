import type { LoadedWorkflowDefinition } from "../../src/workflow-definition.ts";

export const STAGES = [
  { id: "requirements", label: "Requirements" },
  { id: "specification", label: "Specification" },
  { id: "architecture", label: "Architecture" },
  { id: "implementation_plan", label: "Implementation plan" },
  { id: "implementation", label: "Implementation" },
  { id: "validation", label: "Validation" },
  { id: "release", label: "Release" },
  { id: "completed", label: "Completed" },
  { id: "terminal", label: "Stopped" },
] as const;

export const SIMPLE_STAGES = [
  { id: "claim", label: "Claim issue" },
  { id: "planning", label: "Create planning PR" },
  { id: "review", label: "Human approval" },
  { id: "merge", label: "Automatic merge & check" },
  { id: "complete", label: "Completed" },
  { id: "stopped", label: "Stopped" },
] as const;

export const TRACEABILITY_STAGES = [
  { id: "claim", label: "Claim issue" },
  { id: "planning", label: "Create planning PR" },
  { id: "independent_review", label: "Independent review" },
  { id: "review", label: "Human approval" },
  { id: "merge", label: "Automatic merge & check" },
  { id: "complete", label: "Completed" },
  { id: "stopped", label: "Stopped" },
] as const;

export const TRACEABILITY_DESIGN_STAGES = [
  { id: "claim", label: "Claim issue" },
  { id: "planning", label: "Create planning PR" },
  { id: "independent_review", label: "Independent review" },
  { id: "review", label: "Human approval" },
  { id: "plan_merge", label: "Merge plan & check" },
  { id: "design", label: "Create design PR" },
  { id: "design_merge", label: "Merge design & check" },
  { id: "complete", label: "Completed" },
  { id: "stopped", label: "Stopped" },
] as const;

type PresentationStage = { id: string; label: string };

const stageLabel = (stageId: string): string => {
  const words = stageId.replaceAll("_", " ");
  return words.length === 0 ? "Workflow stage" : `${words[0].toUpperCase()}${words.slice(1)}`;
};

const simplifiedStageForNode = (nodeId: string, definitionVersion: number): string => {
  if (nodeId === "claim_issue") return "claim";
  if (
    nodeId === "openspec_planning" || nodeId === "planning_author" ||
    nodeId === "planning_self_repair" || nodeId === "self_discovery" ||
    nodeId === "self_recheck_before_publish" || nodeId === "publish_initial" ||
    nodeId === "planning_independent_repair" || nodeId === "self_recheck_after_publish" ||
    nodeId === "start_new_review_round"
  ) return "planning";
  if ([
    "independent_discovery",
    "independent_recheck",
    "planning_independent_response",
    "publish_update",
    "publish_author_response",
  ].includes(nodeId)) return "independent_review";
  if (nodeId === "planning_review") return "review";
  if (nodeId === "design_review") return "review";
  if (["merge_planning_pr", "verify_planning_merge", "planning_merge_repair_wait"].includes(nodeId)) {
    return definitionVersion >= 17 ? "plan_merge" : "merge";
  }
  if ([
    "design_author",
    "design_self_review",
    "design_self_response",
    "publish_design",
    "design_independent_review",
    "design_independent_response",
    "publish_design_response",
    "design_final_review",
    "start_new_design_round",
    "design_revision_author",
    "publish_design_revision",
  ].includes(nodeId)) {
    return "design";
  }
  if (nodeId === "merge_design_pr") return "design_merge";
  if (nodeId === "done") return "complete";
  if (["blocked", "denied", "canceled", "agent_blocked", "agent_failed", "system_action_failed"].includes(nodeId)) {
    return "stopped";
  }
  return nodeId;
};

const fullStageForNode = (nodeId: string): string => {
  if (["requirements", "requirements_review", "requirements_approval"].includes(nodeId)) return "requirements";
  if (["openspec_proposal", "openspec_specs", "bdd_review"].includes(nodeId)) return "specification";
  if (["ddd_architecture", "ddd_review", "architecture_approval"].includes(nodeId)) return "architecture";
  if (["openspec_tasks", "await_openspec_tasks"].includes(nodeId)) return "implementation_plan";
  if (nodeId === "implementation") return "implementation";
  if (["code_review", "evidence_verification", "openspec_verify"].includes(nodeId)) return "validation";
  if (["release_approval", "final_approval", "deploy", "release_finalization", "sync_and_archive"].includes(nodeId)) return "release";
  if (nodeId === "done") return "completed";
  if (["blocked", "denied", "canceled", "agent_blocked", "agent_failed", "system_action_failed"].includes(nodeId)) {
    return "terminal";
  }
  return nodeId;
};

const stageForNode = (definition: LoadedWorkflowDefinition, nodeId: string): string => {
  if (definition.name === "simple" || definition.name === "simple-traceability") {
    return simplifiedStageForNode(nodeId, definition.version);
  }
  if (definition.name === "openspec-delivery") return fullStageForNode(nodeId);
  return nodeId;
};

const configuredStages = (definition: LoadedWorkflowDefinition): readonly PresentationStage[] =>
  definition.name === "simple"
    ? SIMPLE_STAGES
    : definition.name === "simple-traceability"
      ? definition.version >= 17 ? TRACEABILITY_DESIGN_STAGES : TRACEABILITY_STAGES
      : definition.name === "openspec-delivery"
        ? STAGES
        : [];

export const presentationStagesForDefinition = (
  definition: LoadedWorkflowDefinition,
): readonly PresentationStage[] => {
  const stageIds = [...new Set(Object.keys(definition.nodes).map((nodeId) => stageForNode(definition, nodeId)))];
  const configured = configuredStages(definition);
  const configuredIds = new Set(configured.map((stage) => stage.id));
  const usedIds = new Set(stageIds);
  return [
    ...configured.filter((stage) => usedIds.has(stage.id)),
    ...stageIds.filter((stageId) => !configuredIds.has(stageId)).map((stageId) => ({
      id: stageId,
      label: stageLabel(stageId),
    })),
  ];
};

export const validatePresentationManifest = (definition: LoadedWorkflowDefinition): Map<string, string> => {
  const mapping = new Map<string, string>();
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    mapping.set(nodeId, stageForNode(definition, nodeId));
    for (const target of Object.values(node.edges)) {
      if (!(target in definition.nodes)) throw new Error("workflow presentation edge is incomplete");
    }
  }
  if (mapping.size !== Object.keys(definition.nodes).length || !mapping.has(definition.start)) {
    throw new Error("workflow presentation manifest is incomplete");
  }
  return mapping;
};
