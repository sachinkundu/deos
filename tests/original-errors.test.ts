import assert from "node:assert/strict";
import test from "node:test";
import { captureErrors, recordCaughtError } from "../src/error-context.ts";
import { errorDetails, responseError, readResponseText } from "../src/error-details.ts";

test("a classified failure retains the original exception even when the handler returns", async () => {
  const original = new Error("GitHub exact rejection", { cause: new Error("nested original") });
  const written: unknown[] = [];
  const result = await captureErrors(async (errors) => { written.push(...errors); }, async () => {
    try { throw original; } catch (error) { recordCaughtError(error, "publish planning revision"); }
    return { outcome: "failed", category: "planning_publish_rejected" };
  });
  assert.equal(result.outcome, "failed");
  const encoded = JSON.stringify(written);
  assert.match(encoded, /GitHub exact rejection/);
  assert.match(encoded, /nested original/);
  assert.match(encoded, /stack/);
});

test("concurrent runs keep their errors separate", async () => {
  const writes: unknown[][] = [[], []];
  await Promise.all(writes.map((write, index) => captureErrors(async (errors) => { write.push(...errors); }, async () => {
    await Promise.resolve();
    recordCaughtError(new Error(`run-${index}`), "provider");
  })));
  assert.match(JSON.stringify(writes[0]), /run-0/);
  assert.doesNotMatch(JSON.stringify(writes[0]), /run-1/);
});

test("diagnostic storage failure retains both original and storage errors", async () => {
  const original = new Error("original provider failure");
  const storage = new Error("R2 put failed");
  await assert.rejects(captureErrors(async () => { throw storage; }, async () => { throw original; }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [original, storage]);
      return true;
    });
});

test("HTTP response bodies and causes are preserved without redaction or truncation", async () => {
  const body = `provider message Bearer example-token ${"x".repeat(100_000)}`;
  const error = await responseError("GitHub", new Response(body, { status: 422, headers: { "x-request-id": "request-123" } }));
  assert.equal(error.responseBody, body);
  assert.equal(error.responseHeaders["x-request-id"], "request-123");
  const circular = new Error("root") as Error & { self?: Error };
  circular.self = circular;
  assert.match(JSON.stringify(errorDetails(circular)), /Circular/);
});


test("interrupted response keeps the received prefix, status, headers and original exception", async () => {
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (reads++ === 0) controller.enqueue(new TextEncoder().encode("original body prefix"));
    else controller.error(new Error("socket reset by peer"));
  } });
  await assert.rejects(readResponseText(new Response(stream, { status: 503, headers: { "x-request-id": "partial-1" } })), (error: unknown) => {
    const detail = errorDetails(error) as Record<string, unknown>;
    assert.equal(detail.partialBody, "original body prefix");
    assert.equal(detail.status, 503);
    assert.match(JSON.stringify(detail), /socket reset by peer/);
    return true;
  });
});
