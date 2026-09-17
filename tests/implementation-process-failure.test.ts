import assert from "node:assert/strict";
import test from "node:test";
import { implementationProcessFailure } from "../container/implementation-process-failure.mjs";

const jsonl = (...events: unknown[]) => events.map(event => JSON.stringify(event)).join("\n");

test("a provider capacity failure survives without a completion result file", () => {
  const message = "Selected model is at capacity. Please try a different model.";
  const events = [
    { type: "turn.started" },
    { type: "item.started", item: { type: "command_execution", command: "npm run test:evidence" } },
    { type: "error", message },
    { type: "turn.failed", error: { message } },
  ];
  const error = implementationProcessFailure({ code: 1, signal: null }, jsonl(...events), "provider stderr");
  assert.ok(error);
  assert.equal(error.message, message);
  assert.equal(error.safeErrorCategory, "codex_exit_nonzero");
  assert.equal(error.exitCode, 1);
  assert.deepEqual(error.cause.failures, events.slice(2));
  assert.equal(error.cause.stderr, "provider stderr");
});

test("a later failed turn retains its own signal and diagnostics without blaming a prior error", () => {
  const transcript = jsonl({ type: "error", message: "old failure" }, { type: "turn.started" }) + "\ninterrupted JSON";
  const error = implementationProcessFailure({ code: null, signal: "SIGKILL" }, transcript, "memory limit");
  assert.ok(error);
  assert.match(error.message, /SIGKILL/);
  assert.doesNotMatch(error.message, /old failure/);
  assert.deepEqual(error.cause.failures, []);
  assert.equal(error.cause.malformed[0].line, "interrupted JSON");
  assert.equal(error.cause.stderr, "memory limit");
});

test("successful completion is not failed by earlier recoverable diagnostics", () => {
  assert.equal(implementationProcessFailure({ code: 0, signal: null }, jsonl({ type: "error", message: "recovered" }), ""), null);
});
