import assert from "node:assert/strict";
import test from "node:test";

import {
  CategorizedWorkflowError,
  processQueueMessage,
  type QueueBody,
  type QueueConsumerEnv,
} from "../src/queue-consumer-core.ts";
import type { WorkflowObservation } from "../src/telemetry.ts";

interface StoredRun {
  run_id: string;
  current_state: string;
  correlation_id: string;
}

class FakeD1 {
  run: StoredRun | null = null;
  transitions: Array<[string, string, string]> = [];
  mutations = 0;
  failOn: string | null = null;

  prepare(query: string) {
    let values: unknown[] = [];
    const maybeFail = () => {
      if (this.failOn !== null && query.includes(this.failOn)) throw new Error("raw db failure");
    };
    const statement = {
      bind: (...bound: unknown[]) => {
        values = bound;
        return statement;
      },
      first: async <T>() => {
        maybeFail();
        return this.run as T | null;
      },
      run: async () => {
        maybeFail();
        this.mutations += 1;
        if (query.includes("INSERT OR IGNORE INTO workflow_runs") && this.run === null) {
          this.run = {
            run_id: String(values[0]),
            current_state: String(values[3]),
            correlation_id: String(values[4]),
          };
        } else if (query.includes("INSERT OR IGNORE INTO workflow_transitions")) {
          const transition: [string, string, string] = [
            String(values[1]),
            String(values[2]),
            String(values[3]),
          ];
          if (!this.transitions.some((existing) => existing.join("|") === transition.join("|"))) {
            this.transitions.push(transition);
          }
        } else if (query.includes("UPDATE workflow_runs") && this.run !== null) {
          this.run.current_state = String(values[0]);
        }
        return {};
      },
    };
    return statement;
  }
}

const queueBody = (overrides: Partial<QueueBody> = {}): QueueBody => ({
  event_id: "delivery-1",
  source_delivery_id: "delivery-1",
  issue_id: "issue-1",
  project_id: "project-1",
  transition: "In Progress",
  actor_id: "actor-1",
  occurred_at: "2026-08-14T05:00:00Z",
  correlation_id: "workflow:project-1:issue-1",
  ...overrides,
});

const message = (body = queueBody(), attempts = 1) => ({ id: "message-1", attempts, body });

const environment = (db: FakeD1): QueueConsumerEnv =>
  ({
    DB: db,
    LINEAR_API_KEY: "test-only-token",
    LINEAR_API_URL: "https://api.linear.app/graphql",
    LINEAR_HUMAN_APPROVAL_STATE_ID: "human-review-state",
  }) as unknown as QueueConsumerEnv;

const successResponse: typeof fetch = async () =>
  new Response(JSON.stringify({ data: { issueUpdate: { success: true } } }), { status: 200 });

const runMessage = async (
  db: FakeD1,
  options: { body?: QueueBody; attempts?: number; request?: typeof fetch } = {},
) => {
  const observations: WorkflowObservation[] = [];
  await processQueueMessage(
    message(options.body, options.attempts),
    environment(db),
    { fetch: options.request ?? successResponse, observe: (entry) => observations.push(entry) },
  );
  return observations;
};

test("successful attempt preserves correlation through transitions and Linear", async () => {
  const db = new FakeD1();
  const observations = await runMessage(db, { attempts: 2 });

  assert.equal(db.run?.correlation_id, "workflow:project-1:issue-1");
  assert.deepEqual(db.transitions, [
    ["received", "queued", "queue-consumed"],
    ["queued", "requirements_in_progress", "workflow-started"],
    ["requirements_in_progress", "awaiting_human_approval", "approval-required"],
  ]);
  assert.equal(
    observations.every(
      (entry) => entry["deos.workflow.correlation_id"] === "workflow:project-1:issue-1",
    ),
    true,
  );
  assert.equal(observations.every((entry) => entry["deos.workflow.attempt.number"] === 2), true);
  assert.deepEqual(
    observations
      .filter((entry) => entry["deos.workflow.outcome"] === "succeeded")
      .map((entry) => entry["deos.workflow.stage"]),
    [
      "workflow.transition",
      "workflow.transition",
      "workflow.transition",
      "linear.issue_update",
      "queue.consume",
    ],
  );
});

test("reprocessing a terminal run is visible without duplicate transitions", async () => {
  const db = new FakeD1();
  db.run = {
    run_id: "workflow:project-1:issue-1",
    current_state: "approved",
    correlation_id: "workflow:project-1:issue-1",
  };
  const observations = await runMessage(db, { attempts: 3 });

  assert.deepEqual(db.transitions, []);
  assert.deepEqual(
    observations.map((entry) => [
      entry["deos.workflow.stage"],
      entry["deos.workflow.outcome"],
    ]),
    [
      ["queue.consume", "started"],
      ["queue.consume", "succeeded"],
    ],
  );
});

test("correlation mismatch fails before state mutation", async () => {
  const db = new FakeD1();
  const observations: WorkflowObservation[] = [];

  await assert.rejects(
    processQueueMessage(
      message(queueBody({ correlation_id: "wrong" })),
      environment(db),
      { fetch: successResponse, observe: (entry) => observations.push(entry) },
    ),
    (error: unknown) =>
      error instanceof CategorizedWorkflowError && error.category === "correlation_mismatch",
  );
  assert.equal(db.mutations, 0);
  assert.equal(observations.at(-1)?.["error.type"], "correlation_mismatch");
});

test("D1 failures use a service-authored category and no raw detail", async () => {
  const db = new FakeD1();
  db.failOn = "SELECT run_id";
  const observations: WorkflowObservation[] = [];

  await assert.rejects(
    processQueueMessage(message(), environment(db), {
      fetch: successResponse,
      observe: (entry) => observations.push(entry),
    }),
  );
  assert.equal(observations.at(-1)?.["error.type"], "d1_operation_failed");
  assert.equal(JSON.stringify(observations).includes("raw db failure"), false);
});

for (const [name, request, category] of [
  ["transport", async () => { throw new Error("secret transport detail"); }, "linear_transport_failed"],
  ["HTTP", async () => new Response("secret response", { status: 503 }), "linear_http_failed"],
  [
    "GraphQL",
    async () => new Response(JSON.stringify({ errors: [{ message: "secret provider detail" }] })),
    "linear_graphql_failed",
  ],
] as const) {
  test(`Linear ${name} failure is safely categorized and rethrown`, async () => {
    const db = new FakeD1();
    const observations: WorkflowObservation[] = [];
    await assert.rejects(
      processQueueMessage(message(), environment(db), {
        fetch: request as typeof fetch,
        observe: (entry) => observations.push(entry),
      }),
    );
    const failures = observations.filter((entry) => entry["deos.workflow.outcome"] === "failed");
    assert.deepEqual(
      failures.map((entry) => [entry["deos.workflow.stage"], entry["error.type"]]),
      [
        ["linear.issue_update", category],
        ["queue.consume", category],
      ],
    );
    assert.equal(JSON.stringify(observations).includes("secret"), false);
  });
}
