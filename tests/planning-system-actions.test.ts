import assert from "node:assert/strict";
import test from "node:test";

import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import { manifestDigestFromFiles } from "../src/planning-publication.ts";
import type { RunWorkProductRecord } from "../src/planning-store.ts";
import { SystemActionController, type SystemActionStore } from "../src/system-actions.ts";
import type { ProviderOperationRecord, ProviderOperationState } from "../src/linear-transition.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const files = [
  { path: "openspec/changes/sac-200/.openspec.yaml", content: "schema: spec-driven\n" },
  { path: "openspec/changes/sac-200/proposal.md", content: "proposal\n" },
  { path: "openspec/changes/sac-200/specs/example/spec.md", content: "spec\n" },
  { path: "openspec/changes/sac-200/design.md", content: "design\n" },
  { path: "openspec/changes/sac-200/tasks.md", content: "tasks\n" },
];
const manifestDigest = await manifestDigestFromFiles(files);
const manifestJson = JSON.stringify(await Promise.all(files.map(async (file) => ({
  path: file.path,
  sha256: "unused-in-controller-test",
  byteSize: file.content.length,
}))));
const run = {
  run_id: "workflow:project-1:issue-1:run:1",
  current_visit_sequence: 3,
} as OrchestrationRunRecord;

class OperationStore implements SystemActionStore {
  readonly operations = new Map<string, ProviderOperationRecord>();
  prerequisites() { return Promise.resolve({ incompleteOperations: 0, actionReceipts: 0 }); }
  beginPlanningOperation(input: {
    operationId: string;
    runId: string;
    action: string;
    requestDigest: string;
    now: string;
  }) {
    const existing = this.operations.get(input.operationId);
    if (existing !== undefined) return Promise.resolve(existing);
    const operation: ProviderOperationRecord = {
      operation_id: input.operationId,
      run_id: input.runId,
      attempt_id: null,
      capability: "system_action",
      action: input.action,
      sanitized_target: "recorded-planning-pull-request",
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
    this.operations.set(input.operationId, operation);
    return Promise.resolve(operation);
  }
  finishPlanningOperation(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }) {
    const operation = this.operations.get(input.operationId);
    if (operation?.state !== input.expected) return Promise.resolve(false);
    operation.state = input.state;
    operation.provider_resource_id = input.providerResourceId;
    operation.safe_error_category = input.safeErrorCategory;
    operation.updated_at = input.now;
    operation.completed_at = input.now;
    return Promise.resolve(true);
  }
}

class PlanningStore {
  record: RunWorkProductRecord = {
    run_id: run.run_id,
    repository: "sachinkundu/deos",
    base_branch: "main",
    remote_branch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
    change_id: "sac-200",
    pull_request_database_id: "9001",
    pull_request_number: 54,
    pull_request_url: "https://github.com/sachinkundu/deos/pull/54",
    head_sha: "head-sha",
    planning_manifest_digest: manifestDigest,
    planning_manifest_json: manifestJson,
    latest_publication_operation_id: "publication-operation",
    merge_operation_id: null,
    merge_commit_sha: null,
    verification_operation_id: null,
    verified_at: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
  findRunWorkProduct() { return Promise.resolve(this.record); }
  recordMerge(input: { operationId: string; mergeCommitSha: string; now: string }) {
    this.record.merge_operation_id = input.operationId;
    this.record.merge_commit_sha = input.mergeCommitSha;
    this.record.updated_at = input.now;
    return Promise.resolve(this.record);
  }
  recordVerification(input: { operationId: string; now: string }) {
    this.record.verification_operation_id = input.operationId;
    this.record.verified_at = input.now;
    this.record.updated_at = input.now;
    return Promise.resolve(this.record);
  }
}

const setup = (substituteHead = false) => {
  const operations = new OperationStore();
  const planning = new PlanningStore();
  const controller = new SystemActionController(operations, {
    planningStore: planning,
    now: () => NOW,
    github: {
      mergePlanning: async (input) => {
        if (input.expectedHeadSha !== "head-sha") throw new Error("wrong head");
        return {
          pullRequestDatabaseId: "9001",
          pullRequestNumber: 54,
          mergeCommitSha: "merge-sha",
          reconciled: false,
        };
      },
      readPlanningPullRequest: async () => ({
        databaseId: "9001",
        number: 54,
        url: "https://github.com/sachinkundu/deos/pull/54",
        state: "closed",
        draft: false,
        merged: true,
        mergeCommitSha: "merge-sha",
        headBranch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
        headSha: substituteHead ? "substituted-head" : "head-sha",
        baseBranch: "main",
      }),
      readFileAtRef: async (_repository, path, ref) => {
        assert.equal(ref, "merge-sha");
        const file = files.find((candidate) => candidate.path === path);
        if (file === undefined) throw new Error("missing file");
        return file.content;
      },
      commitIsOnBranch: async () => true,
    },
  });
  return { controller, operations, planning };
};

test("trusted merge and independent manifest read-back are separate receipts", async () => {
  const state = setup();
  const merged = await state.controller.execute(
    run,
    "merge_planning_pr",
    "github.merge_planning_pull_request",
  );
  assert.equal(merged.outcome, "completed");
  assert.equal(state.planning.record.merge_commit_sha, "merge-sha");
  const verified = await state.controller.execute(
    { ...run, current_visit_sequence: 4 },
    "verify_planning_merge",
    "github.verify_planning_merge",
  );
  assert.equal(verified.outcome, "completed");
  assert.notEqual(
    state.planning.record.merge_operation_id,
    state.planning.record.verification_operation_id,
  );
  assert.equal([...state.operations.operations.values()].length, 2);
});

test("verification fails closed when GitHub reports a substituted head", async () => {
  const state = setup(true);
  await state.controller.execute(run, "merge_planning_pr", "github.merge_planning_pull_request");
  const verified = await state.controller.execute(
    { ...run, current_visit_sequence: 4 },
    "verify_planning_merge",
    "github.verify_planning_merge",
  );
  assert.equal(verified.outcome, "failed");
  assert.equal(state.planning.record.verified_at, null);
  assert.equal(
    [...state.operations.operations.values()].at(-1)?.state,
    "failed",
  );
});
