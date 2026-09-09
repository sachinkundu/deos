import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
const ids = Array.from({ length: 241 }, (_, i) =>
  `sbx-v1-${"a".repeat(20)}${alphabet[Math.floor(i / 32)]}${alphabet[i % 32]}`
);

async function submit(inventory: unknown, failBatch = 0) {
  const requests: Array<{ version: number; sandboxIds: string[] }> = [];
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, "Bearer test-audit-credential");
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString()));
    response.writeHead(requests.length === failBatch ? 503 : 200, {
      "Content-Type": "application/json",
    });
    response.end(JSON.stringify({ version: 1, reported: 0 }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = (server.address() as AddressInfo).port;
    const child = spawn(process.execPath, ["scripts/audit-sandbox-inventory.mjs"], {
      env: {
        ...process.env,
        DEOS_CLEANUP_AUDIT_URL: `http://127.0.0.1:${port}/cleanup-audit`,
        DEOS_CLEANUP_AUDIT_SECRET: "test-audit-credential",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    child.stdout.resume();
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.stdin.end(JSON.stringify(inventory));
    const [code] = await once(child, "close");
    return { code, stderr, requests };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("provider inventories over 100 are deduplicated and submitted without dropping IDs", async () => {
  const inputIds = ids.slice(0, 141);
  const result = await submit({ instances: [...inputIds, inputIds[0], "not-a-sandbox"].map((name) => ({ name })) });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.requests.map((request) => request.sandboxIds.length), [100, 41]);
  assert.deepEqual(result.requests.flatMap((request) => request.sandboxIds), [...inputIds].sort());
  assert.ok(result.requests.every((request) => request.version === 1));
});

test("empty inventory still checks the authenticated endpoint", async () => {
  const result = await submit({ instances: [] });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.requests, [{ version: 1, sandboxIds: [] }]);
});

test("a rejected batch fails the job without retrying or submitting later batches", async () => {
  const result = await submit(ids, 2);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /HTTP 503/);
  assert.equal(result.requests.length, 2);
});
