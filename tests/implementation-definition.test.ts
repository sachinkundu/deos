import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { implementationPolicy } from "../src/implementation-contract.ts";
import {validatePresentationManifest} from "../portal/src/manifests.ts";
import {
  loadWorkflowDefinition,
  restoreWorkflowDefinition,
} from "../src/workflow-definition.ts";
const bundle = {
  prompts: Object.fromEntries(
    readdirSync("config/prompts").map((name) => [
      `prompts/${name}`,
      readFileSync(`config/prompts/${name}`, "utf8"),
    ]),
  ),
  schemas: Object.fromEntries(
    readdirSync("config/schemas").map((name) => [
      `schemas/${name}`,
      readFileSync(`config/schemas/${name}`, "utf8"),
    ]),
  ),
};
test("merged design leads to distinct task and build jobs, separate human decisions, and no release", async () => {
  const flow = await loadWorkflowDefinition(
    readFileSync("config/workflow.implementation.yaml", "utf8"),
    bundle,
  );
  assert.deepEqual(flow.implementationPolicy, implementationPolicy);
  const presentation = validatePresentationManifest(flow);
  assert.equal(presentation.get("implementation_failed"),"stopped");
  assert.equal(presentation.get("code_merged"),"complete");
  assert.equal(
    flow.nodes.merge_design_pr.edges.completed,
    "implementation_prepare",
  );
  assert.equal(
    flow.jobs.implementation_tasks.operation?.instruction,
    "/opsx:continue",
  );
  assert.equal(
    flow.jobs.implementation_build.operation?.instruction,
    "/opsx:apply",
  );
  assert.equal(
    flow.nodes.implementation_clarification_wait.type === "human_gate" &&
      flow.nodes.implementation_clarification_wait.expectedEventKind,
    "comment",
  );
  assert.equal(
    flow.nodes.implementation_review.type === "human_gate" &&
      flow.nodes.implementation_review.expectedEventKind,
    "state",
  );
  assert.equal(flow.nodes.implementation_merge.edges.completed, "code_merged");
  assert.ok(
    !Object.values(flow.nodes).some(
      (n) => n.type === "system_action" && n.action.startsWith("release."),
    ),
  );
  assert.deepEqual(
    await restoreWorkflowDefinition(JSON.stringify(flow), flow.digest),
    flow,
  );
  const old = await loadWorkflowDefinition(
    readFileSync("config/workflow.simple-traceability-claude.yaml", "utf8"),
    bundle,
  );
  assert.equal(old.nodes.merge_design_pr.edges.completed, "done");
  assert.equal(old.implementationPolicy, undefined);
});
