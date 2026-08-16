import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkflowDuration } from "../src/workflow-duration.ts";

test("compact workflow durations use Cloudflare's documented human-readable contract", () => {
  assert.equal(normalizeWorkflowDuration("5m"), "5 minutes");
  assert.equal(normalizeWorkflowDuration("24h"), "24 hours");
  assert.equal(normalizeWorkflowDuration("1000ms"), "1 seconds");
  assert.throws(() => normalizeWorkflowDuration("1 day"), /timeout is invalid/);
  assert.throws(() => normalizeWorkflowDuration("999ms"), /at least one second/);
});
