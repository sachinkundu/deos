import assert from "node:assert/strict";
import test from "node:test";

import { createTelemetryEvent } from "../src/telemetry.ts";

test("OTEL event exposes a stable correlation attribute", () => {
  const event = createTelemetryEvent("deos.queue.consumed", {
    serviceName: "deos-queue-consumer-ts",
    correlationId: "delivery-1",
    timestamp: new Date("2026-08-12T12:00:00.000Z"),
    attributes: { "deos.issue.id": "issue-1" },
  });

  assert.equal(event.EventName, "deos.queue.consumed");
  assert.equal(event.Timestamp, "2026-08-12T12:00:00.000Z");
  assert.deepEqual(event.Resource, { "service.name": "deos-queue-consumer-ts" });
  assert.deepEqual(event.Attributes, {
    "deos.correlation.id": "delivery-1",
    "deos.issue.id": "issue-1",
  });
});
