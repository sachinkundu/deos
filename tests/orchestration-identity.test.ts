import assert from "node:assert/strict";
import test from "node:test";

import {
  correlationIdentity,
  operationIdentity,
  runIdentity,
  sandboxIdentity,
  transitionIdentity,
  uuidV7,
  visitIdentity,
  workflowInstanceIdentity,
} from "../src/orchestration-identity.ts";

test("derives stable provider-safe lineage and Workflow identities", async () => {
  const correlation = correlationIdentity("project-1", "issue-1");
  const run = runIdentity(correlation, 2);
  const workflow = await workflowInstanceIdentity(run);

  assert.equal(correlation, "workflow:project-1:issue-1");
  assert.equal(run, "workflow:project-1:issue-1:run:2");
  assert.match(workflow, /^wf-v1-[a-z2-7]{52}$/);
  assert.equal(workflow, await workflowInstanceIdentity(run));
});

test("attempt UUIDv7 and Sandbox identities are distinct and attributable", async () => {
  const random = Uint8Array.from({ length: 16 }, (_, index) => index);
  const attempt = uuidV7(1_786_854_400_000, random);
  assert.equal(attempt[14], "7");
  assert.equal(attempt[19], "8");
  assert.match(await sandboxIdentity(attempt), /^sbx-v1-[a-z2-7]{52}$/);
});

test("operation identities include logical intent and ordinal", () => {
  assert.equal(
    operationIdentity("run-1", "implementation", "github-pr", 1),
    "run-1:implementation:github-pr:1",
  );
});

test("visit and transition identities are stable per source visit", () => {
  assert.equal(visitIdentity("run-1", 3), "run-1:visit:3");
  assert.equal(transitionIdentity("run-1", 3), "run-1:visit:3:transition");
  assert.notEqual(transitionIdentity("run-1", 3), transitionIdentity("run-1", 4));
  assert.throws(() => visitIdentity("run-1", 0), /positive sequence/);
});
