import assert from "node:assert/strict";
import test from "node:test";

import { writeLifecycleObservation } from "../src/lifecycle-telemetry.ts";

test("lifecycle telemetry contains bounded identities and no content or credentials", () => {
  const original = console.log;
  let observed: unknown;
  console.log = (value) => { observed = value; };
  try {
    writeLifecycleObservation({
      stage: "artifact.manifest",
      outcome: "succeeded",
      correlationId: "workflow:project-1:issue-1",
      runId: "workflow:project-1:issue-1:run:1",
      attemptId: "attempt-1",
      sandboxId: "sandbox-1",
      manifestId: "manifest-1",
    });
  } finally {
    console.log = original;
  }
  const text = JSON.stringify(observed);
  assert.equal(text.includes("manifest-1"), true);
  for (const forbidden of ["prompt", "transcript", "token", "credential", "request.body", "response.body"]) {
    assert.equal(text.includes(forbidden), false);
  }
});

test("failed lifecycle observation requires a service-authored safe category", () => {
  assert.throws(() => writeLifecycleObservation({
    stage: "sandbox.cleanup",
    outcome: "failed",
    correlationId: "workflow:project-1:issue-1",
    runId: "workflow:project-1:issue-1:run:1",
  }), /safe category/);
});
