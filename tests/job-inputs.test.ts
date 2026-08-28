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
          if (sql.includes("SELECT trial_repository")) {
            return Promise.resolve({ trial_repository: "sachinkundu/deos" });
          }
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

test("materializer gives the next author trusted deterministic rejection feedback", async () => {
  const database = {
    prepare(sql: string) {
      return {
        bind() { return this; },
        all() {
          return Promise.resolve({ results: sql.includes("JOIN artifact_manifests") ? [{
            node_id: "planning_author",
            attempt_id: "attempt-prior",
            result_class: "invalid_candidate",
            result_detail: "candidate readability failed for proposal.md: reading ease 48.84 (minimum 70)",
            manifest_id: "manifest-prior",
            r2_key: "runs/prior/manifest.json",
            completed_at: "2026-08-27T10:53:03.135Z",
          }] : [] });
        },
        first() {
          if (sql.includes("SELECT trial_repository")) {
            return Promise.resolve({ trial_repository: "sachinkundu/deos-sample-project" });
          }
          return Promise.resolve(null);
        },
      };
    },
  } as unknown as D1Database;
  const artifacts = {
    get: async () => ({
      text: async () => JSON.stringify({ outcome: "completed", summary: "Drafted the plan." }),
    }),
  } as unknown as R2Bucket;
  const materializer = new JobInputMaterializer(
    database,
    artifacts,
    "https://api.linear.app/graphql",
    "test-token",
    {
      fetch: async () => Response.json({ data: { issue: {
        id: "issue-1",
        identifier: "SAC-133",
        title: "Show review readiness",
        description: "Keep the summary clear.",
        url: "https://linear.example/SAC-133",
        state: { id: "todo", name: "Todo" },
        project: { id: "project-1", name: "DEOS Sample" },
        comments: { nodes: [] },
      } } }),
    },
  );
  const result = await materializer.materialize({
    run_id: "workflow:project-1:issue-1:run:1",
    project_id: "project-1",
    issue_id: "issue-1",
  } as OrchestrationRunRecord, {
    id: "openspec_continue",
    promptFile: "prompts/openspec.md",
    prompt: "Continue.",
    inputs: [],
    context: [],
    resultSchemaFile: "schemas/result.json",
    resultSchema: { $id: "https://deos.dev/result.json", type: "object" },
    requiredOutputs: [],
    operation: { kind: "openspec", instruction: "/opsx:continue" },
  } as const satisfies WorkflowJob);

  const context = JSON.parse(result.context);
  assert.equal(context.priorAttempts[0].outcome, "invalid_candidate");
  assert.match(context.priorAttempts[0].trustedResultDetail, /reading ease 48\.84/);
});

test("planning materializer allocates one run branch and bounds both feedback providers", async () => {
  let workProduct: Record<string, unknown> | null = null;
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) { values = bound; return this; },
        all() { return Promise.resolve({ results: [] }); },
        run() {
          if (sql.includes("INSERT OR IGNORE INTO run_work_products") && workProduct === null) {
            workProduct = {
              run_id: values[0],
              repository: values[1],
              base_branch: "main",
              remote_branch: values[2],
              change_id: values[3],
              pull_request_database_id: "9001",
              pull_request_number: 54,
              pull_request_url: "https://github.com/sachinkundu/deos/pull/54",
              head_sha: "head-sha",
              planning_manifest_digest: "manifest-digest",
              planning_manifest_json: "[]",
              latest_publication_operation_id: "operation-prior",
              merge_operation_id: null,
              merge_commit_sha: null,
              verification_operation_id: null,
              verified_at: null,
              created_at: values[4],
              updated_at: values[5],
            };
          }
          return Promise.resolve({ meta: { changes: 1 } });
        },
        first() {
          if (sql.includes("SELECT trial_repository")) {
            return Promise.resolve({ trial_repository: "sachinkundu/deos" });
          }
          if (sql.includes("SELECT * FROM run_work_products")) return Promise.resolve(workProduct);
          return Promise.resolve(null);
        },
      };
    },
  } as unknown as D1Database;
  const comments = Array.from({ length: 25 }, (_, index) => ({
    id: `comment-${index}`,
    body: `Human feedback ${index}`,
    updatedAt: `2026-08-23T10:${String(index).padStart(2, "0")}:00.000Z`,
  }));
  const materializer = new JobInputMaterializer(
    database,
    {} as R2Bucket,
    "https://api.linear.app/graphql",
    "test-token",
    {
      now: () => new Date("2026-08-23T11:00:00.000Z"),
      fetch: async () => Response.json({
        data: {
          issue: {
            id: "issue-1",
            identifier: "SAC-200",
            title: "Plan the change",
            description: "Task data.",
            url: "https://linear.example/SAC-200",
            state: { id: "todo-state", name: "Todo" },
            project: { id: "project-1", name: "DEOS Test" },
            comments: { nodes: comments },
          },
        },
      }),
      readGitHubReviewFeedback: async () => Array.from({ length: 60 }, (_, index) => ({
        id: index,
        body: `Review ${index}`,
      })),
    },
  );
  const job = {
    id: "openspec_planning",
    promptFile: "prompts/openspec-planning.md",
    prompt: "Plan.",
    inputs: ["linear_issue", "openspec_change", "planning_feedback"],
    context: ["prior_artifact_manifests", "planning_pull_request"],
    resultSchemaFile: "schemas/result.json",
    resultSchema: { $id: "https://deos.dev/result.json", type: "object" },
    requiredOutputs: [],
    capabilities: ["github.publish_planning_work_product"],
    operation: null,
  } as const satisfies WorkflowJob;
  const result = await materializer.materialize({
    run_id: "workflow:project-1:issue-1:run:1",
    project_id: "project-1",
    issue_id: "issue-1",
  } as OrchestrationRunRecord, job);
  assert.equal(result.openspecChange, "sac-200");
  assert.match(result.planningWorkProduct?.remote_branch ?? "", /^deos\/planning\/[a-f0-9]{24}$/);
  const context = JSON.parse(result.context);
  assert.deepEqual(context.openspec, { change: "sac-200", instruction: null });
  assert.equal(context.planning.pullRequest.number, 54);
  assert.equal(context.planning.feedback.linearComments.length, 20);
  assert.equal(context.planning.feedback.github.length, 50);
  assert.equal(context.repository.planningBranch, result.planningWorkProduct?.remote_branch);
});
