import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
// @ts-expect-error Container modules are JavaScript.
import { requestVerification } from "../container/implementation-verification-transport.mjs";

const init = { method: "POST", body: JSON.stringify({ action: "verify", subject: { treeSha: "a".repeat(40) } }) };
test("a stalled verification read is retried with the same subject and the original timeout retained", async () => {
  const root = await mkdtemp(join(tmpdir(), "verification-transport-")), journal = join(root, "diagnostics.jsonl");
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    let body = "";
    for await (const chunk of req) body += chunk;
    assert.equal(body, init.body);
    if (calls === 1) return; // Real open connection with no response headers.
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ready: false, code: "proof_incomplete", message: "Refresh browser proof" }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const port = (server.address() as { port: number }).port;
    const response = await requestVerification(`http://127.0.0.1:${port}/verify`, init,
      { deadline: Date.now() + 5000, journal, timeoutMs: 100 });
    assert.deepEqual(await response.json(), { ready: false, code: "proof_incomplete", message: "Refresh browser proof" });
    assert.equal(calls, 2);
    const diagnostic = JSON.parse((await readFile(journal, "utf8")).trim());
    assert.equal(diagnostic.operation, "verification.transport");
    assert.equal(diagnostic.attempt, 1);
    assert.match(diagnostic.detail, /TimeoutError/);
  } finally { server.closeAllConnections(); server.close(); await once(server, "close"); await rm(root, { recursive: true, force: true }); }
});

test("verification retries obey the absolute deadline and preserve the nested provider transport error", async () => {
  const root = await mkdtemp(join(tmpdir(), "verification-deadline-")), journal = join(root, "diagnostics.jsonl");
  const cause = Object.assign(new Error("Headers Timeout Error"), { code: "UND_ERR_HEADERS_TIMEOUT" });
  const original = new TypeError("fetch failed", { cause });
  let now = 0, calls = 0;
  try {
    await assert.rejects(requestVerification("https://broker.test/verify", init, { deadline: 10, journal, now: () => now,
      request: async () => { calls++; now = 10; throw original; } }), (error: unknown) => error === original);
    assert.equal(calls, 1);
    assert.match(await readFile(journal, "utf8"), /UND_ERR_HEADERS_TIMEOUT/);
    assert.match(await readFile(journal, "utf8"), /Headers Timeout Error/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("verification transport never replays a provider action or a server rejection", async () => {
  let calls = 0;
  const options = { deadline: Date.now() + 5000, journal: "/unused",
    request: async () => { calls++; return new Response("expired capability", { status: 403 }); } };
  await assert.rejects(requestVerification("https://broker.test/verify", { method: "POST", body: '{"action":"safe_test"}' }, options), /read-only verify/);
  assert.equal(calls, 0);
  const response = await requestVerification("https://broker.test/verify", init, options);
  assert.equal(response.status, 403); assert.equal(await response.text(), "expired capability"); assert.equal(calls, 1);
});

test("repeated verification transport failures stop after three requests and retain each cause", async () => {
  const root = await mkdtemp(join(tmpdir(), "verification-exhausted-")), journal = join(root, "diagnostics.jsonl");
  const failures = Array.from({ length: 3 }, (_, index) => new TypeError(`fetch failed ${index}`,
    { cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }) }));
  let calls = 0;
  try {
    await assert.rejects(requestVerification("https://broker.test/verify", init, { deadline: Date.now() + 10000, journal,
      request: async () => { throw failures[calls++]; } }), (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, failures); assert.equal(error.cause, failures[0]);
      return true;
    });
    assert.equal(calls, 3);
    assert.equal((await readFile(journal, "utf8")).trim().split("\n").length, 3);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unexpected verification errors and diagnostic failures retain the original cause", async () => {
  const original = new Error("unexpected failure");
  await assert.rejects(requestVerification("https://broker.test/verify", init,
    { deadline: Date.now() + 5000, journal: "/missing-verification-directory/diagnostics.jsonl", request: async () => { throw original; } }),
    (error: unknown) => error instanceof AggregateError && error.cause === original && error.errors[0] === original && error.errors.length === 2);
});
