import assert from "node:assert/strict";
import test from "node:test";

import {
  scoreReadability,
  validatePlanningPublication,
  type PlanningPublicationRequest,
} from "../src/planning-publication.ts";

const CHANGE = "sac-200";
const PREFIX = `openspec/changes/${CHANGE}/`;
const CONTEXT = {
  issueIdentifier: "SAC-200",
  issueUrl: "https://linear.app/deos/issue/SAC-200/test",
  issueTitle: "Build a shorter planning workflow",
  issueDescription: "Generate one planning pull request from a labeled issue.",
};

const request = (overrides: Partial<PlanningPublicationRequest> = {}): PlanningPublicationRequest => ({
  version: 1,
  action: "publish_planning_work_product",
  operationKey: "planning-publish-attempt-1",
  repository: "sachinkundu/deos",
  baseBranch: "main",
  change: CHANGE,
  title: "SAC-200: OpenSpec plan",
  body: [
    `Linear: [SAC-200](${CONTEXT.issueUrl})`,
    `OpenSpec change: ${CHANGE}`,
    "",
    "## Review notes",
    "- Review the branch rule before the merge begins.",
    "",
    "## Review order",
    "1. proposal.md",
    "2. Specs: specs/example/spec.md",
    "",
    "## Validation",
    "- openspec validate sac-200 --strict — passed",
    "- readability proposal.md — ease 90, grade 3 — passed",
    "- readability specs/example/spec.md — ease 90, grade 3 — passed",
  ].join("\n"),
  files: [
    { path: `${PREFIX}.openspec.yaml`, content: "schema: spec-driven\n" },
    { path: `${PREFIX}proposal.md`, content: "This plan is small. It gives the team one clear review.\n" },
    {
      path: `${PREFIX}specs/example/spec.md`,
      content: "The system saves the plan. It waits for a person to approve the next step.\n",
    },
  ],
  reviewReplies: [],
  ...overrides,
});

test("planning manifest and human review template validate deterministically", async () => {
  const validated = await validatePlanningPublication(request(), CONTEXT);
  assert.deepEqual(validated.reviewNotes, [
    "Review the branch rule before the merge begins.",
  ]);
  assert.deepEqual(validated.readability, {
    fleschReadingEase: 71.82,
    fleschKincaidGrade: 5.23,
  });
  assert.equal(validated.manifestDigest.length, 64);
  assert.equal(Object.keys(validated.fileReadability).length, 2);
  assert.ok(validated.fileReadability[`${PREFIX}proposal.md`].fleschReadingEase > 80);
  assert.deepEqual(
    JSON.parse(validated.manifestJson).map((entry: { path: string }) => entry.path),
    [...request().files].map((file) => file.path).sort(),
  );
});

test("planning publication rejects copied Linear content and non-review statements", async () => {
  await assert.rejects(validatePlanningPublication(request({
    body: request().body.replace(
      "Review the branch rule before the merge begins.",
      "Build a shorter planning workflow.",
    ),
  }), CONTEXT), /planning_linear_content_copied/);
  await assert.rejects(validatePlanningPublication(request({
    body: request().body.replace(
      "Review the branch rule before the merge begins.",
      "No implementation is included.",
    ),
  }), CONTEXT), /planning_body_invalid/);
});

test("planning publication rejects missing, stale-scope, and forbidden files", async () => {
  await assert.rejects(validatePlanningPublication(request({
    files: request().files.filter((file) => !file.path.endsWith("proposal.md")),
  }), CONTEXT));
  await assert.rejects(validatePlanningPublication(request({
    files: [...request().files, { path: "src/runtime.ts", content: "forbidden" }],
  }), CONTEXT), /planning_files_invalid/);
  await assert.rejects(validatePlanningPublication(request({
    files: [...request().files, { path: `${PREFIX}design.md`, content: "Easy text.\n" }],
  }), CONTEXT), /planning_files_invalid/);
  await assert.rejects(validatePlanningPublication(request({
    files: [...request().files, { path: `${PREFIX}tasks.md`, content: "Easy text.\n" }],
  }), CONTEXT), /planning_files_invalid/);
  await assert.rejects(validatePlanningPublication(request({
    files: request().files.map((file) => file.path.endsWith("spec.md")
      ? { ...file, path: `${PREFIX}specs/../canonical/spec.md` }
      : file),
  }), CONTEXT));
  await assert.rejects(validatePlanningPublication(request({
    files: request().files.map((file) => file.path.endsWith("proposal.md")
      ? {
          ...file,
          content: "Interoperability characteristics necessitate comprehensive architectural reconciliation.",
        }
      : file),
  }), CONTEXT), /planning_readability_invalid/);
});

test("planning publication accepts bounded review acknowledgments and rejects unsafe reply data", async () => {
  const validated = await validatePlanningPublication(request({
    reviewReplies: [
      { commentId: 101, body: "Updated the term to temperature as requested." },
      { commentId: 102, body: "Kept the limit because the provider requires it." },
    ],
  }), CONTEXT);
  assert.equal(validated.reviewReplies.length, 2);
  await assert.rejects(validatePlanningPublication(request({
    reviewReplies: [
      { commentId: 101, body: "Updated it." },
      { commentId: 101, body: "Updated it again." },
    ],
  }), CONTEXT), /planning_review_replies_invalid/);
  await assert.rejects(validatePlanningPublication(request({
    reviewReplies: [{ commentId: 101, body: "Done. <!-- hidden -->" }],
  }), CONTEXT), /planning_review_replies_invalid/);
});

test("readability boundaries allow easier text", () => {
  assert.deepEqual(scoreReadability("Review the branch rule before the merge begins."), {
    fleschReadingEase: 71.82,
    fleschKincaidGrade: 5.23,
  });
  assert.ok(scoreReadability("Check it.").fleschReadingEase > 80);
});
