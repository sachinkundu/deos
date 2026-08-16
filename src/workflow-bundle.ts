import workflowSource from "../config/workflow.deos.yaml";
import requirementsPrompt from "../config/prompts/requirements.md";
import requirementsReviewPrompt from "../config/prompts/requirements-review.md";
import bddReviewPrompt from "../config/prompts/bdd-review.md";
import dddArchitecturePrompt from "../config/prompts/ddd-architecture.md";
import dddReviewPrompt from "../config/prompts/ddd-review.md";
import implementationPrompt from "../config/prompts/implementation.md";
import codeReviewPrompt from "../config/prompts/code-review.md";
import evidenceVerificationPrompt from "../config/prompts/evidence-verification.md";
import releaseFinalizationPrompt from "../config/prompts/release-finalization.md";
import agentResultSchema from "../config/schemas/agent-result-v1.json";
import reviewResultSchema from "../config/schemas/review-result-v1.json";
import { loadWorkflowDefinition } from "./workflow-definition.ts";

const prompts: Readonly<Record<string, string>> = Object.freeze({
  "prompts/requirements.md": requirementsPrompt,
  "prompts/requirements-review.md": requirementsReviewPrompt,
  "prompts/bdd-review.md": bddReviewPrompt,
  "prompts/ddd-architecture.md": dddArchitecturePrompt,
  "prompts/ddd-review.md": dddReviewPrompt,
  "prompts/implementation.md": implementationPrompt,
  "prompts/code-review.md": codeReviewPrompt,
  "prompts/evidence-verification.md": evidenceVerificationPrompt,
  "prompts/release-finalization.md": releaseFinalizationPrompt,
});

const schemas: Readonly<Record<string, string>> = Object.freeze({
  "schemas/agent-result-v1.json": JSON.stringify(agentResultSchema),
  "schemas/review-result-v1.json": JSON.stringify(reviewResultSchema),
});

export const loadBundledWorkflowDefinition = () =>
  loadWorkflowDefinition(workflowSource, { prompts, schemas });
