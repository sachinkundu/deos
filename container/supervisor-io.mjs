import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { finished } from "node:stream/promises";
import { recordCaughtError } from "./original-errors.mjs";

export const atomicJson = async (path, value) => {
  // A timer and a child lifecycle update can overlap at the same destination.
  // Each writer must own its temporary file until its rename completes.
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporary, path);
};

const trustedCapture = async (name, tempRoot) => {
  const root = await mkdtemp(join(tempRoot, `deos-${name}-`));
  const path = join(root, name);
  return {
    stream: createWriteStream(path, { flags: "wx", mode: 0o600 }),
    async finalize(destination, replace = true) {
      await finished(this.stream);
      let shouldWrite = replace;
      if (!replace) {
        try { await access(destination); }
        catch (error) {
          if (error.code !== "ENOENT") throw error;
          shouldWrite = true;
        }
      }
      if (shouldWrite) {
        const temporary = `${destination}.${randomUUID()}.tmp`;
        await writeFile(temporary, await readFile(path), { mode: 0o600, flag: "wx" });
        await rename(temporary, destination);
      }
      await rm(root, { recursive: true, force: true });
    },
  };
};

export const captureSupervisorStreams = async (tempRoot = "/tmp") => ({
  transcript: await trustedCapture("transcript.jsonl", tempRoot),
  validation: await trustedCapture("stderr.txt", tempRoot),
});

export const recordHeartbeat = (write, recordError = recordCaughtError) =>
  write().catch(error => recordError(error, "supervisor heartbeat"));
