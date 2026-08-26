import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { simpleWorkflowPresentation } from "../src/simple-workflow.js";

const workflowSource = await readFile(new URL("../../../config/workflow.simple.yaml", import.meta.url), "utf8");
const workflow = parse(workflowSource);

test("simple workflow presentation covers the version-4 definition", () => {
  assert.equal(workflow.metadata.name, simpleWorkflowPresentation.id);
  assert.equal(workflow.metadata.version, simpleWorkflowPresentation.version);
  assert.equal(workflow.spec.start, simpleWorkflowPresentation.startNode);

  const configuredNodes = Object.keys(workflow.spec.nodes).sort();
  const presentedNodes = Object.keys(simpleWorkflowPresentation.nodeToStage).sort();
  assert.deepEqual(presentedNodes, configuredNodes);

  const stageIds = new Set(simpleWorkflowPresentation.stages.map(({ id }) => id));
  assert.equal(stageIds.size, simpleWorkflowPresentation.stages.length);
  for (const nodeId of configuredNodes) {
    assert.ok(stageIds.has(simpleWorkflowPresentation.nodeToStage[nodeId]), `${nodeId} has a visible stage`);
  }
});

test("simple workflow presentation retains every collapsed edge", () => {
  const configuredPairs = new Set();
  for (const [sourceNode, node] of Object.entries(workflow.spec.nodes)) {
    for (const targetNode of Object.values(node.edges ?? {})) {
      assert.ok(targetNode in workflow.spec.nodes, `${sourceNode} points to an existing node`);
      const sourceStage = simpleWorkflowPresentation.nodeToStage[sourceNode];
      const targetStage = simpleWorkflowPresentation.nodeToStage[targetNode];
      if (sourceStage !== targetStage) configuredPairs.add(`${sourceStage}->${targetStage}`);
    }
  }

  const presentedPairs = new Set(
    simpleWorkflowPresentation.connections.map(({ source, target }) => `${source}->${target}`),
  );
  assert.deepEqual([...presentedPairs].sort(), [...configuredPairs].sort());
});

test("simple workflow presentation names the human and automatic stages clearly", () => {
  const stages = new Map(simpleWorkflowPresentation.stages.map((stage) => [stage.id, stage]));

  assert.equal(stages.get("review").label, "Human approval");
  assert.deepEqual(stages.get("review").nodeIds, ["planning_review"]);
  assert.equal(workflow.spec.nodes.planning_review.type, "human_gate");
  assert.equal(workflow.spec.nodes.planning_review.linearState, "Human Review");
  assert.equal(workflow.spec.nodes.planning_review.decisions.merge_authorized, "Merging");

  assert.equal(stages.get("merge").label, "Automatic merge & check");
  for (const nodeId of stages.get("merge").nodeIds) {
    assert.equal(workflow.spec.nodes[nodeId].type, "system_action");
  }
});
