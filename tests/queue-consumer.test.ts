import assert from "node:assert/strict";
import test from "node:test";

import {
  moveIssueToHumanApproval,
  recordWorkflow,
  type D1Database,
  type D1Statement,
  type Env,
  type QueueBody,
} from "../src/queue-consumer.ts";
import type { TelemetryEventOptions } from "../src/telemetry.ts";

const event: QueueBody = {
  event_id: "delivery-1",
  source_delivery_id: "delivery-1",
  issue_id: "issue-1",
  project_id: "project-1",
  transition: "In Progress",
  actor_id: "actor-1",
  occurred_at: "2026-08-12T12:00:00.000Z",
};

class FakeStatement implements D1Statement {
  private values: unknown[] = [];
  private readonly query: string;
  private readonly statements: Array<{ query: string; values: unknown[] }>;
  private readonly existingState: string | null;

  constructor(
    query: string,
    statements: Array<{ query: string; values: unknown[] }>,
    existingState: string | null,
  ) {
    this.query = query;
    this.statements = statements;
    this.existingState = existingState;
  }

  bind(...values: unknown[]): D1Statement {
    this.values = values;
    return this;
  }

  async first<T>(): Promise<T | null> {
    if (this.existingState !== null && this.query.startsWith("SELECT run_id")) {
      return {
        run_id: "workflow:project-1:issue-1",
        current_state: this.existingState,
      } as T;
    }
    return null;
  }

  async run(): Promise<unknown> {
    this.statements.push({ query: this.query, values: this.values });
    return {};
  }
}

class FakeDatabase implements D1Database {
  readonly statements: Array<{ query: string; values: unknown[] }> = [];
  private readonly existingState: string | null;

  constructor(existingState: string | null = null) {
    this.existingState = existingState;
  }

  prepare(query: string): D1Statement {
    return new FakeStatement(query, this.statements, this.existingState);
  }
}

const makeEnv = (existingState: string | null = null): Env => ({
  DB: new FakeDatabase(existingState),
  LINEAR_API_KEY: "test-key",
  LINEAR_HUMAN_APPROVAL_STATE_ID: "state-1",
  LINEAR_API_URL: "https://api.linear.app/graphql",
});

test("workflow transitions keep the delivery correlation id", async () => {
  const emitted: Array<{ name: string; options: TelemetryEventOptions }> = [];

  const action = await recordWorkflow(event, makeEnv(), (name, options) => {
    emitted.push({ name, options });
  });

  assert.equal(action, "started");
  assert.deepEqual(
    emitted.map(({ name }) => name),
    [
      "deos.workflow.run.created",
      "deos.workflow.transition",
      "deos.workflow.transition",
      "deos.workflow.transition",
    ],
  );
  assert.deepEqual(new Set(emitted.map(({ options }) => options.correlationId)), new Set(["delivery-1"]));
});

test("Linear external call events keep the delivery correlation id", async () => {
  const emitted: Array<{ name: string; options: TelemetryEventOptions }> = [];
  const fetchImpl: typeof fetch = async () =>
    new Response(JSON.stringify({ data: { issueUpdate: { success: true } } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  await moveIssueToHumanApproval(
    event,
    makeEnv(),
    (name, options) => emitted.push({ name, options }),
    fetchImpl,
  );

  assert.deepEqual(
    emitted.map(({ name }) => name),
    ["deos.linear.issue_update.started", "deos.linear.issue_update.succeeded"],
  );
  assert.deepEqual(new Set(emitted.map(({ options }) => options.correlationId)), new Set(["delivery-1"]));
});

test("approval action returns the persisted outcome name", async () => {
  const action = await recordWorkflow(event, makeEnv("awaiting_human_approval"), () => {});

  assert.equal(action, "approved");
});
