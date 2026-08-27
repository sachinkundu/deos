import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import {
  cycleCountForStage,
  runCountForStage,
  simpleWorkflowIssues,
  simpleWorkflowPresentation,
} from "../src/simple-workflow.js";
import { activityForRecord } from "../src/transcript-view.js";
import { simpleIssueFromProjection } from "../src/portal-run.js";

const workflowSource = await readFile(new URL("../../../config/workflow.simple.yaml", import.meta.url), "utf8");
const workflow = parse(workflowSource);
const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

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

test("simple workflow shows cycles only for explicit automated review stages", () => {
  const stages = new Map(simpleWorkflowPresentation.stages.map((stage) => [stage.id, stage]));
  const issue = { cycles: {}, runs: { planning: 1 } };

  assert.deepEqual(simpleWorkflowPresentation.stages.filter((stage) => stage.cycleBased), []);
  assert.equal(cycleCountForStage(stages.get("claim"), issue, "completed", false), 0);
  assert.equal(cycleCountForStage(stages.get("planning"), issue, "completed", false), 0);
  assert.equal(cycleCountForStage(stages.get("review"), issue, "completed", false), 0);
  assert.equal(cycleCountForStage(stages.get("merge"), issue, "completed", false), 0);
  assert.equal(runCountForStage(stages.get("planning"), issue, "completed", false), 1);
  assert.equal(runCountForStage(stages.get("merge"), issue, "completed", false), 0);

  const automatedReview = { id: "automated_review", agents: ["Review Agent"], cycleBased: true };
  assert.equal(cycleCountForStage(automatedReview, { cycles: { automated_review: 2 } }, "completed", false), 2);
  assert.equal(cycleCountForStage(automatedReview, { cycles: {} }, "completed", false), 0);
});

test("the portal lists only the recorded Linear issue", () => {
  const stages = simpleWorkflowPresentation.stages.map((stage) => stage.id).sort();
  const issues = Object.values(simpleWorkflowIssues);

  assert.deepEqual(issues.map((issue) => issue.key), ["SAC-130"]);
  assert.deepEqual(Object.keys(issues[0].stageStates).sort(), stages);
  assert.ok(issues[0].currentStep in workflow.spec.nodes);
});

test("SAC-130 uses the recorded simple-workflow evidence", () => {
  const issue = simpleWorkflowIssues["SAC-130"];

  assert.equal(issue.title, "Add Microsoft Entra login");
  assert.equal(issue.pullRequest.label, "PR #1");
  assert.equal(issue.pullRequest.status, "Merged");
  assert.equal(issue.pullRequest.mergeCommit, "9270b93d31c653f15714509a8f841d98a13c6e46");
  assert.equal(issue.linear.url, "https://linear.app/sachinkundu/issue/SAC-130/add-microsoft-entra-login");
  assert.equal(issue.evidence.runId.endsWith(":run:3"), true);
  assert.equal(issue.evidence.knownGap.includes("governed work-link row is absent"), true);
  assert.equal(issue.stageDetails.claim.facts.find(({ label }) => label === "Transition").value, "Todo → In Progress");
  assert.equal(issue.stageDetails.planning.files.length, 3);
  for (const file of issue.stageDetails.planning.files) {
    assert.equal(new URL(file.url).origin, "https://github.com");
    assert.equal(file.url.includes(issue.pullRequest.mergeCommit), true);
  }
  assert.equal(issue.stageDetails.review.facts.find(({ label }) => label === "Duration").value, "46 sec");
  assert.equal(issue.stageDetails.merge.facts.find(({ label }) => label === "Merge commit").value, "9270b93");
  assert.equal(issue.stageDetails.complete.facts.find(({ label }) => label === "Visits").value, "6");
  const transcript = issue.agentRuns.planning[0];
  assert.equal(transcript.facts.find(({ label }) => label === "Transcript").value, "46 recorded events");
  assert.equal(transcript.source.eventCount, 46);
  assert.equal(transcript.source.byteSize, 44634);
  assert.equal(transcript.source.sha256, issue.evidence.transcriptDigest);
  assert.equal(transcript.source.attemptId, issue.evidence.attemptId);
  assert.equal("url" in transcript.source, false);
});

test("transcript records have readable Activity labels while preserving raw JSONL", () => {
  const raw = JSON.stringify({ type: "tool_call", tool_name: "read_file", summary: "Read the planning input." });
  const activity = activityForRecord({ number: 7, raw, value: JSON.parse(raw) });
  assert.equal(activity.title, "Tool call · read_file");
  assert.equal(activity.detail, "Read the planning input.");
  assert.equal(activity.raw, raw);
});

test("workflow step details show timing and destinations without redundant commentary", () => {
  assert.equal(appSource.includes("<dt>Result</dt>"), false);
  assert.equal(appSource.includes('className="detail-summary"'), false);
  assert.equal(appSource.includes('className="inspector-cycles"'), false);
  assert.equal(appSource.includes('["started", "duration"]'), true);
});

test("the graph itself identifies the current stage without a separate pill", () => {
  assert.equal(appSource.includes("Current node"), false);
  assert.equal(appSource.includes("direction-chip"), false);
  assert.equal(styleSource.includes(".full-flow-node--active"), true);
  assert.equal(styleSource.includes("animation: active-node-breathe"), true);
  assert.equal(styleSource.includes(".full-flow-node--waiting { color: var(--waiting); }"), true);
});

test("a non-active current stage uses the yellow waiting treatment", () => {
  const issue = simpleIssueFromProjection({
    issue: { key: "SAC-200", title: "Start a small plan", url: "https://linear.app/example/issue/SAC-200/start-a-small-plan" },
    run: {
      id: "workflow:project:issue:run:1", sequence: 1, status: "pending_dispatch",
      definitionName: "simple", definitionVersion: 4, definitionDigest: "digest",
      currentNode: "claim_issue", currentVisitSequence: 1,
      startedAt: "2026-08-27T08:00:00Z", updatedAt: "2026-08-27T08:00:01Z",
      freshness: "2026-08-27T08:00:01Z",
    },
    pullRequest: null,
    history: [
      { sequence: 1, stageId: "claim", enteredAt: "2026-08-27T08:00:00Z", leftAt: null, attempts: [], links: [] },
    ],
  });

  assert.equal(issue.state, "waiting");
  assert.equal(issue.stateLabel, "Starting");
  assert.equal(issue.stageStates.claim, "waiting");
});

test("a durable simple projection becomes the approved visual issue shape", () => {
  const issue = simpleIssueFromProjection({
    issue: { key: "SAC-129", title: "Build a simple calculator CLI", url: "https://linear.app/sachinkundu/issue/SAC-129/build-a-simple-calculator-cli" },
    run: {
      id: "workflow:project:issue:run:9", sequence: 9, status: "succeeded",
      definitionName: "simple", definitionVersion: 2, definitionDigest: "digest",
      currentNode: "done", currentVisitSequence: 8,
      startedAt: "2026-08-24T12:25:00Z", updatedAt: "2026-08-24T13:22:26Z",
      freshness: "2026-08-24T13:22:26Z",
    },
    pullRequest: { number: 59, url: "https://github.com/sachinkundu/deos/pull/59", status: "Merged", verified: true },
    history: [
      { sequence: 1, stageId: "claim", enteredAt: "2026-08-24T12:25:00Z", leftAt: "2026-08-24T12:25:01Z", attempts: [], links: [] },
      { sequence: 2, stageId: "planning", enteredAt: "2026-08-24T12:25:01Z", leftAt: "2026-08-24T12:35:31Z", attempts: [{ id: "attempt-1", state: "completed", outcome: "completed", startedAt: "2026-08-24T12:25:02Z", endedAt: "2026-08-24T12:35:30Z", transcriptAvailable: true, transcriptByteSize: 100, transcriptSha256: "a".repeat(64) }], links: [] },
      { sequence: 3, stageId: "review", enteredAt: "2026-08-24T12:35:31Z", leftAt: "2026-08-24T12:55:47Z", attempts: [], links: [] },
      { sequence: 4, stageId: "planning", enteredAt: "2026-08-24T12:55:47Z", leftAt: "2026-08-24T13:01:15Z", attempts: [{ id: "attempt-2", state: "completed", outcome: "completed", startedAt: "2026-08-24T12:55:48Z", endedAt: "2026-08-24T13:01:14Z", transcriptAvailable: true, transcriptByteSize: 200, transcriptSha256: "b".repeat(64) }], links: [
        { kind: "pull_request", label: "PR #59", url: "https://github.com/sachinkundu/deos/pull/59" },
        { kind: "openspec_artifact", label: "openspec/changes/sac-129/proposal.md", url: `https://github.com/sachinkundu/deos/blob/${"c".repeat(40)}/openspec/changes/sac-129/proposal.md` },
      ] },
      { sequence: 5, stageId: "review", enteredAt: "2026-08-24T13:01:15Z", leftAt: "2026-08-24T13:22:15Z", attempts: [], links: [] },
      { sequence: 6, stageId: "merge", enteredAt: "2026-08-24T13:22:15Z", leftAt: "2026-08-24T13:22:21Z", attempts: [], links: [] },
      { sequence: 7, stageId: "merge", enteredAt: "2026-08-24T13:22:21Z", leftAt: "2026-08-24T13:22:26Z", attempts: [], links: [] },
      { sequence: 8, stageId: "complete", enteredAt: "2026-08-24T13:22:26Z", leftAt: null, attempts: [], links: [] },
    ],
  });
  assert.equal(issue.key, "SAC-129");
  assert.equal(issue.state, "finished");
  assert.equal(issue.currentStep, "done");
  assert.equal(issue.pullRequest.label, "PR #59");
  assert.equal(issue.stageDetails.planning.files.length, 1);
  assert.equal(issue.agentRuns.planning.length, 2);
  assert.equal(issue.cycles.planning, 2);
  assert.deepEqual(issue.stageDetails.planning.facts.map((fact) => fact.label), ["Started", "Duration"]);
});
