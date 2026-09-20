import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
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
    async read() {
      // Drain queued writes before reading a still-open private capture.
      await new Promise((resolve, reject) => this.stream.write("", error => error ? reject(error) : resolve()));
      return readFile(path, "utf8");
    },
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

// The controller stops the process before failure collection. Its private
// stream file may not yet have been finalized into the artifact directory.
export const preserveInterruptedTranscript = async (tempRoot = "/tmp", outputRoot = "/deos/output") => {
  const names = (await readdir(tempRoot)).filter(name => /^deos-transcript\.jsonl-[A-Za-z0-9]+$/.test(name));
  const destination = join(outputRoot, "transcript.jsonl");
  if (!names.length) {
    await access(destination); // A completed supervisor already finalized it.
    return;
  }
  if (names.length !== 1) throw new Error("Ambiguous interrupted supervisor transcript");
  const root = join(tempRoot, names[0]);
  const source = join(root, "transcript.jsonl");
  if (!(await lstat(root)).isDirectory() || !(await lstat(source)).isFile())
    throw new Error("Invalid interrupted supervisor transcript path");
  const temporary = `${destination}.${randomUUID()}.tmp`;
  await writeFile(temporary, await readFile(source), { mode: 0o600, flag: "wx" });
  await rename(temporary, destination);
};

export const recordHeartbeat = (write, recordError = recordCaughtError) =>
  write().catch(error => recordError(error, "supervisor heartbeat"));
