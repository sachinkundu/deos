import assert from "node:assert/strict";
import test from "node:test";

import { mintCapabilityToken } from "../src/capability-auth.ts";
import { CapabilityRouter } from "../src/capability-router.ts";
import type { CapabilityStore } from "../src/capability-store.ts";
import type { ProviderOperationRecord, ProviderOperationState } from "../src/linear-transition.ts";
import type { RunWorkProductRecord } from "../src/planning-store.ts";

const SECRET = "planning-capability-secret-with-more-than-thirty-two-bytes";
const NOW = new Date("2026-08-23T10:00:00.000Z");
const RUN = "workflow:project-1:issue-1:run:1";
const ATTEMPT = "00000000-0000-7000-8000-000000000001";
const BRANCH = "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa";
const CHANGE = "sac-200";

const claims = {
  version: 1 as const,
  issuer: "deos" as const,
  audience: "sandbox-capabilities" as const,
  attemptId: ATTEMPT,
  runId: RUN,
  repository: "sachinkundu/deos",
  issueId: "issue-1",
  actions: ["github.publish_planning_work_product"] as const,
  changeId: CHANGE,
  planningBranch: BRANCH,
  expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
};

class OperationStore implements CapabilityStore {
  operation: ProviderOperationRecord | null = null;
  context() {
    return Promise.resolve({
      attemptId: ATTEMPT,
      runId: RUN,
      issueId: "issue-1",
      projectId: "project-1",
      repository: "sachinkundu/deos",
      attemptState: "running",
    });
  }
  begin(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    capability: string;
    action: string;
    sanitizedTarget: string;
    requestDigest: string;
    now: string;
  }) {
    if (this.operation === null) {
      this.operation = {
        operation_id: input.operationId,
        run_id: input.runId,
        attempt_id: input.attemptId,
        capability: input.capability,
        action: input.action,
        sanitized_target: input.sanitizedTarget,
        request_digest: input.requestDigest,
        state: "pending",
        provider_resource_id: null,
        observed_pre_state: null,
        provider_updated_at: null,
        latest_delivery_id: null,
        safe_error_category: null,
        diagnostic_id: null,
        started_at: input.now,
        updated_at: input.now,
        completed_at: null,
      };
      return Promise.resolve({ operation: this.operation, created: true });
    }
    if (this.operation.request_digest !== input.requestDigest) {
      return Promise.reject(new Error("request digest conflict"));
    }
    return Promise.resolve({ operation: this.operation, created: false });
  }
  find() { return Promise.resolve(this.operation); }
  finish(input: {
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }) {
    if (this.operation?.state !== input.expected) return Promise.resolve(false);
    this.operation.state = input.state;
    this.operation.provider_resource_id = input.providerResourceId;
    this.operation.safe_error_category = input.safeErrorCategory;
    this.operation.updated_at = input.now;
    this.operation.completed_at = input.now;
    return Promise.resolve(true);
  }
}

class PlanningStore {
  record: RunWorkProductRecord = {
    run_id: RUN,
    repository: "sachinkundu/deos",
    base_branch: "main",
    remote_branch: BRANCH,
    change_id: CHANGE,
    pull_request_database_id: null,
    pull_request_number: null,
    pull_request_url: null,
    head_sha: null,
    planning_manifest_digest: null,
    planning_manifest_json: null,
    latest_publication_operation_id: null,
    merge_operation_id: null,
    merge_commit_sha: null,
    verification_operation_id: null,
    verified_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
  findRunWorkProduct() { return Promise.resolve(this.record); }
  recordPublication(input: {
    pullRequestDatabaseId: string;
    pullRequestNumber: number;
    pullRequestUrl: string;
    headSha: string;
    planningManifestDigest: string;
    planningManifestJson: string;
    operationId: string;
    now: string;
  }) {
    Object.assign(this.record, {
      pull_request_database_id: input.pullRequestDatabaseId,
      pull_request_number: input.pullRequestNumber,
      pull_request_url: input.pullRequestUrl,
      head_sha: input.headSha,
      planning_manifest_digest: input.planningManifestDigest,
      planning_manifest_json: input.planningManifestJson,
      latest_publication_operation_id: input.operationId,
      updated_at: input.now,
    });
    return Promise.resolve(this.record);
  }
}

const publication = () => ({
  version: 1,
  action: "publish_planning_work_product",
  operationKey: `planning-publish-${ATTEMPT}`,
  repository: "sachinkundu/deos",
  baseBranch: "main",
  change: CHANGE,
  title: "SAC-200: OpenSpec plan",
  body: [
    "Linear: [SAC-200](https://linear.app/deos/issue/SAC-200/test)",
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
    { path: `openspec/changes/${CHANGE}/.openspec.yaml`, content: "schema: spec-driven\n" },
    {
      path: `openspec/changes/${CHANGE}/proposal.md`,
      content: "This plan is small. It gives the team one clear review.\n",
    },
    {
      path: `openspec/changes/${CHANGE}/specs/example/spec.md`,
      content: "The system saves the plan. It waits for a person to approve the next step.\n",
    },
  ],
});

const setup = async () => {
  const operations = new OperationStore();
  const planning = new PlanningStore();
  let githubCalls = 0;
  let linearWrites = 0;
  const router = new CapabilityRouter({
    store: operations,
    github: {
      publishPlanning: async () => {
        githubCalls += 1;
        return {
          pullRequestDatabaseId: "9001",
          pullRequestNumber: 54,
          pullRequestUrl: "https://github.com/sachinkundu/deos/pull/54",
          branch: BRANCH,
          headSha: "head-sha",
          reconciled: githubCalls > 1,
        };
      },
    } as never,
    linear: {
      readPublicationContext: async () => ({
        issueId: "issue-1",
        identifier: "SAC-200",
        title: "Build a shorter planning workflow",
        description: "Generate one planning pull request from a labeled issue.",
        url: "https://linear.app/deos/issue/SAC-200/test",
      }),
      upsertNote: async () => {
        linearWrites += 1;
        return { commentId: "comment", reconciled: false };
      },
    } as never,
    planningStore: planning,
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(claims, SECRET);
  const invoke = (path: "github" | "linear", body: unknown) => router.handle(new Request(
    `https://worker.test/capabilities/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": ATTEMPT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  ));
  return { invoke, operations, planning, githubCalls: () => githubCalls, linearWrites: () => linearWrites };
};

test("planning grant publishes one complete manifest and records PR number apart from database id", async () => {
  const state = await setup();
  const first = await state.invoke("github", publication());
  const second = await state.invoke("github", publication());
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(state.githubCalls(), 2);
  assert.equal(state.planning.record.pull_request_database_id, "9001");
  assert.equal(state.planning.record.pull_request_number, 54);
  assert.equal(state.planning.record.remote_branch, BRANCH);
  assert.equal(state.planning.record.latest_publication_operation_id, state.operations.operation?.operation_id);
});

test("planning-only grant rejects generic GitHub, Linear, wrong change, and copied issue content", async () => {
  const genericState = await setup();
  const generic = { ...publication(), action: "publish_work_product", branch: `deos/${ATTEMPT}` };
  assert.equal((await genericState.invoke("github", generic)).status, 403);
  const linearState = await setup();
  assert.equal((await linearState.invoke("linear", {
    version: 1,
    action: "upsert_working_note",
    operationKey: "note",
    issueId: "issue-1",
    body: "No",
  })).status, 403);
  assert.equal(linearState.linearWrites(), 0);
  const changeState = await setup();
  assert.equal((await changeState.invoke("github", { ...publication(), change: "sac-201" })).status, 403);
  const contentState = await setup();
  assert.equal((await contentState.invoke("github", {
    ...publication(),
    body: publication().body.replace(
      "Review the branch rule before the merge begins.",
      "Build a shorter planning workflow.",
    ),
  })).status, 403);
  assert.equal(genericState.githubCalls(), 0);
  assert.equal(changeState.githubCalls(), 0);
  assert.equal(contentState.githubCalls(), 0);
});
