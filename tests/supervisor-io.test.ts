import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicJson, recordHeartbeat } from "../container/supervisor-io.mjs";

test("overlapping heartbeat and lifecycle writes retain complete JSON without temporary-file collisions", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervisor-io-"));
  try {
    const path = join(root, "heartbeat.json");
    const values = Array.from({ length: 100 }, (_, sequence) => ({ sequence, content: String(sequence).repeat(1024) }));
    await Promise.all(values.map(value => atomicJson(path, value)));
    const saved = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(saved, values[saved.sequence]);
    assert.deepEqual(await readdir(root), ["heartbeat.json"]);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("heartbeat storage errors keep the original cause and permit the next observation", async () => {
  const original = new Error("disk busy", { cause: new Error("original filesystem failure") });
  const errors: unknown[] = [];
  let writes = 0;
  const write = async () => { if (++writes === 1) throw original; };
  await recordHeartbeat(write, error => errors.push(error));
  await recordHeartbeat(write, error => errors.push(error));
  assert.deepEqual(errors, [original]);
  assert.equal(writes, 2);
});
