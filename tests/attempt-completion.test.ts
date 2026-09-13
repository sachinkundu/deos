import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AttemptCompletionNotifier } from "../src/attempt-completion.ts";
import { notifyAttemptCompletion } from "../container/attempt-completion.mjs";

const setup = () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE orchestration_runs (run_id TEXT, workflow_instance_id TEXT,
    status TEXT, current_node TEXT, current_visit_sequence INTEGER);
    CREATE TABLE agent_attempts (attempt_id TEXT, run_id TEXT, state TEXT,
    cleanup_state TEXT, node_id TEXT, visit_sequence INTEGER, created_at TEXT);
    INSERT INTO orchestration_runs VALUES ('run','workflow','active','review',1);
    INSERT INTO agent_attempts VALUES ('attempt','run','running','pending','review',1,'1');`);
  const database = { prepare(sql: string) { return { bind(...values: string[]) {
    return { async first() { return sqlite.prepare(sql).get(...values) ?? null; } };
  } }; } };
  const calls: unknown[] = [];
  const notifier = new AttemptCompletionNotifier(database as unknown as D1Database, {
    async get(id: string) { return { async sendEvent(event: unknown) { calls.push({ id, event }); } }; },
  } as never);
  return { sqlite, calls, notifier };
};

test("completion sends only a hint to the current saved workflow, including early and duplicate signals", async () => {
  const { sqlite, calls, notifier } = setup();
  try {
    sqlite.exec("UPDATE agent_attempts SET state='starting'");
    assert.equal(await notifier.notify("run", "attempt"), true);
    sqlite.exec("UPDATE agent_attempts SET state='running'; UPDATE orchestration_runs SET workflow_instance_id='recovered'");
    assert.equal(await notifier.notify("run", "attempt"), true);
    assert.deepEqual(calls, ["workflow", "recovered"].map(id => ({ id,
      event: { type: "linear-event", payload: { kind: "attempt-completed", attemptId: "attempt" } },
    })));
    assert.equal(sqlite.prepare("SELECT state FROM agent_attempts").get()?.state, "running");
  } finally { sqlite.close(); }
});

test("inactive, superseded, cross-run and stale-visit attempts cannot notify", async () => {
  for (const mutation of [
    "UPDATE orchestration_runs SET status='succeeded'",
    "UPDATE orchestration_runs SET current_node='next'",
    "UPDATE orchestration_runs SET current_visit_sequence=2",
    "UPDATE agent_attempts SET state='completed'",
    "UPDATE agent_attempts SET cleanup_state='destroyed'",
    "INSERT INTO agent_attempts VALUES ('new-attempt','run','running','pending','review',1,'2')",
  ]) {
    const { sqlite, calls, notifier } = setup();
    try {
      assert.equal(await notifier.notify("other-run", "attempt"), false);
      assert.equal(await notifier.notify("run", "other-attempt"), false);
      sqlite.exec(mutation);
      assert.equal(await notifier.notify("run", "attempt"), false, mutation);
      assert.deepEqual(calls, []);
    } finally { sqlite.close(); }
  }
});

test("event transport errors retain their original cause", async () => {
  const error = new Error("workflow unavailable", { cause: new Error("connection reset") });
  const notifier = new AttemptCompletionNotifier({ prepare: () => ({ bind: () => ({
    first: async () => ({ workflowInstanceId: "workflow" }),
  }) }) } as never, { get: async () => ({ sendEvent: async () => { throw error; } }) } as never);
  await assert.rejects(notifier.notify("run", "attempt"), caught => caught === error);
});

const job = { capabilityUrl: "https://worker.test/capabilities", capabilityToken: "attempt-grant", attemptId: "attempt" };
test("supervisor notification contains no result or caller-selected workflow identity", async () => {
  const errors: unknown[] = [];
  const ok = await notifyAttemptCompletion(job, {
    recordError: (error: unknown) => errors.push(error),
    fetcher: async (url, init) => {
      assert.equal(url, "https://worker.test/capabilities/attempt-completed");
      assert.deepEqual(JSON.parse(String(init?.body)), { version: 1 });
      assert.equal(new Headers(init?.headers).get("Deos-Attempt"), "attempt");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer attempt-grant");
      return new Response('{"accepted":true}');
    },
  });
  assert.equal(ok, true);
  assert.deepEqual(errors, []);
});

test("lost notification has bounded retries and preserves errors for heartbeat recovery", async () => {
  const original = new Error("socket reset", { cause: new Error("peer closed") });
  const errors: unknown[] = [];
  let calls = 0;
  const ok = await notifyAttemptCompletion(job, {
    recordError: (error: unknown) => errors.push(error),
    fetcher: async () => { calls++; throw original; },
  });
  assert.equal(ok, false);
  assert.equal(calls, 2);
  assert.deepEqual(errors, [original, original]);
});

test("an ambiguous notification can retry without changing the work outcome", async () => {
  let calls = 0;
  const errors: Error[] = [];
  const ok = await notifyAttemptCompletion(job, {
    recordError: (error: unknown) => errors.push(error as Error),
    fetcher: async () => ++calls === 1 ? new Response("busy", { status: 503 }) : new Response('{}'),
  });
  assert.equal(ok, true);
  assert.equal(calls, 2);
  assert.match(errors[0].message, /HTTP 503: busy/);
});
