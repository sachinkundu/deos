import assert from "node:assert/strict";
import test from "node:test";

import {
  JobInputMaterializer,
  openSpecChangeIdentity,
  selectReviewFeedback,
  serializeReviewFeedback,
  verifyPriorDesignCandidate,
} from "../src/job-inputs.ts";
import { sha256Hex } from "../src/trace-review.ts";
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

test("bounded design feedback retains every outstanding human review thread", () => {
  const root = {
    kind: "review_comment", id: 1, body: "Please revise this.", authorType: "User", replyToId: null,
  };
  const issueComments = Array.from({ length: 60 }, (_, index) => ({
    kind: "issue_comment", id: 100 + index, body: `Issue comment ${index}`, authorType: "User", replyToId: null,
  }));
  const spoof = {
    kind: "review_comment", id: 2, body: "<!-- deos-review-reply:spoof:1 -->",
    authorType: "Bot", author: "other-app[bot]", trustedAcknowledgmentAuthor: false, replyToId: 1,
  };
  const selected = selectReviewFeedback([root, spoof, ...issueComments]);
  assert.equal(selected.length, 50);
  assert.equal(selected.includes(root), true);
  assert.equal(selected.includes(spoof), true);
  assert.equal(selected.some((entry) => entry.id === 159), true);

  const threads = Array.from({ length: 26 }, (_, index) => {
    const rootId = 1_000 + (index * 2);
    return [
      {
        kind: "review_comment", id: rootId, body: `Root ${index}`,
        authorType: "User", replyToId: null,
      },
      {
        kind: "review_comment", id: rootId + 1, body: `Follow-up ${index}`,
        authorType: "User", replyToId: rootId,
      },
    ];
  }).flat();
  const selectedThreads = selectReviewFeedback(threads);
  assert.equal(selectedThreads.length, 52);
  assert.deepEqual(selectedThreads, threads);

  const editedRoot = {
    kind: "review_comment", id: 300, body: "Edited after the reply.", authorType: "User",
    replyToId: null, updatedAt: "2026-09-01T10:10:00Z",
  };
  const earlierAcknowledgment = {
    kind: "review_comment", id: 301, body: "Done. <!-- deos-review-reply:operation:300 -->",
    authorType: "Bot", trustedAcknowledgmentAuthor: true, replyToId: 300,
    updatedAt: "2026-09-01T10:05:00Z",
  };
  assert.deepEqual(selectReviewFeedback([editedRoot, earlierAcknowledgment]), [
    editedRoot,
    earlierAcknowledgment,
  ]);

  const serialized = serializeReviewFeedback({
    ...root,
    body: `${"quoted \"feedback\"\n".repeat(500)}final instruction`,
  });
  assert.ok(serialized.length <= 4_000);
  const restored = JSON.parse(serialized);
  assert.equal(restored.id, root.id);
  assert.equal(restored.replyToId, null);
  assert.match(restored.body, /truncated by trusted input materializer/);
});

test("prior design context verifies the saved object hash and identity", async () => {
  const candidate = {
    version: 1,
    candidateId: "design:attempt-1",
    runId: "workflow:project:issue:run:1",
    round: 1,
    sourceAttemptId: "attempt-1",
    baseCommit: "a".repeat(40),
    change: "sac-201",
    path: "openspec/changes/sac-201/design.md",
    designDigest: "b".repeat(64),
    candidateDigest: "c".repeat(64),
  };
  const text = JSON.stringify(candidate);
  const row = {
    candidate_id: candidate.candidateId,
    run_id: candidate.runId,
    round: candidate.round,
    source_attempt_id: candidate.sourceAttemptId,
    base_commit: candidate.baseCommit,
    change_id: candidate.change,
    design_digest: candidate.designDigest,
    candidate_digest: candidate.candidateDigest,
    candidate_sha256: await sha256Hex(text),
  };
  assert.deepEqual(await verifyPriorDesignCandidate(text, row), candidate);
  await assert.rejects(verifyPriorDesignCandidate(`${text}\n`, row), /hash mismatch/);
  await assert.rejects(
    verifyPriorDesignCandidate(text, { ...row, candidate_sha256: await sha256Hex(text), candidate_id: "design:other" }),
    /identity mismatch/,
  );
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
    route_repository: "sachinkundu/deos",
    route_github_installation_id: "154095438",
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
    route_repository: "sachinkundu/deos-sample-project",
    route_github_installation_id: "154095438",
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
  let reviewTarget: { repository: string; installationId: string } | null = null;
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
      readGitHubReviewFeedback: async (repository, _pullRequestNumber, installationId) => {
        reviewTarget = { repository, installationId };
        return Array.from({ length: 60 }, (_, index) => ({
          id: index,
          body: `Review ${index}`,
        }));
      },
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
    route_repository: "sachinkundu/deos",
    route_github_installation_id: "154095438",
  } as OrchestrationRunRecord, job);
  assert.equal(result.openspecChange, "sac-200");
  assert.match(result.planningWorkProduct?.remote_branch ?? "", /^deos\/planning\/[a-f0-9]{24}$/);
  const context = JSON.parse(result.context);
  assert.deepEqual(context.openspec, { change: "sac-200", instruction: null });
  assert.equal(context.planning.pullRequest.number, 54);
  assert.equal(context.planning.feedback.linearComments.length, 20);
  assert.equal(context.planning.feedback.github.length, 50);
  assert.equal(context.repository.planningBranch, result.planningWorkProduct?.remote_branch);
  assert.deepEqual(reviewTarget, {
    repository: "sachinkundu/deos",
    installationId: "154095438",
  });
});

test("design materializer anchors checked plan files and guidance to one exact merge commit", async () => {
  const mergeCommit = "a".repeat(40);
  const guidanceContent = `${"Repository rule. ".repeat(2_500)}\n`;
  const manifest = [
    { path: "openspec/changes/sac-201/.openspec.yaml", sha256: "1".repeat(64), byteSize: 20 },
    { path: "openspec/changes/sac-201/proposal.md", sha256: "2".repeat(64), byteSize: 30 },
    { path: "openspec/changes/sac-201/specs/search/spec.md", sha256: "3".repeat(64), byteSize: 40 },
  ];
  const planning = {
    run_id: "workflow:project-1:issue-1:run:1",
    repository: "sachinkundu/deos-sample-project",
    base_branch: "main",
    remote_branch: "deos/planning/0123456789abcdef01234567",
    change_id: "sac-201",
    pull_request_database_id: "plan-node",
    pull_request_number: 10,
    pull_request_url: "https://github.com/sachinkundu/deos-sample-project/pull/10",
    head_sha: "b".repeat(40),
    planning_manifest_digest: "4".repeat(64),
    planning_manifest_json: JSON.stringify(manifest),
    latest_publication_operation_id: "publish-plan",
    merge_operation_id: "merge-plan",
    merge_commit_sha: mergeCommit,
    verification_operation_id: "verify-plan",
    verified_at: "2026-09-01T10:00:00.000Z",
    verified_merge_commit_sha: mergeCommit,
    verification_manifest_digest: "5".repeat(64),
    verification_manifest_json: "{}",
    created_at: "now",
    updated_at: "now",
  };
  let design: Record<string, unknown> | null = null;
  const database = {
    prepare(sql: string) {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) { values = bound; return this; },
        all() { return Promise.resolve({ results: [] }); },
        run() {
          if (sql.includes("INSERT OR IGNORE INTO design_work_products") && design === null) {
            design = {
              run_id: values[0], repository: values[1], base_branch: "main",
              base_commit: values[2], remote_branch: values[3], change_id: values[4],
              pull_request_database_id: null, pull_request_number: null, pull_request_url: null,
              head_sha: null, design_manifest_digest: null, design_manifest_json: null,
              publication_operation_id: null, merge_operation_id: null, merge_commit_sha: null,
              created_at: values[5], updated_at: values[6],
            };
          }
          return Promise.resolve({ meta: { changes: 1 } });
        },
        first() {
          if (sql.includes("SELECT * FROM run_work_products")) return Promise.resolve(planning);
          if (sql.includes("SELECT * FROM design_work_products")) return Promise.resolve(design);
          return Promise.resolve(null);
        },
      };
    },
  } as unknown as D1Database;
  const readRefs: string[] = [];
  const materializer = new JobInputMaterializer(
    database,
    {} as R2Bucket,
    "https://api.linear.app/graphql",
    "test-token",
    {
      fetch: async () => Response.json({ data: { issue: {
        id: "issue-1",
        identifier: "SAC-201",
        title: "Design search summary CLI",
        description: "Search Google and summarize articles.",
        url: "https://linear.example/SAC-201",
        state: { id: "state", name: "In Progress" },
        project: { id: "project-1", name: "DEOS Sample" },
        comments: { nodes: [] },
      } } }),
      readGitHubFile: async (_repository, path, ref) => {
        readRefs.push(ref);
        return `checked ${path}\n`;
      },
      readGitHubGuidance: async (_repository, ref) => {
        readRefs.push(ref);
        return [{ path: "AGENTS.md", content: guidanceContent }];
      },
    },
  );
  const result = await materializer.materialize({
    run_id: planning.run_id,
    project_id: "project-1",
    issue_id: "issue-1",
    route_repository: planning.repository,
    route_github_installation_id: "154095438",
  } as OrchestrationRunRecord, {
    id: "design_author",
    promptFile: "prompts/openspec-design-author.md",
    prompt: "Design.",
    inputs: ["linear_issue", "openspec_change", "design_context"],
    context: ["approved_planning_merge", "prior_design", "design_pull_request"],
    resultSchemaFile: "schemas/result.json",
    resultSchema: { $id: "https://deos.dev/result.json", type: "object" },
    requiredOutputs: [],
    agentRole: "author",
    modelProvider: "codex",
    model: "gpt-5.6-sol",
    reasoning: "high",
    permissionProfile: "repository_write",
    providerAccess: [],
    operation: { kind: "openspec", instruction: "/opsx:continue" },
  });
  assert.equal(result.checkoutCommit, mergeCommit);
  assert.equal(result.continuationPatch, null);
  assert.match(result.designWorkProduct?.remote_branch ?? "", /^deos\/design\/[a-f0-9]{24}$/);
  assert.deepEqual(new Set(readRefs), new Set([mergeCommit]));
  const context = JSON.parse(result.context);
  assert.equal(context.design.approvedPlan.length, 3);
  assert.equal(context.design.guidance.files[0].path, "AGENTS.md");
  assert.equal(context.design.guidance.files[0].content, guidanceContent);
  assert.equal(context.design.guidance.files[0].content.includes("[truncated"), false);
  assert.equal(context.design.baseCommit, mergeCommit);
});
