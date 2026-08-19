import assert from "node:assert/strict";
import test from "node:test";

import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import {
  LinearCommentOperatorNotice,
  WorkflowCompletionReconciler,
  type CompletionReconciliationRecord,
  type CompletionReconciliationStore,
  type ExecutorStatus,
  type LinearOperatorNotice,
  type WorkflowStatusBinding,
} from "../src/workflow-completion-reconciler.ts";

const NOW = "2026-08-17T08:00:00.000Z";

const run = (): OrchestrationRunRecord => ({
  run_id: "workflow:project-1:issue-1:run:1",
  correlation_id: "workflow:project-1:issue-1",
  run_sequence: 1,
  project_id: "project-1",
  issue_id: "issue-1",
  definition_id: "delivery",
  definition_version: 4,
  definition_digest: "digest-v4",
  workflow_instance_id: "workflow-instance-1",
  previous_node: "action",
  current_node: "wait",
  current_visit_sequence: 2,
  last_transition_id: "transition-1",
  gate_origin_node: null,
  status: "awaiting_capability",
  accumulated_data_json: "{}",
  created_at: NOW,
  updated_at: NOW,
  terminal_at: null,
  terminal_cause: null,
});

class ReconciliationStore implements CompletionReconciliationStore {
  readonly candidate = run();
  record: CompletionReconciliationRecord | null = null;
  reconcileCalls = 0;
  conflict = false;

  candidates(): Promise<OrchestrationRunRecord[]> {
    return Promise.resolve([this.candidate]);
  }

  reconcileCompleted(observed: OrchestrationRunRecord): Promise<CompletionReconciliationRecord> {
    this.reconcileCalls += 1;
    if (this.record !== null) return Promise.resolve(this.record);
    if (!this.conflict) {
      this.candidate.status = "failed";
      this.candidate.terminal_cause = "premature_workflow_completion";
    }
    this.record = {
      reconciliation_id: `${observed.run_id}:lifecycle:premature_workflow_completion:1`,
      run_id: observed.run_id,
      workflow_instance_id: observed.workflow_instance_id,
      safe_cause: "premature_workflow_completion",
      observed_executor_status: "complete",
      observed_run_status: "awaiting_capability",
      observed_node: "wait",
      state: this.conflict ? "conflict" : "pending_notice",
      linear_operation_key: `${observed.run_id}:lifecycle:premature_workflow_completion:1`,
      linear_resource_id: null,
      created_at: NOW,
      updated_at: NOW,
    };
    return Promise.resolve(this.record);
  }

  markNotified(_reconciliationId: string, linearResourceId: string): Promise<void> {
    if (this.record === null) throw new Error("missing reconciliation");
    this.record.state = "notified";
    this.record.linear_resource_id = linearResourceId;
    return Promise.resolve();
  }
}

class WorkflowBinding implements WorkflowStatusBinding {
  status: ExecutorStatus;

  constructor(status: ExecutorStatus) {
    this.status = status;
  }

  get(): Promise<{ status(): Promise<{ status: ExecutorStatus }> }> {
    return Promise.resolve({ status: async () => ({ status: this.status }) });
  }
}

class Notice implements LinearOperatorNotice {
  calls = 0;

  ensure(): Promise<string> {
    this.calls += 1;
    return Promise.resolve("comment-1");
  }
}

test("complete plus non-final D1 state fails once and reuses one Linear notice", async () => {
  const store = new ReconciliationStore();
  const notice = new Notice();
  const reconciler = new WorkflowCompletionReconciler(
    store,
    new WorkflowBinding("complete"),
    notice,
    () => new Date(NOW),
  );

  await reconciler.scheduled();
  await reconciler.scheduled();

  assert.equal(store.candidate.status, "failed");
  assert.equal(store.candidate.terminal_cause, "premature_workflow_completion");
  assert.equal(store.record?.state, "notified");
  assert.equal(notice.calls, 1);
});

test("waiting and errored executor states are not mistaken for premature completion", async () => {
  for (const status of ["waiting", "errored"] as const) {
    const store = new ReconciliationStore();
    const notice = new Notice();
    await new WorkflowCompletionReconciler(
      store,
      new WorkflowBinding(status),
      notice,
      () => new Date(NOW),
    ).scheduled();
    assert.equal(store.reconcileCalls, 0);
    assert.equal(notice.calls, 0);
    assert.equal(store.candidate.status, "awaiting_capability");
  }
});

test("a lost D1 comparison suppresses the stale operator notice", async () => {
  const store = new ReconciliationStore();
  store.conflict = true;
  const notice = new Notice();

  await new WorkflowCompletionReconciler(
    store,
    new WorkflowBinding("complete"),
    notice,
    () => new Date(NOW),
  ).scheduled();

  assert.equal(store.record?.state, "conflict");
  assert.equal(notice.calls, 0);
});

test("Linear notice uses one marked comment and never mutates issue state", async () => {
  const requests: string[] = [];
  let existingBody: string | null = null;
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as {
      query: string;
      variables: { body?: string };
    };
    requests.push(body.query);
    if (body.query.includes("DeosLifecycleComments")) {
      return Response.json({
        data: {
          issue: {
            comments: {
              nodes: existingBody === null ? [] : [{ id: "comment-1", body: existingBody }],
            },
          },
        },
      });
    }
    existingBody = body.variables.body ?? null;
    return Response.json({ data: { commentCreate: { success: true, comment: { id: "comment-1" } } } });
  };
  const notice = new LinearCommentOperatorNotice("https://linear.example/graphql", "token", request);
  const input = {
    issueId: "issue-1",
    runId: "run-1",
    workflowInstanceId: "instance-1",
    observedRunStatus: "active",
    observedNode: "action",
    operationKey: "run-1:lifecycle:premature_workflow_completion:1",
  };

  assert.equal(await notice.ensure(input), "comment-1");
  assert.equal(await notice.ensure(input), "comment-1");
  assert.equal(requests.filter((query) => query.includes("commentCreate")).length, 1);
  assert.equal(requests.some((query) => query.includes("issueUpdate")), false);
  assert.match(existingBody ?? "", /premature_workflow_completion/);
});
