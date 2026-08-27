import type { LoadedWorkflowDefinition } from "../../src/workflow-definition.ts";

const SUPPORTED_DIGESTS = new Set([
  "77ab59f0c43bb1f8a31502ed066d3fa2ecf4168247a4cd18d1f1326f01e668c8",
  "92fa265d1a98376f152b0325f9daa3d93c4eda947befa5948f724507918bb202",
  "f0bc5d7c4077b6b58a1e5557d25916d5ca7217ebf3ee709a530272047ae092b3",
  "0a6fd3e674f6bb36218e99164f0b93a60beae52458a5b5004c0b55939cf49ff9",
  "7a087c1550bfbb9a35faa9849a962d07e9e2683d70acecf272c70594f3f17bc6",
  "dfb073102fa087db24cd9786f0f38781d8a522346199d61495b3cb8a4fe39cf1",
  "0caca8da4fabc832d07a3b5fb0869e7bde55d94082562b69fddb0ca3186b6045",
  "dbe4bf87f2f611ac6af9ed1b9575fd725609599f245a4be6da564ace7e3a32f0",
  "7b8c872007337f0b6b034746359da0cfe4ce6d5a9cfddfd6842112bf1f39f5ca",
  "b648d257f546ab130984c26d564c162de648a5929e3520dd1f12e594f0e6db12",
  "e85de9ed70c046cfe07a1611b1e0a1c2678cd58dbcfe8edc9ea73856bb6b86c3",
  "5814eb9c981b93fd7fa6e5144d370a083533ff1292768f3af83c30ede025acfc",
  "4eb12c3335e46fe482251a164f3133e15200fae18c136b57c2bb10bf571232f9",
  "127779af65ec49c8ca50436df86c3baaa364b808ec17f14d907c8d05669c7015",
  "fe52677cbe82792dc0d5382974be37fcfed371f4edaf0f7ae4284f246ae60524",
]);

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

const stageForNode = (nodeId: string): string => {
  if (nodeId === "claim_issue") return "claim";
  if (
    nodeId === "openspec_planning" || nodeId === "planning_author" ||
    nodeId === "planning_self_repair" || nodeId === "self_discovery" ||
    nodeId === "self_recheck_before_publish" || nodeId === "publish_initial" ||
    nodeId === "planning_independent_repair" || nodeId === "self_recheck_after_publish" ||
    nodeId === "publish_update"
  ) return "planning";
  if (["independent_discovery", "independent_recheck"].includes(nodeId)) return "independent_review";
  if (nodeId === "planning_review") return "review";
  if (["merge_planning_pr", "verify_planning_merge"].includes(nodeId)) return "merge";
  if (["requirements", "requirements_review", "requirements_approval"].includes(nodeId)) return "requirements";
  if (["openspec_proposal", "openspec_specs", "bdd_review"].includes(nodeId)) return "specification";
  if (["ddd_architecture", "ddd_review", "architecture_approval"].includes(nodeId)) return "architecture";
  if (["openspec_tasks", "await_openspec_tasks"].includes(nodeId)) return "implementation_plan";
  if (nodeId === "implementation") return "implementation";
  if (["code_review", "evidence_verification", "openspec_verify"].includes(nodeId)) return "validation";
  if (["release_approval", "final_approval", "deploy", "release_finalization", "sync_and_archive"].includes(nodeId)) return "release";
  if (nodeId === "done") return "completed";
  if (["blocked", "denied", "canceled", "agent_blocked", "agent_failed", "system_action_failed"].includes(nodeId)) return "terminal";
  throw new Error("unsupported workflow presentation node");
};

export const presentationStagesForDefinition = (
  definition: LoadedWorkflowDefinition,
): readonly { id: string; label: string }[] => definition.name === "simple"
  ? SIMPLE_STAGES
  : definition.name === "simple-traceability" ? TRACEABILITY_STAGES : STAGES;

export const validatePresentationManifest = (definition: LoadedWorkflowDefinition): Map<string, string> => {
  if (!SUPPORTED_DIGESTS.has(definition.digest)) throw new Error("unsupported workflow definition");
  const mapping = new Map<string, string>();
  for (const [nodeId, node] of Object.entries(definition.nodes)) {
    mapping.set(nodeId, stageForNode(nodeId));
    for (const target of Object.values(node.edges)) {
      if (!(target in definition.nodes)) throw new Error("workflow presentation edge is incomplete");
    }
  }
  if (mapping.size !== Object.keys(definition.nodes).length || !mapping.has(definition.start)) {
    throw new Error("workflow presentation manifest is incomplete");
  }
  return mapping;
};
