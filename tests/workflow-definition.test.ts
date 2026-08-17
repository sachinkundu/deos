import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadWorkflowDefinition,
  restoreWorkflowDefinition,
  type WorkflowBundleSources,
} from "../src/workflow-definition.ts";

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
  assert.equal(definition.version, 4);
  assert.equal(definition.start, "requirements");
  assert.equal(definition.execution.codexSandboxMode, "danger-full-access");
  assert.equal(definition.nodes.requirements.type, "agent");
  assert.equal(definition.nodes.requirements_review.edges.changes_requested, "requirements");
  assert.equal(definition.nodes.requirements_approval.type, "human_gate");
  assert.equal(definition.nodes.requirements_approval.linearState, "Human Review");
  assert.equal(definition.nodes.done.type, "terminal");
  assert.equal(definition.nodes.await_openspec_tasks.type, "wait");
  assert.match(definition.jobs.implementation.prompt, /implementation agent/);
  assert.equal(definition.digest.length, 64);
});

test("canonical workflow digest is stable", async () => {
  const first = await loadWorkflowDefinition(source, bundle());
  const second = await loadWorkflowDefinition(source, bundle());
  assert.equal(first.digest, second.digest);
});

test("restores an immutable stored definition for an older active run", async () => {
  const original = await loadWorkflowDefinition(source, bundle());
  const restored = await restoreWorkflowDefinition(JSON.stringify(original), original.digest);

  assert.deepEqual(restored, original);
});

test("restores an immutable version 3 definition without applying version 4 rules", async () => {
  const legacy = await loadWorkflowDefinition(
    `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: legacy, version: 3 }
spec:
  start: blocked
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    blocked: { type: terminal, outcome: blocked }
`,
    { prompts: {}, schemas: {} },
  );

  const restored = await restoreWorkflowDefinition(JSON.stringify(legacy), legacy.digest);
  assert.deepEqual(restored, legacy);
});

test("rejects a tampered stored definition", async () => {
  const original = await loadWorkflowDefinition(source, bundle());
  const tampered = JSON.stringify({ ...original, start: "implementation" });

  await assert.rejects(
    restoreWorkflowDefinition(tampered, original.digest),
    /restored workflow definition digest mismatch/,
  );
});

test("rejects executable edge expressions and unknown fields", async () => {
  const invalid = source.replace(
    "edges: {completed: requirements_review, blocked: agent_blocked, failed: agent_failed}",
    "edges: {completed: requirements_review, blocked: agent_blocked, failed: agent_failed}\n      condition: result.score > 0",
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

test("rejects ambiguous or incomplete version 4 lifecycle nodes", async () => {
  const blockedTerminal = source.replace(
    "done: {type: terminal, deosStatus: succeeded, executorAction: return}",
    "done: {type: terminal, deosStatus: blocked, executorAction: return}",
  );
  await assert.rejects(loadWorkflowDefinition(blockedTerminal, bundle()), /unsupported final outcome blocked/);

  const incompleteWait = source.replace(
    "edges: {received: openspec_tasks, canceled: canceled}",
    "edges: {received: openspec_tasks}",
  );
  await assert.rejects(loadWorkflowDefinition(incompleteWait, bundle()), /must contain exactly canceled and received/);

  const unsafeMatcher = source.replace(
    "actorType: user\n        toState: Canceled",
    "actorType: integration\n        toState: Canceled",
  );
  await assert.rejects(loadWorkflowDefinition(unsafeMatcher, bundle()), /actorType must be user/);

  const unsafeCause = source.replace("cause: agent_execution_failed", 'cause: "Agent failed raw output"');
  await assert.rejects(loadWorkflowDefinition(unsafeCause, bundle()), /bounded safe category/);
});
