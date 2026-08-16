import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { loadWorkflowDefinition, type WorkflowBundleSources } from "../src/workflow-definition.ts";

const source = readFileSync(new URL("../config/workflow.deos.yaml", import.meta.url), "utf8");
const promptPaths = [
  "requirements.md",
  "requirements-review.md",
  "bdd-review.md",
  "ddd-architecture.md",
  "ddd-review.md",
  "implementation.md",
  "code-review.md",
  "evidence-verification.md",
  "release-finalization.md",
];
const schemaPaths = ["agent-result-v1.json", "review-result-v1.json"];

const bundle = (): WorkflowBundleSources => ({
  prompts: Object.fromEntries(
    promptPaths.map((name) => [
      `prompts/${name}`,
      readFileSync(new URL(`../config/prompts/${name}`, import.meta.url), "utf8"),
    ]),
  ),
  schemas: Object.fromEntries(
    schemaPaths.map((name) => [
      `schemas/${name}`,
      readFileSync(new URL(`../config/schemas/${name}`, import.meta.url), "utf8"),
    ]),
  ),
});

test("loads the reviewed workflow bundle and resolves prompts and schemas", async () => {
  const definition = await loadWorkflowDefinition(source, bundle());

  assert.equal(definition.name, "openspec-delivery");
  assert.equal(definition.start, "requirements");
  assert.equal(definition.execution.codexSandboxMode, "danger-full-access");
  assert.equal(definition.nodes.requirements.type, "agent");
  assert.equal(definition.nodes.requirements_review.edges.changes_requested, "requirements");
  assert.equal(definition.nodes.requirements_approval.type, "human_gate");
  assert.equal(definition.nodes.done.type, "terminal");
  assert.match(definition.jobs.implementation.prompt, /implementation agent/);
  assert.equal(definition.digest.length, 64);
});

test("canonical workflow digest is stable", async () => {
  const first = await loadWorkflowDefinition(source, bundle());
  const second = await loadWorkflowDefinition(source, bundle());
  assert.equal(first.digest, second.digest);
});

test("rejects executable edge expressions and unknown fields", async () => {
  const invalid = source.replace(
    "edges: {completed: requirements_review, blocked: blocked, failed: blocked}",
    "edges: {completed: requirements_review, blocked: blocked, failed: blocked}\n      condition: result.score > 0",
  );
  await assert.rejects(loadWorkflowDefinition(invalid, bundle()), /condition is not supported/);
});

test("rejects a missing prompt before the definition can be enabled", async () => {
  const sources = bundle();
  const prompts = { ...sources.prompts };
  delete prompts["prompts/implementation.md"];
  await assert.rejects(
    loadWorkflowDefinition(source, { ...sources, prompts }),
    /missing prompt prompts\/implementation.md/,
  );
});

test("rejects graph edges to missing nodes", async () => {
  const invalid = source.replace("completed: requirements_review", "completed: absent_node");
  await assert.rejects(loadWorkflowDefinition(invalid, bundle()), /references unknown node absent_node/);
});
