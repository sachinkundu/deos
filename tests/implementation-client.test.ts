import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
// @ts-expect-error Container modules are JavaScript.
import { implementationRequest } from "../container/implementation-client.mjs";
// @ts-expect-error Container modules are JavaScript.
import { stopProcessGroup } from "../container/implementation-process.mjs";
// @ts-expect-error Container modules are JavaScript.
import { command } from "../container/implementation-runtime.mjs";

test("local tool transport waits for the original response and preserves failures without replay", async () => {
  let calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    assert.equal(JSON.parse(Buffer.concat(chunks).toString()).action, calls === 1 ? "check" : "safe_test");
    assert.equal(req.url, calls === 1 ? "/tool" : "/provider-test");
    await new Promise(resolve => setTimeout(resolve, 40));
    res.writeHead(calls === 1 ? 200 : 400);
    res.end(calls === 1 ? "saved output" : "original provider rejection");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as {port: number}).port;
  try {
    assert.deepEqual(await implementationRequest('{"action":"check"}', port), {statusCode:200,text:"saved output"});
    assert.deepEqual(await implementationRequest('{"action":"safe_test"}', port), {statusCode:400,text:"original provider rejection"});
    assert.equal(calls, 2);
  } finally { server.close(); await once(server, "close"); }
});

test("failed preview cleanup releases its process group so another preview can start", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {detached:true,stdio:"ignore"});
  await once(child, "spawn");
  await stopProcessGroup(child);
  assert.throws(() => process.kill(child.pid!, 0), {code:"ESRCH"});
  await stopProcessGroup(child);
});

test("command deadline stops child processes and retains original command output", async () => {
  await assert.rejects(command([process.execPath, "-e", "console.log('before timeout');setInterval(()=>{},1000)"], process.cwd(), {timeout:150}), (error: unknown) => {
    assert.match((error as Error).message, /Command timed out/);
    assert.match((error as {result:{stdout:string}}).result.stdout, /before timeout/);
    return true;
  });
});
