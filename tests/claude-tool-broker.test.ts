import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("Claude broker retains rejected HTTP response, request context, and stack", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-broker-"));
  const token = "fixture-broker-token";
  const body = `Repository access denied.\nRequest id: fixture-request.\n${token}`;
  const server = createServer((_, response) => {
    response.writeHead(403, { "x-request-id": "fixture-request", "content-type": "text/plain" });
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const script = (await readFile("container/claude-tool-broker.mjs", "utf8"))
      .replaceAll('"/deos/bin/claude-diagnostics.ts"', JSON.stringify(resolve("src/claude-diagnostics.ts")))
      .replaceAll('"/deos/bin/error-details.ts"', JSON.stringify(resolve("src/error-details.ts")))
      .replaceAll('"/deos/claude/broker-failure.json"', JSON.stringify(join(dir, "failure.json")));
    await writeFile(join(dir, "broker.mjs"), script);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const child = spawn(process.execPath, ["--experimental-strip-types", join(dir, "broker.mjs")], {
      env: { DEOS_BROKER_URL: `http://127.0.0.1:${address.port}`, DEOS_BROKER_TOKEN: token,
        DEOS_ATTEMPT_ID: "attempt" } as unknown as NodeJS.ProcessEnv,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", data => { stdout += data; });
    child.stderr.on("data", data => { stderr += data; });
    const closed = new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    child.stdin.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "read_repository", arguments: { command: "cat design.md" } } }) + "\n");
    assert.equal(await closed, 0);
    assert.equal(stderr, "");
    assert.equal(JSON.parse(stdout).error.message, "read-only tool request failed");
    const raw = await readFile(join(dir, "failure.json"), "utf8");
    const diagnostic = JSON.parse(raw);
    assert.equal(diagnostic.originalError.status, 403);
    assert.equal(diagnostic.originalError.responseBody, body.replaceAll(token, "[REDACTED]"));
    assert.equal(diagnostic.originalError.responseHeaders["x-request-id"], "fixture-request");
    assert.match(diagnostic.originalError.stack, /ProviderResponseError/);
    assert.equal(diagnostic.operation, "tools/call");
    assert.equal(raw.includes(token), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
