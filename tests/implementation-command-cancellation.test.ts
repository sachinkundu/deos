import assert from "node:assert/strict";
import test from "node:test";
import { createServer, request } from "node:http";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
// @ts-expect-error The container runtime is JavaScript.
import { responseCommand } from "../container/implementation-runtime.mjs";
// @ts-expect-error The container runtime is JavaScript.
import { implementationRequestQueue } from "../container/implementation-browser-demo.mjs";

test("a checked subprocess can await its browser request without releasing command serialization", {timeout:10000}, async () => {
  const root = await mkdtemp(join(tmpdir(), "deos-nested-browser-"));
  const script = join(root, "browser-check.mjs");
  await writeFile(script, `const response = await fetch(process.argv[2]);
if (!response.ok) throw new Error(await response.text());
console.log(await response.text());
`);
  const queue = implementationRequestQueue();
  const events: string[] = [];
  let started!: () => void;
  const firstStarted = new Promise<void>(resolve => { started = resolve; });
  let origin = "";
  const server = createServer((req, res) => {
    const action = req.url === "/browser" ? "browser" : "check";
    void queue.run(action, async () => {
      if (action === "browser") {
        events.push("browser");
        res.end("hosted browser reached");
      } else if (req.url === "/first") {
        events.push("first started");
        started();
        const result = await responseCommand(res, [process.execPath, script, `${origin}/browser`], root,
          {timeout:3000});
        events.push("first completed");
        res.end(JSON.stringify(result));
      } else {
        events.push("second started");
        res.end("second completed");
      }
    }, (error: Error) => { res.statusCode = 500; res.end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  origin = `http://127.0.0.1:${address.port}`;
  try {
    const first = fetch(`${origin}/first`);
    await firstStarted;
    const second = fetch(`${origin}/second`);
    const response = await first;
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json() as {exitCode:number; stdout:string};
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "hosted browser reached\n");
    assert.equal(await (await second).text(), "second completed");
    await queue.drain();
    assert.deepEqual(events, ["first started", "browser", "first completed", "second started"]);
  } finally {
    await queue.drain();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, {recursive:true, force:true});
  }
});

test("disconnecting a command client stops its process and retains its output", {timeout:10000}, async () => {
  const root = await mkdtemp(join(tmpdir(), "deos-command-disconnect-"));
  const ready = join(root, "ready.json");
  const script = join(root, "waiting.mjs");
  await writeFile(script, `import { writeFileSync } from 'node:fs';
console.log('waiting for server response');
writeFileSync(${JSON.stringify(ready)}, JSON.stringify({pid:process.pid}));
setInterval(()=>{}, 1000);
`);
  let resolveResult: (value: any) => void;
  const result = new Promise<any>(resolve => { resolveResult = resolve; });
  const server = createServer(async (_req, res) => {
    try {
      const output = await responseCommand(res, [process.execPath, script], root);
      resolveResult({output});
      res.end("done");
    } catch (error) {
      resolveResult({error});
      if (!res.destroyed) res.end("failed");
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const client = request({hostname:"127.0.0.1", port:address.port});
  const clientClosed = new Promise<Error>(resolve => client.once("error", resolve));
  client.end();
  try {
    let pid: number | undefined;
    for (let i=0; i<100; i++) {
      try { pid = JSON.parse(await readFile(ready, "utf8")).pid; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    }
    assert.ok(pid, "child must start before the client is interrupted");
    client.destroy(new Error("agent interrupted its command"));
    assert.match((await clientClosed).message, /agent interrupted/);
    const {error} = await result;
    assert.match(error.message, /Command canceled/);
    assert.match(error.cause.message, /client closed/);
    assert.match(error.result.stdout, /waiting for server response/);
    assert.equal(error.result.signal, "SIGKILL");
    assert.throws(() => process.kill(pid!, 0), {code:"ESRCH"});
  } finally {
    client.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, {recursive:true, force:true});
  }
});

test("a normal command response preserves successful completion", {timeout:10000}, async () => {
  const root = await mkdtemp(join(tmpdir(), "deos-command-response-"));
  const script = join(root, "complete.mjs");
  await writeFile(script, "console.log('complete');\n");
  const server = createServer(async (_req, res) => {
    try { res.end(JSON.stringify(await responseCommand(res, [process.execPath, script], root))); }
    catch (error) { res.statusCode = 500; res.end(String(error)); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/`);
    assert.equal(response.status, 200);
    const result = await response.json() as {exitCode:number; stdout:string};
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, "complete\n");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(root, {recursive:true, force:true});
  }
});
