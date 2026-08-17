import assert from "node:assert/strict";
import test from "node:test";

import { JobInputMaterializer, openSpecChangeIdentity } from "../src/job-inputs.ts";
import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import type { WorkflowJob } from "../src/workflow-definition.ts";

test("trusted Linear identifiers produce stable OpenSpec change identities", () => {
  assert.equal(openSpecChangeIdentity("SAC-123"), "sac-123");
  assert.equal(openSpecChangeIdentity("DEMO-7"), "demo-7");
});

test("invalid Linear identifiers cannot become OpenSpec change identities", () => {
  assert.throws(() => openSpecChangeIdentity("SAC 123"), /cannot form an OpenSpec change identity/);
  assert.throws(() => openSpecChangeIdentity("SAC_123"), /cannot form an OpenSpec change identity/);
});

test("materializer records the OpenSpec operation and latest cumulative patch reference", async () => {
  const database = {
    prepare(sql: string) {
      return {
        bind() { return this; },
        all() { return Promise.resolve({ results: [] }); },
        first() {
          return Promise.resolve(sql.includes("f.logical_name = 'patch.diff'") ? {
            attempt_id: "attempt-prior",
            manifest_id: "manifest-prior",
            r2_key: "runs/prior/patch.diff",
            sha256: "a".repeat(64),
          } : null);
        },
      };
    },
  } as unknown as D1Database;
  const fetchIssue: typeof fetch = async () => Response.json({
    data: {
      issue: {
        id: "issue-1",
        identifier: "SAC-123",
        title: "Build a calculator CLI",
        description: "Use OpenSpec end to end.",
        url: "https://linear.example/SAC-123",
        state: { id: "state-1", name: "In Progress" },
        project: { id: "project-1", name: "DEOS Test" },
        comments: { nodes: [] },
      },
    },
  });
  const materializer = new JobInputMaterializer(
    database,
    {} as R2Bucket,
    "https://api.linear.app/graphql",
    "test-token",
    { fetch: fetchIssue },
  );
  const run = {
    run_id: "workflow:project-1:issue-1:run:1",
    project_id: "project-1",
    issue_id: "issue-1",
  } as OrchestrationRunRecord;
  const job = {
    id: "openspec_continue",
    promptFile: "prompts/openspec.md",
    prompt: "Continue.",
    inputs: [],
    context: [],
    resultSchemaFile: "schemas/result.json",
    resultSchema: { $id: "https://deos.dev/result.json", type: "object" },
    requiredOutputs: [],
    operation: { kind: "openspec", instruction: "/opsx:continue" },
  } as const satisfies WorkflowJob;

  const result = await materializer.materialize(run, job);
  assert.equal(result.openspecChange, "sac-123");
  assert.deepEqual(result.continuationPatch, {
    attemptId: "attempt-prior",
    manifestId: "manifest-prior",
    r2Key: "runs/prior/patch.diff",
    sha256: "a".repeat(64),
  });
  const context = JSON.parse(result.context);
  assert.deepEqual(context.openspec, { change: "sac-123", instruction: "/opsx:continue" });
  assert.deepEqual(context.repository.continuationPatch, result.continuationPatch);
});
