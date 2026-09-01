import assert from "node:assert/strict";
import test from "node:test";

import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import { SystemActionController, type SystemActionStore } from "../src/system-actions.ts";
import type { ProviderOperationRecord, ProviderOperationState } from "../src/linear-transition.ts";
import { GitHubReviewFeedbackChangedError } from "../src/github-capability.ts";

const NOW = new Date("2026-09-01T12:00:00.000Z");
const baseCommit = "a".repeat(40);
const headSha = "b".repeat(40);
const mergeSha = "c".repeat(40);

class Operations implements SystemActionStore {
  records = new Map<string, ProviderOperationRecord>();
  prerequisites() { return Promise.resolve({ incompleteOperations: 0, actionReceipts: 0 }); }
  beginPlanningOperation(input: { operationId: string; runId: string; action: string; requestDigest: string; now: string }) {
    const existing = this.records.get(input.operationId);
    if (existing !== undefined) return Promise.resolve(existing);
    const record = {
      operation_id: input.operationId,
      run_id: input.runId,
      attempt_id: null,
      capability: "system_action",
      action: input.action,
      sanitized_target: "design",
      request_digest: input.requestDigest,
      state: "pending" as const,
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
    this.records.set(input.operationId, record);
    return Promise.resolve(record);
  }
  finishPlanningOperation(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }) {
    const record = this.records.get(input.operationId);
    if (record?.state !== input.expected) return Promise.resolve(false);
    record.state = input.state;
    record.provider_resource_id = input.providerResourceId;
    record.safe_error_category = input.safeErrorCategory;
    return Promise.resolve(true);
  }
}

test("design publication reuses one PR and merge requires its approved gate head", async () => {
  const operations = new Operations();
  const work = {
    run_id: "workflow:project:issue:run:1",
    repository: "acme/sample",
    base_branch: "main" as const,
    base_commit: baseCommit,
    remote_branch: "deos/design/0123456789abcdef01234567",
    change_id: "sac-200",
    pull_request_database_id: null as string | null,
    pull_request_number: null as number | null,
    pull_request_url: null as string | null,
    head_sha: null as string | null,
    design_manifest_digest: null as string | null,
    design_manifest_json: null as string | null,
    publication_operation_id: null as string | null,
    merge_operation_id: null as string | null,
    merge_commit_sha: null as string | null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
  let publicationWriteFailures = 0;
  let mergeWriteFailures = 0;
  const designStore = {
    findWorkProduct: async () => work,
    recordPublication: async (input: {
      pullRequestDatabaseId: string;
      pullRequestNumber: number;
      pullRequestUrl: string;
      headSha: string;
      operationId: string;
      expectedOperationState: "pending" | "manual_reconciliation_required";
      operationState: "succeeded" | "reconciled";
    }) => {
      if (publicationWriteFailures > 0) {
        publicationWriteFailures -= 1;
        throw new Error("design publication write failed");
      }
      const finished = await operations.finishPlanningOperation({
        operationId: input.operationId,
        expected: input.expectedOperationState,
        state: input.operationState,
        providerResourceId: input.pullRequestDatabaseId,
        safeErrorCategory: null,
        now: NOW.toISOString(),
      });
      if (!finished) throw new Error("design publication atomic operation update failed");
      work.pull_request_database_id = input.pullRequestDatabaseId;
      work.pull_request_number = input.pullRequestNumber;
      work.pull_request_url = input.pullRequestUrl;
      work.head_sha = input.headSha;
      work.publication_operation_id = input.operationId;
      return work;
    },
    recordMerge: async (input: { operationId: string; mergeCommitSha: string }) => {
      if (mergeWriteFailures > 0) {
        mergeWriteFailures -= 1;
        throw new Error("design merge write failed");
      }
      work.merge_operation_id = input.operationId;
      work.merge_commit_sha = input.mergeCommitSha;
      return work;
    },
  };
  let publishCalls = 0;
  let mergeCalls = 0;
  let mergeError: Error | null = null;
  const github = {
    publishDesign: async () => {
      publishCalls += 1;
      return {
        pullRequestDatabaseId: "PR_node",
        pullRequestNumber: 21,
        pullRequestUrl: "https://github.com/acme/sample/pull/21",
        branch: work.remote_branch,
        headSha,
        reviewReplyIds: [],
        reconciled: false,
      };
    },
    mergeDesign: async (input: { expectedHeadSha: string }) => {
      assert.equal(input.expectedHeadSha, headSha);
      mergeCalls += 1;
      if (mergeError !== null) throw mergeError;
      return {
        pullRequestDatabaseId: "PR_node",
        pullRequestNumber: 21,
        mergeCommitSha: mergeSha,
        reconciled: false,
      };
    },
  };
  const run = {
    run_id: work.run_id,
    definition_version: 17,
    current_visit_sequence: 30,
    route_repository: work.repository,
    route_github_installation_id: "1",
  } as OrchestrationRunRecord;
  const controller = new SystemActionController(operations, {
    planningStore: {} as never,
    github: github as never,
    githubForRun: () => github as never,
    designStore: designStore as never,
    designCandidate: async () => ({
      candidateId: "design:attempt-1",
      candidateDigest: "d".repeat(64),
      change: work.change_id,
      baseCommit,
      path: `openspec/changes/${work.change_id}/design.md`,
      content: "## Design\n",
      designDigest: "e".repeat(64),
      reviewReplies: [],
    }),
    issueContext: async () => ({ identifier: "SAC-200", url: "https://linear.app/deos/issue/SAC-200" }),
    gateVisit: async () => ({
      run_id: work.run_id,
      visit_sequence: 31,
      node_id: "design_review",
      gate_kind: "design",
      work_type: "design",
      work_product_kind: "design",
      round: 1,
      state: "merge_authorized",
      repository: work.repository,
      pull_request_database_id: "PR_node",
      pull_request_number: 21,
      pull_request_url: "https://github.com/acme/sample/pull/21",
      head_branch: work.remote_branch,
      base_branch: "main",
      approved_head_sha: headSha,
      decision_delivery_id: "delivery-1",
      decision_outcome: "merge_authorized",
      created_at: NOW.toISOString(),
      decided_at: NOW.toISOString(),
    }),
    now: () => NOW,
  });

  assert.equal((await controller.execute(run, "publish_design", "github.publish_design_candidate")).outcome, "completed");
  assert.equal(work.pull_request_number, 21);
  assert.equal(publishCalls, 1);
  run.current_visit_sequence = 32;
  assert.equal((await controller.execute(run, "merge_design_pr", "github.merge_design_pull_request")).outcome, "completed");
  assert.equal(work.merge_commit_sha, mergeSha);
  assert.equal(mergeCalls, 1);

  operations.records.clear();
  work.pull_request_database_id = null;
  work.pull_request_number = null;
  work.pull_request_url = null;
  work.head_sha = null;
  work.publication_operation_id = null;
  work.merge_operation_id = null;
  work.merge_commit_sha = null;
  publicationWriteFailures = 1;
  publishCalls = 0;
  run.current_visit_sequence = 40;

  await assert.rejects(
    controller.execute(run, "publish_design", "github.publish_design_candidate"),
    /trusted design publication requires provider reconciliation/,
  );
  assert.equal([...operations.records.values()][0]?.state, "manual_reconciliation_required");
  assert.equal(work.head_sha, null);
  assert.equal(publishCalls, 1);

  assert.equal(
    (await controller.execute(run, "publish_design", "github.publish_design_candidate")).outcome,
    "completed",
  );
  assert.equal([...operations.records.values()][0]?.state, "reconciled");
  assert.equal(work.head_sha, headSha);
  assert.equal(publishCalls, 2);

  mergeWriteFailures = 1;
  mergeCalls = 0;
  run.current_visit_sequence = 41;
  await assert.rejects(
    controller.execute(run, "merge_design_pr", "github.merge_design_pull_request"),
    /design merge requires provider reconciliation/,
  );
  const mergeOperation = () => [...operations.records.values()]
    .find((record) => record.action === "github.merge_design_pull_request");
  assert.equal(mergeOperation()?.state, "manual_reconciliation_required");
  assert.equal(work.merge_commit_sha, null);
  assert.equal(mergeCalls, 1);

  assert.equal(
    (await controller.execute(run, "merge_design_pr", "github.merge_design_pull_request")).outcome,
    "completed",
  );
  assert.equal(mergeOperation()?.state, "reconciled");
  assert.equal(work.merge_commit_sha, mergeSha);
  assert.equal(mergeCalls, 2);

  work.merge_operation_id = null;
  work.merge_commit_sha = null;
  mergeError = new Error("GitHub planning merge was rejected");
  run.current_visit_sequence = 42;
  assert.equal(
    (await controller.execute(run, "merge_design_pr", "github.merge_design_pull_request")).outcome,
    "failed",
  );
  const rejectedMergeOperation = [...operations.records.values()]
    .filter((record) => record.action === "github.merge_design_pull_request")
    .at(-1);
  assert.equal(rejectedMergeOperation?.state, "failed");
  assert.equal(rejectedMergeOperation?.safe_error_category, "design_merge_rejected");
});

test("design publication classifies added or deleted feedback after materialization as recoverable", async () => {
  const operations = new Operations();
  const work = {
    run_id: "workflow:project:issue:run:late-feedback",
    repository: "acme/sample",
    base_branch: "main" as const,
    base_commit: baseCommit,
    remote_branch: "deos/design/0123456789abcdef01234567",
    change_id: "sac-200",
    pull_request_database_id: null as string | null,
    pull_request_number: null as number | null,
    pull_request_url: null as string | null,
    head_sha: null as string | null,
    design_manifest_digest: null,
    design_manifest_json: null,
    publication_operation_id: null as string | null,
    merge_operation_id: null,
    merge_commit_sha: null,
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
  let providerMessage = "GitHub review reply manifest is incomplete";
  const controller = new SystemActionController(operations, {
    planningStore: {} as never,
    github: {
      publishDesign: async () => {
        throw new GitHubReviewFeedbackChangedError(providerMessage, {
          pullRequestDatabaseId: "PR_node",
          pullRequestNumber: 21,
          pullRequestUrl: "https://github.com/acme/sample/pull/21",
          branch: work.remote_branch,
          headSha,
          reviewReplyIds: [],
          reconciled: true,
        });
      },
      mergeDesign: async () => { throw new Error("unexpected merge"); },
    } as never,
    designStore: {
      findWorkProduct: async () => work,
      recordPublication: async () => { throw new Error("unexpected publication receipt"); },
      recordFeedbackChangedPublication: async (input: {
        pullRequestDatabaseId: string;
        pullRequestNumber: number;
        pullRequestUrl: string;
        headSha: string;
        operationId: string;
        expectedOperationState: "pending" | "manual_reconciliation_required";
      }) => {
        const finished = await operations.finishPlanningOperation({
          operationId: input.operationId,
          expected: input.expectedOperationState,
          state: "failed",
          providerResourceId: input.pullRequestDatabaseId,
          safeErrorCategory: "design_review_feedback_changed",
          now: NOW.toISOString(),
        });
        if (!finished) throw new Error("unexpected feedback-change compare-and-set failure");
        work.pull_request_database_id = input.pullRequestDatabaseId;
        work.pull_request_number = input.pullRequestNumber;
        work.pull_request_url = input.pullRequestUrl;
        work.head_sha = input.headSha;
        work.publication_operation_id = input.operationId;
        return work;
      },
      recordMerge: async () => { throw new Error("unexpected merge receipt"); },
    } as never,
    designCandidate: async () => ({
      candidateId: "design:attempt-late-feedback",
      candidateDigest: "d".repeat(64),
      change: work.change_id,
      baseCommit,
      path: `openspec/changes/${work.change_id}/design.md`,
      content: "## Design\n",
      designDigest: "e".repeat(64),
      reviewReplies: [],
    }),
    issueContext: async () => ({ identifier: "SAC-200", url: "https://linear.app/deos/issue/SAC-200" }),
    now: () => NOW,
  });
  const run = { run_id: work.run_id, current_visit_sequence: 42 } as OrchestrationRunRecord;
  const outcome = await controller.execute(
    run,
    "publish_design",
    "github.publish_design_candidate",
  );
  assert.deepEqual(outcome, {
    kind: "system_action",
    outcome: "review_feedback_changed",
    providerReceiptsComplete: false,
  });
  assert.equal([...operations.records.values()][0]?.state, "failed");
  assert.equal([...operations.records.values()][0]?.safe_error_category, "design_review_feedback_changed");
  assert.equal(work.pull_request_number, 21);
  assert.equal(work.head_sha, headSha);

  providerMessage = "GitHub review reply targets an unknown human review thread";
  run.current_visit_sequence += 1;
  assert.equal(
    (await controller.execute(run, "publish_design", "github.publish_design_candidate")).outcome,
    "review_feedback_changed",
  );
  const latest = [...operations.records.values()].at(-1);
  assert.equal(latest?.state, "failed");
  assert.equal(latest?.safe_error_category, "design_review_feedback_changed");
});
