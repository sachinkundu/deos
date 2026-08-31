import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";

import { D1OrchestrationStore } from "../src/orchestration-store.ts";
import { registerBundledWorkflowDefinitions, type QueueConsumerEnv } from "../src/queue-consumer-core.ts";
import {
  D1RepositoryRouteStore,
  repositoryRouteDigest,
  RepositoryRouteError,
} from "../src/repository-routes.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";

const NOW = "2026-08-31T08:00:00.000Z";
const LATER = "2026-08-31T09:00:00.000Z";

class SqliteD1Statement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: unknown[];

  constructor(database: DatabaseSync, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.statement().get(...this.boundValues()) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, never> }> {
    return {
      results: this.statement().all(...this.boundValues()) as T[],
      success: true,
      meta: {},
    };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.statement().run(...this.boundValues());
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }

  private boundValues(): never[] {
    return this.values as never[];
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const filename of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
      this.sqlite.exec(readFileSync(`migrations/${filename}`, "utf8"));
    }
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(statements: readonly SqliteD1Statement[]): Promise<Array<{ success: true; meta: { changes: number } }>> {
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

  close(): void {
    this.sqlite.close();
  }
}

const seedDefinition = (database: SqliteD1Database, projectId: string): void => {
  database.sqlite.prepare(
    `INSERT INTO workflow_definitions
     (definition_id, version, project_id, name, canonical_json, digest, created_at)
     VALUES (?, 4, ?, 'simple-traceability', '{}', ?, ?)`,
  ).run("simple-traceability", projectId, "d".repeat(64), NOW);
};

test("D1 route writes read back and an active run keeps its frozen repository", async () => {
  const database = new SqliteD1Database();
  try {
    seedDefinition(database, "project-1");
    const routes = new D1RepositoryRouteStore(database as unknown as D1Database);
    const access = {
      checkId: "check-create",
      requiredPermissionsDigest: "a".repeat(64),
      observedPermissionsDigest: "b".repeat(64),
      settingsUrl: "https://github.com/settings/installations/154095438",
    };
    const created = await routes.create({
      projectId: "project-1",
      projectName: "Sample one",
      repository: "sachinkundu/deos-sample-project",
      githubInstallationId: "154095438",
      definitionId: "simple-traceability",
      definitionVersion: 4,
      definitionDigest: "d".repeat(64),
      startStateName: "In Progress",
      humanGateStateId: "human-review",
      independentReviewModel: "openai/gpt-5.4",
      actorEmail: "operator@example.com",
      now: NOW,
      access,
    });
    assert.equal(created.dispatchEnabled, false);
    assert.equal(created.routeRevision, 1);
    assert.match(created.routeDigest, /^[a-f0-9]{64}$/);

    database.sqlite.prepare(
      `INSERT INTO orchestration_runs
       (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
        definition_version, definition_digest, workflow_instance_id, current_node,
        current_visit_sequence, status, route_project_name, route_repository,
        route_github_installation_id, route_revision, route_digest,
        route_start_state_name, route_human_gate_state_id, route_repository_revision,
        route_workflow_revision, route_review_revision, created_at, updated_at)
       VALUES ('run-1', 'correlation-1', 1, 'project-1', 'issue-1', 'simple-traceability',
               4, ?, 'workflow-1', 'author', 1, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "d".repeat(64),
      created.projectName,
      created.repository,
      created.githubInstallationId,
      created.routeRevision,
      created.routeDigest,
      created.startStateName,
      created.humanGateStateId,
      created.repositoryRevision,
      created.workflowRevision,
      created.independentReviewRevision,
      NOW,
      NOW,
    );
    database.sqlite.exec(
      `INSERT INTO orchestration_runs
       (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
        definition_version, definition_digest, workflow_instance_id, current_node,
        current_visit_sequence, status, route_project_name, route_repository,
        route_github_installation_id, route_revision, route_digest,
        route_start_state_name, route_human_gate_state_id, route_repository_revision,
        route_workflow_revision, route_review_revision, created_at, updated_at)
       SELECT 'run-review', 'correlation-review', 1, project_id, 'issue-review', definition_id,
              definition_version, definition_digest, 'workflow-review', 'review',
              1, 'awaiting_capability', route_project_name, route_repository,
              route_github_installation_id, route_revision, route_digest,
              route_start_state_name, route_human_gate_state_id, route_repository_revision,
              route_workflow_revision, route_review_revision, created_at, updated_at
       FROM orchestration_runs WHERE run_id = 'run-1';
       INSERT INTO orchestration_runs
       (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
        definition_version, definition_digest, workflow_instance_id, current_node,
        current_visit_sequence, status, route_project_name, route_repository,
        route_github_installation_id, route_revision, route_digest,
        route_start_state_name, route_human_gate_state_id, route_repository_revision,
        route_workflow_revision, route_review_revision, created_at, updated_at)
       SELECT 'run-human', 'correlation-human', 1, project_id, 'issue-human', definition_id,
              definition_version, definition_digest, 'workflow-human', 'human_gate',
              1, 'awaiting_human', route_project_name, route_repository,
              route_github_installation_id, route_revision, route_digest,
              route_start_state_name, route_human_gate_state_id, route_repository_revision,
              route_workflow_revision, route_review_revision, created_at, updated_at
       FROM orchestration_runs WHERE run_id = 'run-1';`,
    );

    const rerouted = await routes.saveRepository({
      projectId: "project-1",
      repository: "sachinkundu/deos-sample-project-2",
      githubInstallationId: "154095438",
      expectedRevision: created.repositoryRevision,
      actorEmail: "operator@example.com",
      now: LATER,
      access: { ...access, checkId: "check-repository" },
    });
    assert.equal(rerouted.repository, "sachinkundu/deos-sample-project-2");
    assert.equal(rerouted.dispatchEnabled, false);
    assert.equal(rerouted.activeRuns, 3);
    assert.equal(rerouted.routeRevision, 2);
    assert.deepEqual(
      { ...database.sqlite.prepare(
        "SELECT route_repository, route_github_installation_id, route_revision, route_digest FROM orchestration_runs WHERE run_id = 'run-1'",
      ).get() },
      {
        route_repository: "sachinkundu/deos-sample-project",
        route_github_installation_id: "154095438",
        route_revision: 1,
        route_digest: created.routeDigest,
      },
    );
    assert.deepEqual(
      database.sqlite.prepare(
        "SELECT status, route_repository FROM orchestration_runs WHERE project_id = 'project-1' ORDER BY status",
      ).all().map((row) => ({ ...row })),
      [
        { status: "active", route_repository: "sachinkundu/deos-sample-project" },
        { status: "awaiting_capability", route_repository: "sachinkundu/deos-sample-project" },
        { status: "awaiting_human", route_repository: "sachinkundu/deos-sample-project" },
      ],
    );

    const enabled = await routes.saveWorkflow({
      projectId: "project-1",
      dispatchEnabled: true,
      expectedRevision: rerouted.workflowRevision,
      actorEmail: "operator@example.com",
      now: LATER,
      access: {
        ...access,
        repository: rerouted.repository,
        installationId: rerouted.githubInstallationId,
        checkId: "check-enable",
      },
    });
    assert.equal(enabled.dispatchEnabled, true);
    const confirmed = await routes.saveWorkflow({
      projectId: "project-1",
      dispatchEnabled: true,
      expectedRevision: enabled.workflowRevision,
      actorEmail: "operator@example.com",
      now: LATER,
      access: {
        ...access,
        repository: enabled.repository,
        installationId: enabled.githubInstallationId,
        checkId: "check-enable-repeat",
      },
    });
    assert.equal(confirmed.workflowRevision, enabled.workflowRevision);
    assert.equal(confirmed.routeRevision, enabled.routeRevision);
    const reviewed = await routes.saveReview({
      projectId: "project-1",
      model: "anthropic/claude-opus-4.1",
      expectedRevision: confirmed.independentReviewRevision,
      actorEmail: "operator@example.com",
      now: LATER,
    });
    assert.equal(reviewed.independentReviewModel, "anthropic/claude-opus-4.1");

    await assert.rejects(routes.saveAccessResult({
      projectId: "project-1",
      repository: "sachinkundu/deos-sample-project",
      installationId: reviewed.githubInstallationId,
      expectedRouteRevision: reviewed.routeRevision - 1,
      expectedRouteDigest: enabled.routeDigest,
      checkId: "check-stale-repository",
      requiredPermissionsDigest: "a".repeat(64),
      observedPermissionsDigest: "b".repeat(64),
      result: "passed",
      settingsUrl: access.settingsUrl,
      safeErrorCategory: null,
      actorEmail: "workflow",
      now: LATER,
    }), (error: unknown) =>
      error instanceof RepositoryRouteError && error.code === "stale_repository_revision");
    assert.deepEqual(
      { ...database.sqlite.prepare(
        "SELECT repository, installation_id, result FROM route_access_checks WHERE check_id = 'check-stale-repository'",
      ).get() },
      {
        repository: "sachinkundu/deos-sample-project",
        installation_id: reviewed.githubInstallationId,
        result: "passed",
      },
    );
    assert.equal((await routes.readView("project-1"))?.accessState, "passed");

    const disabled = await routes.saveAccessResult({
      projectId: "project-1",
      repository: reviewed.repository,
      installationId: reviewed.githubInstallationId,
      expectedRouteRevision: reviewed.routeRevision,
      expectedRouteDigest: reviewed.routeDigest,
      checkId: "check-access-loss",
      requiredPermissionsDigest: "a".repeat(64),
      observedPermissionsDigest: null,
      result: "missing",
      settingsUrl: access.settingsUrl,
      safeErrorCategory: "github_route_access_denied",
      actorEmail: "workflow",
      now: LATER,
    });
    assert.equal(disabled.dispatchEnabled, false);
    assert.equal(disabled.accessState, "missing");
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS count FROM route_access_checks").get()?.count, 6);
  } finally {
    database.close();
  }
});

test("legacy backfill completes route metadata and active-run snapshots without changing the target", async () => {
  const database = new SqliteD1Database();
  try {
    seedDefinition(database, "project-legacy");
    database.sqlite.prepare(
      `INSERT INTO project_workflow_policies
       (project_id, definition_id, definition_version, definition_digest,
        trial_repository, start_state_name, human_gate_state_id, dispatch_enabled,
        independent_review_model, updated_at)
       VALUES ('project-legacy', 'simple-traceability', 4, ?, 'sachinkundu/deos',
               'In Progress', 'human-review', 1, 'openai/gpt-5.4', ?)`,
    ).run("d".repeat(64), NOW);
    database.sqlite.prepare(
      `INSERT INTO orchestration_runs
       (run_id, correlation_id, run_sequence, project_id, issue_id, definition_id,
        definition_version, definition_digest, workflow_instance_id, current_node,
        current_visit_sequence, status, created_at, updated_at)
       VALUES ('run-legacy', 'correlation-legacy', 1, 'project-legacy', 'issue-legacy',
               'simple-traceability', 4, ?, 'workflow-legacy', 'author', 1, 'active', ?, ?)`,
    ).run("d".repeat(64), NOW, NOW);

    const routes = new D1RepositoryRouteStore(database as unknown as D1Database);
    const result = await routes.backfillLegacyRoute({
      projectId: "project-legacy",
      projectName: "DEOS",
      githubInstallationId: "154095438",
      actorEmail: "deployment",
      now: LATER,
    });
    assert.equal(result.route.trial_repository, "sachinkundu/deos");
    assert.equal(result.route.github_installation_id, "154095438");
    assert.equal(result.activeRuns[0]?.route_repository, "sachinkundu/deos");
    assert.equal(result.activeRuns[0]?.route_github_installation_id, "154095438");
    assert.equal(result.activeRuns[0]?.route_digest, result.route.route_digest);
  } finally {
    database.close();
  }
});

test("atomic allocation freezes the matching route and rejects an old route proof", async () => {
  const database = new SqliteD1Database();
  try {
    seedDefinition(database, "project-atomic");
    const routes = new D1RepositoryRouteStore(database as unknown as D1Database);
    const access = {
      checkId: "check-atomic-create",
      requiredPermissionsDigest: "a".repeat(64),
      observedPermissionsDigest: "b".repeat(64),
      settingsUrl: "https://github.com/settings/installations/154095438",
    };
    const created = await routes.create({
      projectId: "project-atomic",
      projectName: "Atomic sample",
      repository: "sachinkundu/deos-sample-project",
      githubInstallationId: "154095438",
      definitionId: "simple-traceability",
      definitionVersion: 4,
      definitionDigest: "d".repeat(64),
      startStateName: "In Progress",
      humanGateStateId: "human-review",
      independentReviewModel: "openai/gpt-5.4",
      actorEmail: "operator@example.com",
      now: NOW,
      access,
    });
    const enabled = await routes.saveWorkflow({
      projectId: created.projectId,
      dispatchEnabled: true,
      expectedRevision: created.workflowRevision,
      actorEmail: "operator@example.com",
      now: NOW,
      access: {
        ...access,
        repository: created.repository,
        installationId: created.githubInstallationId,
        checkId: "check-atomic-enable",
      },
    });
    const definition = {
      name: "simple-traceability",
      version: 4,
      digest: "d".repeat(64),
      start: "author",
      jobs: {},
    } as LoadedWorkflowDefinition;
    const store = new D1OrchestrationStore(database as unknown as D1Database);
    const selection = {
      kind: "default" as const,
      value: "project_policy",
      labelName: null,
      reason: null,
      evidenceJson: '{"status":"available","labels":[]}',
      deliveryId: "delivery-atomic-1",
      observedAt: NOW,
      providerDigest: "e".repeat(64),
    };
    const allocation = await store.allocateRun({
      projectId: enabled.projectId,
      issueId: "issue-atomic-1",
      definition,
      selection,
      routeRevision: enabled.routeRevision,
      routeDigest: enabled.routeDigest,
      now: NOW,
    });
    assert.equal(allocation?.created, true);
    assert.equal(allocation?.run.route_repository, "sachinkundu/deos-sample-project");
    assert.equal(allocation?.run.route_github_installation_id, "154095438");
    assert.equal(allocation?.run.route_revision, enabled.routeRevision);
    assert.equal(allocation?.run.route_digest, enabled.routeDigest);

    const changed = await routes.saveReview({
      projectId: enabled.projectId,
      model: "anthropic/claude-opus-4.1",
      expectedRevision: enabled.independentReviewRevision,
      actorEmail: "operator@example.com",
      now: LATER,
    });
    assert.notEqual(changed.routeDigest, enabled.routeDigest);
    const stale = await store.allocateRun({
      projectId: enabled.projectId,
      issueId: "issue-atomic-2",
      definition,
      selection: { ...selection, deliveryId: "delivery-atomic-2" },
      routeRevision: enabled.routeRevision,
      routeDigest: enabled.routeDigest,
      now: LATER,
    });
    assert.equal(stale, null);
    assert.equal(
      database.sqlite.prepare("SELECT COUNT(*) AS count FROM orchestration_runs WHERE issue_id = 'issue-atomic-2'").get()?.count,
      0,
    );
  } finally {
    database.close();
  }
});

test("deployment seed is created only for an empty route list", async () => {
  const definition = {
    name: "simple",
    version: 2,
    digest: "f".repeat(64),
    start: "claim_issue",
    jobs: {},
  } as LoadedWorkflowDefinition;
  const environment = (database: SqliteD1Database): QueueConsumerEnv => ({
    DB: database as unknown as D1Database,
    LINEAR_PROJECT_ID: "seed-project",
    LINEAR_START_STATE_NAME: "In Progress",
    LINEAR_HUMAN_APPROVAL_STATE_ID: "human-review",
    TRIAL_REPOSITORY: "sachinkundu/deos-sample-project",
    TRIAL_DISPATCH_ENABLED: "false",
    GITHUB_INSTALLATION_ID: "154095438",
  } as unknown as QueueConsumerEnv);

  const empty = new SqliteD1Database();
  try {
    await registerBundledWorkflowDefinitions(environment(empty), {
      definitions: { simple: definition },
      defaultDefinition: definition,
      now: () => new Date(NOW),
    });
    assert.deepEqual(
      empty.sqlite.prepare("SELECT project_id, trial_repository, github_installation_id FROM project_workflow_policies").all()
        .map((row) => ({ ...row })),
      [{
        project_id: "seed-project",
        trial_repository: "sachinkundu/deos-sample-project",
        github_installation_id: "154095438",
      }],
    );
  } finally {
    empty.close();
  }

  const configured = new SqliteD1Database();
  try {
    configured.sqlite.prepare(
      `INSERT INTO workflow_definitions
       (definition_id, version, project_id, name, canonical_json, digest, created_at)
       VALUES ('simple', 2, 'configured-project', 'simple', '{}', ?, ?)`,
    ).run(definition.digest, NOW);
    await new D1RepositoryRouteStore(configured as unknown as D1Database).create({
      projectId: "configured-project",
      projectName: "Configured project",
      repository: "sachinkundu/deos-sample-project-2",
      githubInstallationId: "154095438",
      definitionId: definition.name,
      definitionVersion: definition.version,
      definitionDigest: definition.digest,
      startStateName: "In Progress",
      humanGateStateId: "human-review",
      independentReviewModel: null,
      actorEmail: "operator@example.com",
      now: NOW,
      access: {
        checkId: "configured-check",
        requiredPermissionsDigest: "a".repeat(64),
        observedPermissionsDigest: "b".repeat(64),
        settingsUrl: "https://github.com/settings/installations/154095438",
      },
    });
    await registerBundledWorkflowDefinitions(environment(configured), {
      definitions: { simple: definition },
      defaultDefinition: definition,
      now: () => new Date(LATER),
    });
    assert.deepEqual(
      configured.sqlite.prepare("SELECT project_id FROM project_workflow_policies ORDER BY project_id").all()
        .map((row) => ({ ...row })),
      [{ project_id: "configured-project" }],
    );

    const updatedDefinition = {
      ...definition,
      version: 3,
      digest: "c".repeat(64),
    } as LoadedWorkflowDefinition;
    await registerBundledWorkflowDefinitions(environment(configured), {
      definitions: { simple: updatedDefinition },
      defaultDefinition: updatedDefinition,
      now: () => new Date(LATER),
    });
    const linked = await new D1RepositoryRouteStore(configured as unknown as D1Database).read("configured-project");
    assert.equal(linked?.definition_version, 3);
    assert.equal(linked?.definition_digest, updatedDefinition.digest);
    assert.equal(linked?.route_revision, 2);
    assert.equal(linked?.repository_revision, 1);
    assert.equal(linked?.workflow_revision, 1);
    assert.equal(linked?.independent_review_revision, 1);
    if (linked === null) throw new Error("linked route is missing");
    const { route_digest: _savedDigest, ...routeForDigest } = linked;
    assert.equal(linked.route_digest, await repositoryRouteDigest(routeForDigest));
  } finally {
    configured.close();
  }
});
