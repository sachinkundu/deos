import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  authorCorrectionPrompt,
  changedPathsFromPorcelain,
  runAuthorCompletionCheck,
  runBoundedAuthorCompletion,
} from "../container/author-completion.mjs";

const CHANGE = "add-review";
const ROOT = `openspec/changes/${CHANGE}`;
const FILES = [
  `${ROOT}/.openspec.yaml`,
  `${ROOT}/proposal.md`,
  `${ROOT}/specs/review-step/spec.md`,
];

const easyProposal = `## Why

People need a clear plan. It helps them review work with care.

## What Changes

- Add a clear review step. It checks the plan before approval.
`;

const easySpec = `## ADDED Requirements

### Requirement: Check the plan

The system SHALL check the plan before a person approves it.

#### Scenario: Plan is ready

- **WHEN** the plan is complete
- **THEN** the system checks it
`;

const difficultProposal = `## Why

Institutional interoperability characteristics necessitate comprehensive architectural reconciliation.
`;

const fakeCommand = async (args: string[]) => {
  if (args[0] === "git" && args[1] === "status") {
    return { code: 0, signal: null, truncated: false, stdout: FILES.map((path) => `?? ${path}\0`).join(""), stderr: "" };
  }
  if (args[0] === "git" && args[1] === "ls-files") {
    return { code: 0, signal: null, truncated: false, stdout: `${FILES.join("\n")}\n`, stderr: "" };
  }
  if (args[0] === "openspec") {
    return { code: 0, signal: null, truncated: false, stdout: "Change is valid\n", stderr: "" };
  }
  throw new Error(`unexpected command ${args.join(" ")}`);
};

test("completion check reports exact scores and passes after an in-place wording repair", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "deos-author-completion-"));
  try {
    await mkdir(`${cwd}/${ROOT}/specs/review-step`, { recursive: true });
    await writeFile(`${cwd}/${ROOT}/.openspec.yaml`, "schema: spec-driven\n");
    await writeFile(`${cwd}/${ROOT}/proposal.md`, difficultProposal);
    await writeFile(`${cwd}/${ROOT}/specs/review-step/spec.md`, easySpec);

    const failed = await runAuthorCompletionCheck({ cwd, change: CHANGE, execute: fakeCommand });
    assert.equal(failed.ok, false);
    assert.equal(failed.readability, "failed");
    assert.match(failed.failures.join("\n"), /Rewrite .*proposal\.md: reading ease .*minimum 70.*grade .*maximum 8/);
    assert.match(authorCorrectionPrompt(failed, 1, 2), /same session and checkout/);

    await writeFile(`${cwd}/${ROOT}/proposal.md`, easyProposal);
    const passed = await runAuthorCompletionCheck({ cwd, change: CHANGE, execute: fakeCommand });
    assert.equal(passed.ok, true);
    assert.equal(passed.readability, "passed");
    assert.deepEqual(passed.failures, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("completion check rejects a changed file outside the named plan", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "deos-author-paths-"));
  try {
    await mkdir(`${cwd}/${ROOT}/specs/review-step`, { recursive: true });
    await writeFile(`${cwd}/${ROOT}/.openspec.yaml`, "schema: spec-driven\n");
    await writeFile(`${cwd}/${ROOT}/proposal.md`, easyProposal);
    await writeFile(`${cwd}/${ROOT}/specs/review-step/spec.md`, easySpec);
    const execute = async (args: string[]) => {
      const result = await fakeCommand(args);
      return args[0] === "git" && args[1] === "status"
        ? { ...result, stdout: `${result.stdout} M src/runtime.ts\0` }
        : result;
    };
    const checked = await runAuthorCompletionCheck({ cwd, change: CHANGE, execute });
    assert.equal(checked.allowedPaths, "failed");
    assert.match(checked.failures.join("\n"), /Revert changes outside this plan: src\/runtime\.ts/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("porcelain parser keeps both sides of a rename", () => {
  assert.deepEqual(
    changedPathsFromPorcelain("R  openspec/changes/add-review/proposal.md\0old-proposal.md\0"),
    ["old-proposal.md", "openspec/changes/add-review/proposal.md"],
  );
});

test("bounded completion resumes the exact session and never allocates another attempt", async () => {
  const failed = {
    ok: false,
    allowedPaths: "passed" as const,
    strictOpenSpec: "passed" as const,
    whitespace: "passed" as const,
    readability: "failed" as const,
    changedPaths: [],
    filePaths: FILES,
    readabilityByFile: {},
    failures: ["Rewrite proposal.md: reading ease 50 (minimum 70); Flesch-Kincaid grade 10 (maximum 8)."],
  };
  const passed = { ...failed, ok: true, readability: "passed" as const, failures: [] };
  const resumes: Array<{ sessionId: string; prompt: string }> = [];
  const completed = await runBoundedAuthorCompletion({
    initialCheck: failed,
    initialResult: { code: 0, signal: null, outcome: "completed" },
    sessionId: "session-123",
    maximumRepairs: 2,
    resume: async (input) => {
      resumes.push(input);
      return { code: 0, signal: null, outcome: "completed" };
    },
    check: async () => passed,
    now: () => "2026-08-27T12:00:00.000Z",
  });
  assert.equal(completed.check.ok, true);
  assert.equal(completed.rounds.length, 2);
  assert.deepEqual(resumes.map(({ sessionId }) => sessionId), ["session-123"]);
  assert.match(resumes[0].prompt, /in-place correction 1 of 2/);
});
