import assert from "node:assert/strict";
import test from "node:test";
import { isWorkflowEventTimeout } from "../src/workflow-timeout.ts";

test("heartbeat expiry accepts the actual Cloudflare RPC error shape", () => {
  const error = Object.assign(new Error("Execution timed out after 300000ms"), {
    remote: true,
    stack: "WorkflowTimeoutError: Execution timed out after 300000ms\n    at ContextImpl.waitForEvent (index.js:24169:26)",
  });
  assert.equal(isWorkflowEventTimeout(error), true);
  assert.equal(isWorkflowEventTimeout(Object.assign(new Error("expired"), {name: "WorkflowTimeoutError"})), true);
  assert.equal(isWorkflowEventTimeout(new Error(error.message)), false);
  assert.equal(isWorkflowEventTimeout(Object.assign(new Error(error.message), {remote:true,stack:"Error: timeout in fetch"})), false);
  assert.equal(isWorkflowEventTimeout({message:error.message,remote:true,stack:error.stack}), false);
});
