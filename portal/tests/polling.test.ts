import assert from "node:assert/strict";
import test from "node:test";
import { applyStaged, receivePoll } from "../src/polling.ts";

test("polling applies the first read and stages later confirmed changes", () => {
  const first = receivePoll({ applied: null, staged: null, error: "old" }, { status: "active" });
  assert.deepEqual(first, { applied: { status: "active" }, staged: null, error: null });
  const unchanged = receivePoll(first, { status: "active" });
  assert.equal(unchanged.staged, null);
  const changed = receivePoll(unchanged, { status: "succeeded" });
  assert.deepEqual(changed.applied, { status: "active" });
  assert.deepEqual(changed.staged, { status: "succeeded" });
  assert.deepEqual(applyStaged(changed), { applied: { status: "succeeded" }, staged: null, error: null });
});
