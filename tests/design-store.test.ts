import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";

import { D1DesignStore } from "../src/design-store.ts";

const NOW = "2026-09-01T12:00:00.000Z";
const RUN_ID = "workflow:project-1:issue-1:run:1";
const OPERATION_ID = `${RUN_ID}:system_action:publish_design:1`;

class Statement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: unknown[];

  constructor(database: DatabaseSync, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): Statement {
    return new Statement(this.database, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.statement().get(...this.values as never[]) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, never> }> {
    return { results: this.statement().all(...this.values as never[]) as T[], success: true, meta: {} };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.statement().run(...this.values as never[]);
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }
}

class Database {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const filename of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
      this.sqlite.exec(readFileSync(`migrations/${filename}`, "utf8"));
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this.sqlite, sql);
  }

  async batch(statements: readonly Statement[]): Promise<Array<{ success: true; meta: { changes: number } }>> {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

test("design publication atomically completes its operation, work product, and governed links", async () => {
  const database = new Database();
  database.sqlite.prepare(
    `INSERT INTO workflow_definitions
     (definition_id, version, project_id, name, canonical_json, digest, created_at)
     VALUES ('simple-traceability', 17, 'project-1', 'simple-traceability', '{}', ?, ?)`,
  ).run("d".repeat(64), NOW);
  database.sqlite.prepare(
    `INSERT INTO orchestration_runs
     (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
      definition_version, definition_digest, workflow_instance_id, current_node,
      current_visit_sequence, status, route_project_name, route_repository,
      route_github_installation_id, route_revision, route_digest,
      route_start_state_name, route_human_gate_state_id, route_repository_revision,
      route_workflow_revision, route_review_revision, created_at, updated_at)
     VALUES (?, 'workflow:project-1:issue-1', 1, 'project-1', 'issue-1', 'simple-traceability',
             17, ?, 'workflow-1', 'publish_design', 16, 'active', 'Sample', 'acme/sample',
             'installation-1', 1, ?, 'Todo', 'human-state', 1, 1, 1, ?, ?)`,
  ).run(RUN_ID, "d".repeat(64), "r".repeat(64), NOW, NOW);
  database.sqlite.prepare(
    `INSERT INTO provider_operations
     (operation_id, run_id, capability, action, sanitized_target, request_digest,
      state, started_at, updated_at)
     VALUES (?, ?, 'system_action', 'github.publish_design_candidate', 'design', ?,
             'pending', ?, ?)`,
  ).run(OPERATION_ID, RUN_ID, "q".repeat(64), NOW, NOW);

  const store = new D1DesignStore(database as unknown as D1Database);
  await store.allocate({
    runId: RUN_ID,
    repository: "acme/sample",
    baseCommit: "a".repeat(40),
    changeId: "sac-200",
    now: NOW,
  });
  const recorded = await store.recordPublication({
    runId: RUN_ID,
    pullRequestDatabaseId: "PR_node",
    pullRequestNumber: 21,
    pullRequestUrl: "https://github.com/acme/sample/pull/21",
    headSha: "b".repeat(40),
    designDigest: "c".repeat(64),
    operationId: OPERATION_ID,
    expectedOperationState: "pending",
    operationState: "succeeded",
    now: NOW,
  });

  assert.equal(recorded.pull_request_number, 21);
  const operation = database.sqlite.prepare(
    "SELECT state, provider_resource_id, completed_at FROM provider_operations WHERE operation_id = ?",
  ).get(OPERATION_ID);
  assert.equal(operation?.state, "succeeded");
  assert.equal(operation?.provider_resource_id, "PR_node");
  assert.equal(operation?.completed_at, NOW);
  assert.equal(
    Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM governed_work_links WHERE operation_id = ?")
      .get(OPERATION_ID)?.count),
    2,
  );

  const feedbackOperationId = `${RUN_ID}:system_action:publish_design:2`;
  database.sqlite.prepare(
    `INSERT INTO provider_operations
     (operation_id, run_id, capability, action, sanitized_target, request_digest,
      state, started_at, updated_at)
     VALUES (?, ?, 'system_action', 'github.publish_design_candidate', 'design', ?,
             'pending', ?, ?)`,
  ).run(feedbackOperationId, RUN_ID, "f".repeat(64), NOW, NOW);
  const feedbackChanged = await store.recordFeedbackChangedPublication({
    runId: RUN_ID,
    pullRequestDatabaseId: "PR_node",
    pullRequestNumber: 21,
    pullRequestUrl: "https://github.com/acme/sample/pull/21",
    headSha: "b".repeat(40),
    designDigest: "c".repeat(64),
    operationId: feedbackOperationId,
    expectedOperationState: "pending",
    now: NOW,
  });
  assert.equal(feedbackChanged.pull_request_number, 21);
  assert.equal(feedbackChanged.publication_operation_id, feedbackOperationId);
  const feedbackOperation = database.sqlite.prepare(
    `SELECT state, provider_resource_id, safe_error_category, completed_at
     FROM provider_operations WHERE operation_id = ?`,
  ).get(feedbackOperationId);
  assert.equal(feedbackOperation?.state, "failed");
  assert.equal(feedbackOperation?.provider_resource_id, "PR_node");
  assert.equal(feedbackOperation?.safe_error_category, "design_review_feedback_changed");
  assert.equal(feedbackOperation?.completed_at, NOW);
  assert.equal(
    Number(database.sqlite.prepare("SELECT COUNT(*) AS count FROM governed_work_links WHERE operation_id = ?")
      .get(feedbackOperationId)?.count),
    0,
  );
});
