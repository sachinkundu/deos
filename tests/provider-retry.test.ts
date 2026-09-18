import assert from "node:assert/strict";
import test from "node:test";
import { createProviderRetry, providerRetryReason, PROVIDER_RETRY_DELAYS_MS, type RetryReceipt } from "../container/provider-retry.mjs";
import { implementationProcessFailure } from "../container/implementation-process-failure.mjs";

const failure = (message = "Selected model is at capacity. Please try a different model.") =>
  implementationProcessFailure({code: 1, signal: null}, JSON.stringify({type: "turn.failed", error: {message}}), "original stderr")!;

const harness = (deadline = 1_000_000) => {
  let time = 0;
  const receipts: RetryReceipt[] = [], delays: number[] = [];
  const retry = createProviderRetry({deadline, now: () => time, random: () => 0,
    record: async receipt => { receipts.push(receipt); },
    sleep: async ms => { delays.push(ms); time += ms; }});
  return {retry, receipts, delays};
};

test("capacity recovery resumes the exact session and preserves work across turns", async () => {
  const h = harness();
  const saved = {completedTasks: ["1", "2"], files: ["app.js"]};
  const sessions: (string | null | undefined)[] = [];
  const original = failure();
  const result = await h.retry({sessionId: () => "session-1", run: async session => {
    sessions.push(session);
    assert.deepEqual(saved.files, ["app.js"]);
    return sessions.length === 1 ? {result: 1, error: original} : {result: 0, error: null};
  }});
  assert.equal(result, 0);
  assert.deepEqual(sessions, [undefined, "session-1"]);
  assert.deepEqual(h.delays, [15_000]);
  assert.equal(h.receipts[0].error, original);
  assert.equal(h.receipts[0].outcome, "waiting");
});

test("exhaustion keeps every original failure and bounds total invocations", async () => {
  const h = harness();
  const failures: Error[] = [];
  const result = await h.retry({sessionId: () => "same-session", run: async () => {
    const error = failure(); failures.push(error); return {result: 1, error};
  }});
  assert.equal(result, 1);
  assert.equal(failures.length, 4);
  assert.deepEqual(h.delays, PROVIDER_RETRY_DELAYS_MS);
  assert.deepEqual(h.receipts.map(r => r.error), failures);
  assert.equal(h.receipts.at(-1)?.outcome, "exhausted");
  assert.equal(h.receipts.at(-1)?.delayMs, null);
});

test("retry budget is shared across completion-repair turns", async () => {
  const h = harness();
  let calls = 0;
  const run = async () => ({result: ++calls, error: calls % 2 ? failure() : null});
  for (let n = 0; n < 3; n++) await h.retry({sessionId: () => "same", run});
  await h.retry({sessionId: () => "same", run});
  assert.equal(calls, 7);
  assert.equal(h.receipts.at(-1)?.outcome, "exhausted");
});

test("no retry is started when delay would cross the deadline", async () => {
  const h = harness(10_000);
  let calls = 0;
  await h.retry({sessionId: () => null, run: async () => ({result: ++calls, error: failure()})});
  assert.equal(calls, 1); assert.deepEqual(h.delays, []);
  assert.equal(h.receipts[0].outcome, "exhausted");
});

test("provider failure before session creation retries without inventing an identity", async () => {
  const h = harness(); const sessions: unknown[] = [];
  await h.retry({sessionId: () => null, run: async session => {
    sessions.push(session); return {result: 0, error: sessions.length === 1 ? failure() : null};
  }});
  assert.deepEqual(sessions, [undefined, null]);
});

test("permanent and tool failures are not retried as model outages", () => {
  for (const message of ["Your usage limit is exceeded", "invalid API key", "permission denied", "AssertionError", "unknown model"])
    assert.equal(providerRetryReason(failure(message)), null);
  assert.equal(providerRetryReason(new Error("Selected model is at capacity.")), null);
  const toolOnly = implementationProcessFailure({code: 1, signal: null}, JSON.stringify({type: "item.completed", item: {aggregated_output: "Selected model is at capacity."}}), "Service unavailable");
  assert.equal(providerRetryReason(toolOnly), null);
});

test("a retry journal failure cannot silently rerun the provider", async () => {
  let calls = 0;
  const retry = createProviderRetry({deadline: 1_000_000, now: () => 0, record: async () => {throw new Error("storage unavailable");}, sleep: async () => {assert.fail("must preserve before waiting");}});
  await assert.rejects(retry({sessionId: () => "same", run: async () => ({result: ++calls, error: failure()})}), /storage unavailable/);
  assert.equal(calls, 1);
});
