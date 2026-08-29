import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { reviewOpenSpecTraceability } from "../src/review-traceability.js";
import { loadTraceability } from "../src/traceability.js";

const fixture = fileURLToPath(new URL("fixtures/traceability/sample-change", import.meta.url));

async function mutableFixture() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "bettaview-review-traceability-"));
  const changeDirectory = path.join(temporaryRoot, "sample-change");
  await cp(fixture, changeDirectory, { recursive: true });
  return {
    changeDirectory,
    cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
  };
}

function passingJudgment(direction) {
  const judgment = {
    coverage: "sufficient",
    scope: "in_scope",
    minimality: "minimal",
    rationale: "The cited behavior is covered without unrelated requirements.",
  };
  if (direction === "proposal_to_spec") return { proposalStatements: [{
      proposalLine: 7,
      requirementLinkIds: ["job-resume-requirement-3"],
      coverage: "sufficient",
      rationale: "The requirement implements the proposal statement.",
    }] };
  return {
    passingJudgment: judgment,
    capabilities: [{
      path: "job-resume",
      capabilityLine: 13,
      judgment,
      links: [{
        id: "job-resume-requirement-3",
        proposalLines: [7],
        specStartLine: 3,
        judgment,
      }],
    }],
    findings: [],
  };
}

test("runs the complete judge, materialize, validate, and publish workflow", async (t) => {
  const copy = await mutableFixture();
  t.after(copy.cleanup);
  let receivedPrompt;

  const receivedPrompts = [];
  const result = await reviewOpenSpecTraceability({
    changeDirectory: copy.changeDirectory,
    model: "test-model",
    judge: async ({ prompt, direction }) => {
      receivedPrompt = prompt;
      receivedPrompts.push({ prompt, direction });
      return passingJudgment(direction);
    },
  });

  assert.equal(result.attempts, 2);
  assert.deepEqual(receivedPrompts.map(({ direction }) => direction), ["proposal_to_spec", "spec_to_proposal"]);
  assert.match(receivedPrompt, /Immutable source: proposal\.md/);
  assert.match(receivedPrompt, /Capabilities:\n- job-resume: proposal\.md:13/);
  assert.match(receivedPrompt, /\s+7 \| - Resume a paused job/);
  const traceability = await loadTraceability(copy.changeDirectory);
  assert.equal(traceability.version, 4);
  assert.equal(traceability.review.overall, "pass");
  assert.equal(traceability.review.reviewer.name, "codex-cli");
  assert.equal(traceability.review.reviewer.version, "test-model (high) via injected-judge");
  assert.equal(traceability.change, "sample-change");
});

test("accepts and preserves a one-sided semantic relationship", async (t) => {
  const copy = await mutableFixture();
  t.after(copy.cleanup);

  await reviewOpenSpecTraceability({
    changeDirectory: copy.changeDirectory,
    model: "test-model",
    judge: async ({ direction }) => {
      const judgment = passingJudgment(direction);
      if (direction === "proposal_to_spec") {
        judgment.proposalStatements[0].requirementLinkIds = [];
        judgment.proposalStatements[0].coverage = "missing";
        judgment.proposalStatements[0].rationale = "This pass did not find an implementing requirement.";
      }
      return judgment;
    },
  });

  const traceability = await loadTraceability(copy.changeDirectory);
  assert.equal(traceability.review.overall, "findings");
  assert.deepEqual(traceability.proposalStatements[0].requirementLinks, []);
  assert.equal(traceability.directionalLinks[0].status, "requirement_only");
  assert.equal(traceability.directionalLinks[0].proposalFirst.claimed, false);
  assert.equal(traceability.directionalLinks[0].requirementFirst.claimed, true);
});

test("feeds an exact deterministic rejection into a bounded repair pass", async (t) => {
  const copy = await mutableFixture();
  t.after(copy.cleanup);
  const attempts = [];

  const result = await reviewOpenSpecTraceability({
    changeDirectory: copy.changeDirectory,
    model: "test-model",
    maxRepairs: 1,
    judge: async ({ direction, attempt, repair }) => {
      attempts.push({ direction, attempt, repair });
      const judgment = passingJudgment(direction);
      if (direction === "proposal_to_spec" && attempt === 0) judgment.proposalStatements[0].requirementLinkIds = [];
      return judgment;
    },
  });

  assert.equal(result.attempts, 3);
  assert.equal(attempts[0].repair, undefined);
  assert.match(attempts[1].repair.error, /sufficient proposal statement 7 must claim a requirement/);
});

test("capability identity repair names the expected and received identifiers", async (t) => {
  const copy = await mutableFixture();
  t.after(copy.cleanup);
  const attempts = [];
  const result = await reviewOpenSpecTraceability({
    changeDirectory: copy.changeDirectory,
    model: "test-model",
    maxRepairs: 1,
    judge: async ({ direction, attempt, repair }) => {
      attempts.push({ direction, attempt, repair });
      const judgment = passingJudgment(direction);
      if (direction === "spec_to_proposal" && attempt === 0) {
        judgment.capabilities[0].path = "proposal.md";
      }
      return judgment;
    },
  });

  assert.equal(result.attempts, 3);
  assert.match(
    attempts.find(({ repair }) => repair)?.repair.error,
    /expected: job-resume; received: proposal\.md/,
  );
});

test("does not replace an existing sidecar when every candidate is rejected", async (t) => {
  const copy = await mutableFixture();
  t.after(copy.cleanup);
  const sidecarFile = path.join(copy.changeDirectory, "bettaview-traceability.json");
  const original = await readFile(sidecarFile, "utf8");

  await assert.rejects(reviewOpenSpecTraceability({
    changeDirectory: copy.changeDirectory,
    model: "test-model",
    maxRepairs: 0,
    judge: async ({ direction }) => {
      const judgment = passingJudgment(direction);
      if (direction === "spec_to_proposal") judgment.capabilities[0].links[0].specStartLine = 99;
      return judgment;
    },
  }), /Existing sidecar was not changed/);

  assert.equal(await readFile(sidecarFile, "utf8"), original);
});
