import assert from "node:assert/strict";
import test from "node:test";
import { sandboxStartupFailures } from "../src/sandbox-failures.ts";

test("portal exposes durable capacity errors with their saved tier and original detail link", async () => {
  const db = { prepare: () => ({ all: async () => ({results: [{
    id: "failure-1", projectId: "project-1", issueKey: "SAC-173", sandboxTier: "standard-2",
    occurredAt: "2026-09-12T10:00:00Z", location: "sandbox.start.capacity",
    message: "Provider capacity exhausted",
  }]}) }) } as unknown as D1Database;
  assert.deepEqual(await sandboxStartupFailures(db), [{
    id: "failure-1", projectId: "project-1", issueKey: "SAC-173", sandboxTier: "standard-2",
    occurredAt: "2026-09-12T10:00:00Z", cause: "capacity", message: "Provider capacity exhausted",
    detailUrl: "/failure-detail/failure-1",
  }]);
});

test("portal does not turn a failed diagnostic read into an empty failure list", async () => {
  const original = new Error("D1 unavailable");
  const db = { prepare: () => ({ all: async () => { throw original; } }) } as unknown as D1Database;
  await assert.rejects(sandboxStartupFailures(db), error => error === original);
});
