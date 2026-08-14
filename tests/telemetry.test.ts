import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ERROR_TYPES,
  TELEMETRY_SCHEMA_VERSION,
  WORKFLOW_OUTCOMES,
  WORKFLOW_STAGES,
  buildObservation,
  workflowIdentity,
} from "../src/telemetry.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/workflow-observation-schema.json", import.meta.url), "utf8"),
) as {
  schema_version: string;
  required_keys: string[];
  stages: string[];
  outcomes: string[];
  error_types: string[];
  forbidden_keys: string[];
};

const base = {
  serviceName: "deos-queue-consumer-ts",
  stage: "queue.consume" as const,
  outcome: "succeeded" as const,
  correlationId: "workflow:project-1:issue-1",
  deliveryId: "delivery-1",
  issueId: "issue-1",
  projectId: "project-1",
  runId: "workflow:project-1:issue-1",
};

test("TypeScript contract matches the shared schema fixture", () => {
  const result = buildObservation(base, () => new Date("2026-08-14T05:00:00Z"));
  assert.equal(TELEMETRY_SCHEMA_VERSION, fixture.schema_version);
  assert.deepEqual(Object.keys(result).sort(), fixture.required_keys.toSorted());
  assert.deepEqual([...WORKFLOW_STAGES], fixture.stages);
  assert.deepEqual([...WORKFLOW_OUTCOMES], fixture.outcomes);
  assert.deepEqual([...ERROR_TYPES], fixture.error_types);
});

test("workflow identity is stable and observations exclude forbidden fields", () => {
  assert.equal(workflowIdentity("project-1", "issue-1"), "workflow:project-1:issue-1");
  const result = buildObservation(base);
  assert.equal(fixture.forbidden_keys.some((key) => key in result), false);
});

test("failed observations require a closed service-authored category", () => {
  assert.equal(
    buildObservation({ ...base, outcome: "failed", errorType: "linear_http_failed" })[
      "error.type"
    ],
    "linear_http_failed",
  );
  assert.throws(() => buildObservation({ ...base, outcome: "failed" }));
  assert.throws(() => buildObservation({ ...base, errorType: "linear_http_failed" }));
});

test("Queue attempt fields are paired", () => {
  const result = buildObservation({ ...base, messageId: "message-1", attemptNumber: 2 });
  assert.equal(result["messaging.message.id"], "message-1");
  assert.equal(result["deos.workflow.attempt.number"], 2);
  assert.throws(() => buildObservation({ ...base, messageId: "message-1" }));
});
