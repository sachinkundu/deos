#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { access, appendFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";

import {
  designCorrectionPrompt,
  runAuthorCompletionCheck,
  runBoundedAuthorCompletion,
  runDesignCompletionCheck,
} from "./author-completion.mjs";
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
const AUTHOR_COMPLETION_PATH = `${OUTPUT_ROOT}/author-completion.json`;
const MAXIMUM_AUTHOR_COMPLETION_REPAIRS = 2;

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

const resultOutcome = async () => {
  try {
    const result = JSON.parse(await readFile(RESULT_PATH, "utf8"));
    return typeof result.outcome === "string" ? result.outcome : null;
  } catch {
    return null;
  }
};

const codexArgs = (job, sessionId = null) => {
  const args = sessionId === null
    ? ["exec", "-"]
    : ["exec", "resume", sessionId, "-"];
  args.push(
    "--json",
    "--output-schema",
    job.resultSchemaPath,
    "--output-last-message",
    RESULT_PATH,
    "--dangerously-bypass-approvals-and-sandbox",
  );
  if (typeof job.model === "string" && job.model.length > 0) {
    args.push("--model", job.model);
  }
  if (typeof job.reasoning === "string" && job.reasoning.length > 0) {
    args.push("--config", `model_reasoning_effort=${JSON.stringify(job.reasoning)}`);
  }
  return args;
};

const sessionTracker = () => {
  let buffered = "";
  let sessionId = null;
  let conflict = false;
  const inspect = (line) => {
    try {
      const event = JSON.parse(line);
      if (event.type !== "thread.started" || typeof event.thread_id !== "string") return;
      if (sessionId !== null && sessionId !== event.thread_id) conflict = true;
      sessionId ??= event.thread_id;
    } catch {}
  };
  return {
    observe(chunk) {
      buffered += chunk.toString("utf8");
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      lines.forEach(inspect);
    },
    finish() {
      if (buffered.length > 0) inspect(buffered);
      buffered = "";
      if (conflict) throw new Error("author completion session identity changed");
      return sessionId;
    },
  };
};

const runChild = async ({ job, prompt, reviewer, resumeSessionId, transcript, validation, tracker, onPid }) => {
  const reviewerRunner = job.reviewKind === "design"
    ? "/deos/bin/design-review-runner.mjs"
    : "/deos/bin/trace-review-runner.mjs";
  const child = spawn(reviewer ? "node" : "codex", reviewer
    ? [reviewerRunner]
    : codexArgs(job, resumeSessionId), {
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
  await onPid(child.pid);
  if (!reviewer) child.stdout.on("data", (chunk) => tracker.observe(chunk));
  child.stdin.end(reviewer ? undefined : prompt);
  child.stdout.pipe(transcript.stream, { end: false });
  child.stderr.pipe(validation.stream, { end: false });
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  await Promise.all([finished(child.stdout), finished(child.stderr)]);
  return result;
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
  const reviewer = job.agentRole === "reviewer";
  const planningAuthor = job.agentRole === "author" &&
    typeof job.openspecChange === "string" &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(job.openspecChange);
  const designAuthor = planningAuthor && job.designOnly === true;
  const tracker = sessionTracker();
  let activePid = null;
  const heartbeat = async () => atomicJson(HEARTBEAT_PATH, {
    attemptId: job.attemptId,
    processPid: activePid,
    observedAt: new Date().toISOString(),
  });
  const heartbeatTimer = setInterval(() => void heartbeat(), 30_000);
  const deadlineTimer = setTimeout(() => {
    if (activePid === null) return;
    try {
      process.kill(-activePid, "SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        process.kill(-activePid, "SIGKILL");
      } catch {}
    }, 10_000).unref();
  }, Math.max(0, deadline - Date.now()));
  const run = async (childPrompt, resumeSessionId = null) => {
    if (Date.now() >= deadline) return { code: 124, signal: null };
    const result = await runChild({
      job,
      prompt: childPrompt,
      reviewer,
      resumeSessionId,
      transcript,
      validation,
      tracker,
      onPid: async (pid) => {
        activePid = pid;
        await heartbeat();
      },
    });
    activePid = null;
    await heartbeat();
    return result;
  };
  let result = await run(prompt);
  const completionRounds = [];
  let completionOutcome = reviewer ? "not_applicable" : "not_run";
  let safeErrorCategory;
  if (planningAuthor && result.code === 0 && await resultOutcome() === "completed") {
    const sessionId = tracker.finish();
    if (sessionId === null) throw new Error("author completion session identity is missing");
    const bounded = await runBoundedAuthorCompletion({
      initialCheck: await (designAuthor ? runDesignCompletionCheck : runAuthorCompletionCheck)({
        cwd: job.cwd,
        change: job.openspecChange,
      }),
      initialResult: { ...result, outcome: "completed" },
      sessionId,
      maximumRepairs: MAXIMUM_AUTHOR_COMPLETION_REPAIRS,
      resume: async ({ sessionId: exactSessionId, prompt: correctionPrompt }) => {
        const resumed = await run(correctionPrompt, exactSessionId);
        return { ...resumed, outcome: await resultOutcome() };
      },
      check: () => (designAuthor ? runDesignCompletionCheck : runAuthorCompletionCheck)({
        cwd: job.cwd,
        change: job.openspecChange,
      }),
      correctionPrompt: designAuthor ? designCorrectionPrompt : undefined,
    });
    result = bounded.result;
    const check = bounded.check;
    completionRounds.push(...bounded.rounds);
    if (tracker.finish() !== sessionId) {
      throw new Error("author completion resumed a different session");
    }
    if (Date.now() >= deadline && result.code === 0) result = { code: 124, signal: null };
    completionOutcome = check.ok ? "passed" : "failed";
    if (!check.ok && result.code === 0) {
      result = { code: 1, signal: null };
      safeErrorCategory = "author_completion_failed";
    }
    await atomicJson(AUTHOR_COMPLETION_PATH, {
      version: 1,
      attemptId: job.attemptId,
      change: job.openspecChange,
      sessionId,
      maximumRepairs: MAXIMUM_AUTHOR_COMPLETION_REPAIRS,
      repairCount: completionRounds.length - 1,
      outcome: completionOutcome,
      rounds: completionRounds,
    });
  } else if (planningAuthor) {
    await atomicJson(AUTHOR_COMPLETION_PATH, {
      version: 1,
      attemptId: job.attemptId,
      change: job.openspecChange,
      sessionId: tracker.finish(),
      maximumRepairs: MAXIMUM_AUTHOR_COMPLETION_REPAIRS,
      repairCount: 0,
      outcome: completionOutcome,
      rounds: completionRounds,
    });
  }
  transcript.stream.end();
  validation.stream.end();
  clearInterval(heartbeatTimer);
  clearTimeout(deadlineTimer);
  await transcript.finalize(TRANSCRIPT_PATH);
  await validation.finalize(VALIDATION_PATH, false);
  if (planningAuthor) {
    const finalRound = completionRounds.at(-1);
    const scoreLines = finalRound === undefined ? [] : Object.entries(finalRound.readabilityByFile)
      .map(([path, score]) =>
        `${path}: reading ease ${score.fleschReadingEase}; Flesch-Kincaid grade ${score.fleschKincaidGrade}`);
    await appendFile(
      VALIDATION_PATH,
      `\nTrusted author completion hook: ${completionOutcome}.\n${scoreLines.join("\n")}${scoreLines.length ? "\n" : ""}`,
      { mode: 0o600 },
    );
  }
  await finalizeMechanicalOutputs(job);
  const timedOut = Date.now() >= deadline && result.code !== 0;
  await atomicJson(STATUS_PATH, {
    attemptId: job.attemptId,
    runId: job.runId,
    nodeId: job.nodeId,
    exitCode: result.code,
    signal: result.signal,
    timedOut,
    ...(safeErrorCategory === undefined ? {} : { safeErrorCategory }),
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
