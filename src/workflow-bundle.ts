import workflowSource from "../config/workflow.deos.yaml";
import simpleWorkflowSource from "../config/workflow.simple.yaml";
import traceabilityWorkflowSource from "../config/workflow.simple-traceability.yaml";
import requirementsPrompt from "../config/prompts/requirements.md";
import requirementsReviewPrompt from "../config/prompts/requirements-review.md";
import bddReviewPrompt from "../config/prompts/bdd-review.md";
import dddArchitecturePrompt from "../config/prompts/ddd-architecture.md";
import dddReviewPrompt from "../config/prompts/ddd-review.md";
import implementationPrompt from "../config/prompts/implementation.md";
import codeReviewPrompt from "../config/prompts/code-review.md";
import evidenceVerificationPrompt from "../config/prompts/evidence-verification.md";
import openSpecPrompt from "../config/prompts/openspec.md";
import openSpecPlanningPrompt from "../config/prompts/openspec-planning.md";
import openSpecPlanningAuthorPrompt from "../config/prompts/openspec-planning-author.md";
import traceabilityReviewPrompt from "../config/prompts/openspec-traceability-review.md";
import traceabilityRecheckPrompt from "../config/prompts/openspec-traceability-recheck.md";
import agentResultSchema from "../config/schemas/agent-result-v1.json";
import reviewResultSchema from "../config/schemas/review-result-v1.json";
import traceAgentResultSchema from "../config/schemas/trace-agent-result-v1.json";
import { loadWorkflowDefinition, type LoadedWorkflowDefinition } from "./workflow-definition.ts";

const prompts: Readonly<Record<string, string>> = Object.freeze({
  "prompts/requirements.md": requirementsPrompt,
  "prompts/requirements-review.md": requirementsReviewPrompt,
  "prompts/bdd-review.md": bddReviewPrompt,
  "prompts/ddd-architecture.md": dddArchitecturePrompt,
  "prompts/ddd-review.md": dddReviewPrompt,
  "prompts/implementation.md": implementationPrompt,
  "prompts/code-review.md": codeReviewPrompt,
  "prompts/evidence-verification.md": evidenceVerificationPrompt,
  "prompts/openspec.md": openSpecPrompt,
  "prompts/openspec-planning.md": openSpecPlanningPrompt,
  "prompts/openspec-planning-author.md": openSpecPlanningAuthorPrompt,
  "prompts/openspec-traceability-review.md": traceabilityReviewPrompt,
  "prompts/openspec-traceability-recheck.md": traceabilityRecheckPrompt,
});

const schemas: Readonly<Record<string, string>> = Object.freeze({
  "schemas/agent-result-v1.json": JSON.stringify(agentResultSchema),
  "schemas/review-result-v1.json": JSON.stringify(reviewResultSchema),
  "schemas/trace-agent-result-v1.json": JSON.stringify(traceAgentResultSchema),
});

export const DEFAULT_WORKFLOW_DEFINITION_ID = "simple";

const workflowSources = Object.freeze([workflowSource, simpleWorkflowSource, traceabilityWorkflowSource]);

export const loadBundledWorkflowDefinitionRegistry = async (): Promise<
  Readonly<Record<string, LoadedWorkflowDefinition>>
> => {
  const definitions = await Promise.all(
    workflowSources.map((source) => loadWorkflowDefinition(source, { prompts, schemas })),
  );
  const registry: Record<string, LoadedWorkflowDefinition> = {};
  for (const definition of definitions) {
    if (registry[definition.name] !== undefined) {
      throw new Error(`duplicate bundled workflow definition ${definition.name}`);
    }
    registry[definition.name] = definition;
  }
  if (registry[DEFAULT_WORKFLOW_DEFINITION_ID] === undefined || registry.simple === undefined) {
    throw new Error("bundled workflow registry is incomplete");
  }
  return Object.freeze(registry);
};

export const loadBundledWorkflowDefinition = async () =>
  (await loadBundledWorkflowDefinitionRegistry())[DEFAULT_WORKFLOW_DEFINITION_ID];
