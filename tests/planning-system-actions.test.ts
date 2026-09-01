import assert from "node:assert/strict";
import test from "node:test";

import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import type { RunWorkProductRecord } from "../src/planning-store.ts";
import { SystemActionController, type SystemActionStore } from "../src/system-actions.ts";
import type { ProviderOperationRecord, ProviderOperationState } from "../src/linear-transition.ts";

const NOW = new Date("2026-08-23T12:00:00.000Z");
const manifestDigest = "a".repeat(64);
const run = {
  run_id: "workflow:project-1:issue-1:run:1",
  current_visit_sequence: 3,
  route_repository: "sachinkundu/deos",
  route_github_installation_id: "154095438",
} as OrchestrationRunRecord;

class OperationStore implements SystemActionStore {
  readonly operations = new Map<string, ProviderOperationRecord>();
  finishFailures = 0;
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
    if (this.finishFailures > 0) {
      this.finishFailures -= 1;
      return Promise.resolve(false);
    }
    operation.state = input.state;
    operation.provider_resource_id = input.providerResourceId;
    operation.safe_error_category = input.safeErrorCategory;
    operation.updated_at = input.now;
    operation.completed_at = input.now;
    return Promise.resolve(true);
  }
}

class PlanningStore {
  verificationWriteFailures = 0;
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
    planning_manifest_json: null,
    latest_publication_operation_id: "publication-operation",
    merge_operation_id: null,
    merge_commit_sha: null,
    verification_operation_id: null,
    verified_at: null,
    verified_merge_commit_sha: null,
    verification_manifest_digest: null,
    verification_manifest_json: null,
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
  recordVerification(input: {
    operationId: string;
    mergeCommitSha: string;
    verificationManifestDigest: string;
    verificationManifestJson: string;
    now: string;
  }) {
    if (this.verificationWriteFailures > 0) {
      this.verificationWriteFailures -= 1;
      throw new Error("planning verification write failed");
    }
    this.record.verification_operation_id = input.operationId;
    this.record.verified_merge_commit_sha = input.mergeCommitSha;
    this.record.verification_manifest_digest = input.verificationManifestDigest;
    this.record.verification_manifest_json = input.verificationManifestJson;
    this.record.verified_at = input.now;
    return Promise.resolve(this.record);
  }
}

const setup = () => {
  const operations = new OperationStore();
  const planning = new PlanningStore();
  const selectedInstallations: string[] = [];
  const github = {
    mergePlanning: async (input: { expectedHeadSha: string }) => {
      if (input.expectedHeadSha !== "head-sha") throw new Error("wrong head");
      return {
        pullRequestDatabaseId: "9001",
        pullRequestNumber: 54,
        mergeCommitSha: "merge-sha",
        reconciled: false,
      };
    },
    readPullRequest: async () => { throw new Error("unexpected pull-request read"); },
    verifyCommitOnBranch: async () => { throw new Error("unexpected commit verification"); },
    readFileAtRef: async () => { throw new Error("unexpected file read"); },
  };
  const controller = new SystemActionController(operations, {
    planningStore: planning,
    now: () => NOW,
    github: {
      mergePlanning: async () => { throw new Error("fixed installation fallback used"); },
      readPullRequest: async () => { throw new Error("fixed installation fallback used"); },
      verifyCommitOnBranch: async () => { throw new Error("fixed installation fallback used"); },
      readFileAtRef: async () => { throw new Error("fixed installation fallback used"); },
    },
    githubForRun: (selectedRun) => {
      if (selectedRun.route_github_installation_id === null || selectedRun.route_github_installation_id === undefined) {
        throw new Error("frozen installation missing");
      }
      selectedInstallations.push(selectedRun.route_github_installation_id);
      return github;
    },
  });
  return { controller, operations, planning, selectedInstallations };
};

test("trusted merge completion records one durable provider receipt", async () => {
  const state = setup();
  const merged = await state.controller.execute(
    run,
    "merge_planning_pr",
    "github.merge_planning_pull_request",
  );
  assert.equal(merged.outcome, "completed");
  assert.equal(state.planning.record.merge_commit_sha, "merge-sha");
  assert.equal(state.planning.record.verification_operation_id, null);
  assert.equal([...state.operations.operations.values()].length, 1);
  assert.deepEqual(state.selectedInstallations, ["154095438"]);
});

test("checked plan merge proves every accepted file at the reachable merge commit", async () => {
  const state = setup();
  const head = "1".repeat(40);
  const merge = "2".repeat(40);
  const fileContents = new Map([
    ["openspec/changes/sac-200/.openspec.yaml", "schema: spec-driven\n"],
    ["openspec/changes/sac-200/proposal.md", "## Why\n\nA clear plan helps.\n"],
    ["openspec/changes/sac-200/specs/tool/spec.md", "## ADDED Requirements\n"],
  ]);
  const digest = async (value: string) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  state.planning.record.head_sha = head;
  state.planning.record.merge_commit_sha = merge;
  state.planning.record.planning_manifest_json = JSON.stringify(await Promise.all(
    [...fileContents].map(async ([path, content]) => ({
      path,
      sha256: await digest(content),
      byteSize: new TextEncoder().encode(content).byteLength,
    })),
  ));
  state.planning.record.planning_manifest_digest = await digest(state.planning.record.planning_manifest_json);
  const github = {
    readPullRequest: async () => ({
      databaseId: "9001",
      number: 54,
      url: "https://github.com/sachinkundu/deos/pull/54",
      state: "closed",
      draft: false,
      merged: true,
      mergeCommitSha: merge,
      headBranch: state.planning.record.remote_branch,
      headSha: head,
      baseBranch: "main",
    }),
    verifyCommitOnBranch: async () => ({ defaultHeadSha: "3".repeat(40), reachable: true }),
    readFileAtRef: async (_repository: string, path: string, ref: string) => {
      assert.equal(ref, merge);
      const content = fileContents.get(path);
      if (content === undefined) throw new Error("missing");
      return content;
    },
  };
  const controller = new SystemActionController(state.operations, {
    planningStore: state.planning,
    github: github as never,
    githubForRun: () => github as never,
    now: () => NOW,
  });
  const verified = await controller.execute(run, "verify_planning_merge", "github.verify_planning_merge");
  assert.equal(verified.outcome, "completed");
  assert.equal(state.planning.record.verified_merge_commit_sha, merge);
  assert.equal(state.planning.record.verification_manifest_digest?.length, 64);

  state.planning.record.verification_operation_id = null;
  state.planning.record.verified_merge_commit_sha = null;
  state.planning.record.verification_manifest_digest = null;
  state.planning.record.verification_manifest_json = null;
  state.planning.verificationWriteFailures = 1;
  const replayOperations = new OperationStore();
  const replayController = new SystemActionController(replayOperations, {
    planningStore: state.planning,
    github: github as never,
    now: () => NOW,
  });
  assert.equal(
    (await replayController.execute(run, "verify_planning_merge", "github.verify_planning_merge")).outcome,
    "failed",
  );
  assert.equal([...replayOperations.operations.values()][0]?.state, "failed");
  assert.equal(state.planning.record.verified_merge_commit_sha, null);
  assert.equal(
    (await replayController.execute(run, "verify_planning_merge", "github.verify_planning_merge")).outcome,
    "completed",
  );
  assert.equal([...replayOperations.operations.values()][0]?.state, "reconciled");
  assert.equal(state.planning.record.verified_merge_commit_sha, merge);

  state.planning.record.verification_operation_id = null;
  state.planning.record.verified_merge_commit_sha = null;
  const failedController = new SystemActionController(new OperationStore(), {
    planningStore: state.planning,
    github: { ...github, readFileAtRef: async () => "changed" } as never,
    now: () => NOW,
  });
  const failed = await failedController.execute(run, "verify_planning_merge", "github.verify_planning_merge");
  assert.equal(failed.outcome, "failed");
});

test("a new verification visit adopts an intact receipt saved before operation completion failed", async () => {
  const state = setup();
  const head = "1".repeat(40);
  const merge = "2".repeat(40);
  const defaultHead = "3".repeat(40);
  const files = [{
    path: "openspec/changes/sac-200/proposal.md",
    content: "## Why\n\nA clear plan helps.\n",
  }, {
    path: "openspec/changes/sac-200/.openspec.yaml",
    content: "schema: spec-driven\n",
  }, {
    path: "openspec/changes/sac-200/specs/tool/spec.md",
    content: "## ADDED Requirements\n",
  }];
  const digest = async (value: string) => {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  };
  state.planning.record.head_sha = head;
  state.planning.record.merge_commit_sha = merge;
  state.planning.record.planning_manifest_json = JSON.stringify(await Promise.all(files.map(async (file) => ({
    path: file.path,
    sha256: await digest(file.content),
    byteSize: new TextEncoder().encode(file.content).byteLength,
  }))));
  state.planning.record.planning_manifest_digest = await digest(state.planning.record.planning_manifest_json);
  const github = {
    readPullRequest: async () => ({
      databaseId: "9001",
      number: 54,
      url: "https://github.com/sachinkundu/deos/pull/54",
      state: "closed",
      draft: false,
      merged: true,
      mergeCommitSha: merge,
      headBranch: state.planning.record.remote_branch,
      headSha: head,
      baseBranch: "main",
    }),
    verifyCommitOnBranch: async () => ({ defaultHeadSha: defaultHead, reachable: true }),
    readFileAtRef: async (_repository: string, path: string) => {
      const file = files.find((entry) => entry.path === path);
      if (file === undefined) throw new Error("missing");
      return file.content;
    },
  };
  const first = new SystemActionController(state.operations, {
    planningStore: state.planning,
    github: github as never,
    now: () => NOW,
  });
  state.operations.finishFailures = 1;
  assert.equal(
    (await first.execute(run, "verify_planning_merge", "github.verify_planning_merge")).outcome,
    "failed",
  );
  const originalOperationId = state.planning.record.verification_operation_id;
  assert.notEqual(originalOperationId, null);

  const resumedRun = { ...run, current_visit_sequence: run.current_visit_sequence + 1 };
  const noProviderReplay = async () => { throw new Error("saved proof should avoid provider replay"); };
  const resumed = new SystemActionController(state.operations, {
    planningStore: state.planning,
    github: {
      readPullRequest: noProviderReplay,
      verifyCommitOnBranch: noProviderReplay,
      readFileAtRef: noProviderReplay,
    } as never,
    now: () => NOW,
  });
  assert.equal(
    (await resumed.execute(resumedRun, "verify_planning_merge", "github.verify_planning_merge")).outcome,
    "completed",
  );
  assert.notEqual(state.planning.record.verification_operation_id, originalOperationId);
  assert.deepEqual(
    [...state.operations.operations.values()].map((operation) => operation.state),
    ["failed", "reconciled"],
  );
});
