import assert from "node:assert/strict";
import test from "node:test";

import { decideWorkflowAction } from "../src/workflow.ts";

test("start event follows the first workflow to human approval", () => {
  const action = decideWorkflowAction({ transition: "In Progress" }, null);
  assert.equal(action.kind, "start");
  if (action.kind === "start") {
    assert.deepEqual(action.transitions.at(-1), [
      "requirements_in_progress",
      "awaiting_human_approval",
      "approval-required",
    ]);
  }
});

test("human approval is an explicit transition", () => {
  const action = decideWorkflowAction(
    { transition: "In Progress" },
    "awaiting_human_approval",
  );
  assert.deepEqual(action, {
    kind: "approve",
    transition: ["awaiting_human_approval", "approved", "human-approved"],
  });
});

test("cancellation explicitly rejects a waiting workflow", () => {
  const action = decideWorkflowAction({ transition: "Canceled" }, "awaiting_human_approval");
  assert.deepEqual(action, {
    kind: "reject",
    transition: ["awaiting_human_approval", "rejected", "human-rejected"],
  });
});
