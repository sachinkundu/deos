#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";

import { captureRepositoryPatch } from "./patch-capture.mjs";

const RUN_ROOT = "/deos/run";
const OUTPUT_ROOT = "/deos/output";
const JOB_PATH = `${RUN_ROOT}/job.json`;
const HEARTBEAT_PATH = `${OUTPUT_ROOT}/heartbeat.json`;
const STATUS_PATH = `${OUTPUT_ROOT}/status.json`;
const TRANSCRIPT_PATH = `${OUTPUT_ROOT}/transcript.jsonl`;
const RESULT_PATH = `${OUTPUT_ROOT}/result.json`;
const VALIDATION_PATH = `${OUTPUT_ROOT}/validation.txt`;
const PATCH_PATH = `${OUTPUT_ROOT}/patch.diff`;
const PROVIDER_REFERENCES_LOG_PATH = `${OUTPUT_ROOT}/provider-references.jsonl`;
const PROVIDER_REFERENCES_PATH = `${OUTPUT_ROOT}/provider-references.json`;

const atomicJson = async (path, value) => {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  await rename(temporary, path);
};

const trustedCapture = async (name) => {
  const root = await mkdtemp(`/tmp/deos-${name}-`);
  const path = `${root}/${name}`;
  return {
    stream: createWriteStream(path, { flags: "wx", mode: 0o600 }),
    async finalize(destination, replace = true) {
      await finished(this.stream);
      let shouldWrite = replace;
      if (!replace) {
        try {
          await access(destination);
        } catch {
          shouldWrite = true;
        }
      }
      if (shouldWrite) {
        const temporary = `${destination}.tmp`;
        await writeFile(temporary, await readFile(path), { mode: 0o600 });
        await rename(temporary, destination);
      }
      await rm(root, { recursive: true, force: true });
    },
  };
};

const finalizeMechanicalOutputs = async (job) => {
  await writeFile(
    PATCH_PATH,
    await captureRepositoryPatch(job.cwd),
    { mode: 0o600 },
  );
  let references = [];
  try {
    const lines = (await readFile(PROVIDER_REFERENCES_LOG_PATH, "utf8"))
      .split("\n")
      .filter(Boolean);
    references = lines.map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await atomicJson(PROVIDER_REFERENCES_PATH, references);
};

const main = async () => {
  await mkdir(OUTPUT_ROOT, { recursive: true, mode: 0o700 });
  const job = JSON.parse(await readFile(JOB_PATH, "utf8"));
  const required = ["attemptId", "runId", "nodeId", "cwd", "promptPath", "resultSchemaPath", "deadline"];
  if (required.some((key) => typeof job[key] !== "string" || job[key].length === 0)) {
    throw new Error("job specification is incomplete");
  }
  const deadline = Date.parse(job.deadline);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("job deadline is invalid");
  const prompt = await readFile(job.promptPath, "utf8");
  const transcript = await trustedCapture("transcript.jsonl");
  const validation = await trustedCapture("stderr.txt");
  const args = [
    "exec",
    "-",
    "--json",
    "--output-schema",
    job.resultSchemaPath,
    "--output-last-message",
    RESULT_PATH,
    "--dangerously-bypass-approvals-and-sandbox",
  ];
  const child = spawn("codex", args, {
    cwd: job.cwd,
    env: {
      PATH: process.env.PATH,
      HOME: "/root",
      CODEX_HOME: "/root/.codex",
      DEOS_CAPABILITY_URL: String(job.capabilityUrl ?? ""),
      DEOS_CAPABILITY_TOKEN: String(job.capabilityToken ?? ""),
      DEOS_ATTEMPT_ID: job.attemptId,
      DEOS_RUN_ID: job.runId,
    },
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stdin.end(prompt);
  child.stdout.pipe(transcript.stream);
  child.stderr.pipe(validation.stream);
  const heartbeat = async () => atomicJson(HEARTBEAT_PATH, {
    attemptId: job.attemptId,
    processPid: child.pid,
    observedAt: new Date().toISOString(),
  });
  await heartbeat();
  const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
  const deadlineTimer = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {}
    }, 10_000).unref();
  }, Math.max(0, deadline - Date.now()));
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  clearInterval(heartbeatTimer);
  clearTimeout(deadlineTimer);
  await transcript.finalize(TRANSCRIPT_PATH);
  await validation.finalize(VALIDATION_PATH, false);
  await finalizeMechanicalOutputs(job);
  const timedOut = Date.now() >= deadline && result.code !== 0;
  await atomicJson(STATUS_PATH, {
    attemptId: job.attemptId,
    runId: job.runId,
    nodeId: job.nodeId,
    exitCode: result.code,
    signal: result.signal,
    timedOut,
    completedAt: new Date().toISOString(),
  });
  process.exitCode = result.code ?? (timedOut ? 124 : 1);
};

main().catch(async () => {
  try {
    await mkdir(OUTPUT_ROOT, { recursive: true, mode: 0o700 });
    await atomicJson(STATUS_PATH, {
      exitCode: null,
      signal: null,
      timedOut: false,
      safeErrorCategory: "supervisor_failed",
      completedAt: new Date().toISOString(),
    });
  } finally {
    process.exitCode = 1;
  }
});
