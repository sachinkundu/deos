import { operationIdentity } from "./orchestration-identity.ts";
import type { OrchestrationRunRecord } from "./orchestration-store.ts";

export type ExecutorStatus =
  | "queued"
  | "running"
  | "paused"
  | "errored"
  | "terminated"
  | "complete"
  | "waiting"
  | "waitingForPause"
  | "unknown";

export interface CompletionReconciliationRecord {
  reconciliation_id: string;
  run_id: string;
  workflow_instance_id: string;
  safe_cause: "premature_workflow_completion";
  observed_executor_status: string;
  observed_run_status: string;
  observed_node: string;
  state: "pending_notice" | "notified" | "conflict";
  linear_operation_key: string;
  linear_resource_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompletionReconciliationStore {
  candidates(limit: number): Promise<OrchestrationRunRecord[]>;
  reconcileCompleted(
    run: OrchestrationRunRecord,
    now: string,
  ): Promise<CompletionReconciliationRecord>;
  markNotified(reconciliationId: string, linearResourceId: string, now: string): Promise<void>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1CompletionReconciliationStore implements CompletionReconciliationStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  candidates(limit: number): Promise<OrchestrationRunRecord[]> {
    return this.database.prepare(
      `SELECT run.* FROM orchestration_runs AS run
       JOIN dispatch_intents AS intent ON intent.run_id = run.run_id
       WHERE intent.state = 'established'
         AND run.status IN (
           'pending_dispatch', 'active', 'awaiting_human',
           'awaiting_capability', 'manual_reconciliation_required'
         )
       ORDER BY run.updated_at ASC LIMIT ?`,
    ).bind(limit).all<OrchestrationRunRecord>().then((result) => result.results);
  }

  async reconcileCompleted(
    run: OrchestrationRunRecord,
    now: string,
  ): Promise<CompletionReconciliationRecord> {
    const safeCause = "premature_workflow_completion" as const;
    const reconciliationId = operationIdentity(run.run_id, "lifecycle", safeCause, 1);
    const existing = await this.find(reconciliationId);
    if (existing !== null) return existing;
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE orchestration_runs
         SET status = 'failed', terminal_at = ?, terminal_cause = ?, updated_at = ?
         WHERE run_id = ? AND workflow_instance_id = ? AND current_node = ? AND status = ?`,
      ).bind(
        now,
        safeCause,
        now,
        run.run_id,
        run.workflow_instance_id,
        run.current_node,
        run.status,
      ),
      this.database.prepare(
        `INSERT OR IGNORE INTO workflow_completion_reconciliations
         (reconciliation_id, run_id, workflow_instance_id, safe_cause,
          observed_executor_status, observed_run_status, observed_node, state,
          linear_operation_key, created_at, updated_at)
         SELECT ?, ?, ?, ?, 'complete', ?, ?, 'pending_notice', ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM orchestration_runs
           WHERE run_id = ? AND status = 'failed' AND terminal_cause = ? AND updated_at = ?
         )`,
      ).bind(
        reconciliationId,
        run.run_id,
        run.workflow_instance_id,
        safeCause,
        run.status,
        run.current_node,
        reconciliationId,
        now,
        now,
        run.run_id,
        safeCause,
        now,
      ),
    ]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      await this.database.prepare(
        `INSERT OR IGNORE INTO workflow_completion_reconciliations
         (reconciliation_id, run_id, workflow_instance_id, safe_cause,
          observed_executor_status, observed_run_status, observed_node, state,
          linear_operation_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'complete', ?, ?, 'conflict', ?, ?, ?)`,
      ).bind(
        reconciliationId,
        run.run_id,
        run.workflow_instance_id,
        safeCause,
        run.status,
        run.current_node,
        reconciliationId,
        now,
        now,
      ).run();
    }
    const reconciled = await this.find(reconciliationId);
    if (reconciled === null) throw new Error("completion reconciliation is not readable");
    return reconciled;
  }

  async markNotified(reconciliationId: string, linearResourceId: string, now: string): Promise<void> {
    await this.database.prepare(
      `UPDATE workflow_completion_reconciliations
       SET state = 'notified', linear_resource_id = ?, updated_at = ?
       WHERE reconciliation_id = ? AND state IN ('pending_notice', 'notified')`,
    ).bind(linearResourceId, now, reconciliationId).run();
  }

  private find(reconciliationId: string): Promise<CompletionReconciliationRecord | null> {
    return this.database.prepare(
      "SELECT * FROM workflow_completion_reconciliations WHERE reconciliation_id = ?",
    ).bind(reconciliationId).first<CompletionReconciliationRecord>();
  }
}

export interface WorkflowStatusBinding {
  get(id: string): Promise<{
    status(): Promise<{ status: ExecutorStatus }>;
  }>;
}

export interface LinearOperatorNotice {
  ensure(input: {
    issueId: string;
    runId: string;
    workflowInstanceId: string;
    observedRunStatus: string;
    observedNode: string;
    operationKey: string;
  }): Promise<string>;
}

export class LinearCommentOperatorNotice implements LinearOperatorNotice {
  private readonly apiUrl: string;
  private readonly accessToken: string;
  private readonly request: typeof fetch;

  constructor(apiUrl: string, accessToken: string, request: typeof fetch = fetch) {
    this.apiUrl = apiUrl;
    this.accessToken = accessToken;
    this.request = request;
  }

  async ensure(input: {
    issueId: string;
    runId: string;
    workflowInstanceId: string;
    observedRunStatus: string;
    observedNode: string;
    operationKey: string;
  }): Promise<string> {
    const marker = `<!-- deos-operation:${input.operationKey} -->`;
    const existing = await this.findComment(input.issueId, marker);
    if (existing !== null) return existing;
    const payload = await this.graphql(
      `mutation DeosLifecycleNotice($issueId: String!, $body: String!) {
         commentCreate(input: { issueId: $issueId, body: $body }) {
           success
           comment { id }
         }
       }`,
      {
        issueId: input.issueId,
        body: [
          "DEOS system error: `premature_workflow_completion`.",
          "",
          `Cloudflare reported this Workflow complete while D1 still recorded ${input.observedRunStatus} at ${input.observedNode}.`,
          `Run: ${input.runId}`,
          `Workflow instance: ${input.workflowInstanceId}`,
          "",
          "DEOS marked the run failed. Operator reconciliation is required; the issue was not moved to Done and no replacement run was created.",
          marker,
        ].join("\n"),
      },
    ) as { data?: { commentCreate?: { success?: boolean; comment?: { id?: string } } } };
    const id = payload.data?.commentCreate?.comment?.id;
    if (payload.data?.commentCreate?.success !== true || typeof id !== "string") {
      throw new Error("Linear lifecycle notice response is invalid");
    }
    return id;
  }

  private async findComment(issueId: string, marker: string): Promise<string | null> {
    const payload = await this.graphql(
      `query DeosLifecycleComments($issueId: String!) {
         issue(id: $issueId) { comments { nodes { id body } } }
       }`,
      { issueId },
    ) as { data?: { issue?: { comments?: { nodes?: Array<{ id?: string; body?: string }> } } } };
    const match = payload.data?.issue?.comments?.nodes?.find((comment) => comment.body?.includes(marker));
    return typeof match?.id === "string" ? match.id : null;
  }

  private async graphql(query: string, variables: Record<string, string>): Promise<unknown> {
    const response = await this.request(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("Linear lifecycle notice request failed");
    const payload = await response.json() as { errors?: unknown[] };
    if (payload.errors?.length) throw new Error("Linear lifecycle notice GraphQL request failed");
    return payload;
  }
}

export class WorkflowCompletionReconciler {
  private readonly store: CompletionReconciliationStore;
  private readonly workflow: WorkflowStatusBinding;
  private readonly notice: LinearOperatorNotice;
  private readonly now: () => Date;

  constructor(
    store: CompletionReconciliationStore,
    workflow: WorkflowStatusBinding,
    notice: LinearOperatorNotice,
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.workflow = workflow;
    this.notice = notice;
    this.now = now;
  }

  async scheduled(): Promise<void> {
    for (const run of await this.store.candidates(100)) {
      const instance = await this.workflow.get(run.workflow_instance_id);
      const executor = await instance.status();
      if (executor.status !== "complete") continue;
      const reconciliation = await this.store.reconcileCompleted(run, this.now().toISOString());
      if (reconciliation.state !== "pending_notice") continue;
      const commentId = reconciliation.linear_resource_id ?? await this.notice.ensure({
        issueId: run.issue_id,
        runId: run.run_id,
        workflowInstanceId: run.workflow_instance_id,
        observedRunStatus: reconciliation.observed_run_status,
        observedNode: reconciliation.observed_node,
        operationKey: reconciliation.linear_operation_key,
      });
      await this.store.markNotified(
        reconciliation.reconciliation_id,
        commentId,
        this.now().toISOString(),
      );
    }
  }
}
