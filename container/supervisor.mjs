#!/usr/bin/env node
import { setupImplementation } from "./implementation-runtime.mjs";
import { runImplementationCompletion } from "./implementation-completion.mjs";
import { implementationProcessFailure } from "./implementation-process-failure.mjs";
import { checkAuthorSources } from "./grounded-review.mjs";
import { provisionGrounding, verifyGroundingContext, verifyNativeGrounding } from "./grounded-agent.mjs";
import { setupNativeReview } from "./native-review-setup.mjs";
import { originalErrorText, recordCaughtError } from "./original-errors.mjs";
import { notifyAttemptCompletion } from "./attempt-completion.mjs";
import { appendFile, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { finished } from "node:stream/promises";
import { atomicJson, captureSupervisorStreams, recordHeartbeat } from "./supervisor-io.mjs";

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
let completionJob = null;
let heartbeatTimer;
let deadlineTimer;

const finalizeMechanicalOutputs = async (job) => {
  // Implementation owns a matched candidate/patch snapshot. Never overwrite its
  // verified patch with a later repository capture during mechanical cleanup.
  if (!job.implementationKind) await writeFile(
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
    recordCaughtError(error, "container/supervisor.mjs:72");
    if (error?.code !== "ENOENT") throw error;
  }
  await atomicJson(PROVIDER_REFERENCES_PATH, references);
};

const resultOutcome = async () => {
  try {
    const result = JSON.parse(await readFile(RESULT_PATH, "utf8"));
    return typeof result.outcome === "string" ? result.outcome : null;
  } catch (caughtError) {
    recordCaughtError(caughtError, "container/supervisor.mjs:82");
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
  if (job.grounding) args.push("--config", 'web_search="live"');
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
    } catch (caughtError) {
      recordCaughtError(caughtError, "container/supervisor.mjs:118");}
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
  const reviewerRunner = ['demo_plan', 'demo_gate'].includes(job.reviewKind) ? '/deos/bin/implementation-demo-runner.mjs' : job.reviewKind === "design"
    ? "/deos/bin/design-review-runner.mjs"
    : "/deos/bin/trace-review-runner.mjs";
  const child = spawn(reviewer ? "node" : "codex", reviewer
    ? [...(['demo_plan', 'demo_gate'].includes(job.reviewKind) ? ['--experimental-strip-types'] : []), reviewerRunner]
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

let implementationRuntime = null;
const main = async () => {
  await mkdir(OUTPUT_ROOT, { recursive: true, mode: 0o700 });
  const job = JSON.parse(await readFile(JOB_PATH, "utf8"));
  completionJob = job;
  const required = ["attemptId", "runId", "nodeId", "cwd", "promptPath", "resultSchemaPath", "deadline"];
  if (required.some((key) => typeof job[key] !== "string" || job[key].length === 0)) {
    throw new Error("job specification is incomplete");
  }
  const deadline = Date.parse(job.deadline);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("job deadline is invalid");
  const prompt = await readFile(job.promptPath, "utf8");
  const grounding = await provisionGrounding(job.grounding);
  await setupNativeReview(job);
  const implementation = implementationRuntime = await setupImplementation(job);
  if (grounding) {
    const effective = job.modelProvider === "claude" ? grounding : await verifyNativeGrounding(grounding, job.cwd);
    await atomicJson(`${OUTPUT_ROOT}/agent-input-manifest.json`, { ...effective, attemptId: job.attemptId, jobKind: job.nodeId,
      contextFiles: verifyGroundingContext(job.materializedContext, job.grounding) });
  }
  const { transcript, validation } = await captureSupervisorStreams();
  const reviewer = job.agentRole === "reviewer";
  const planningAuthor = !job.implementationKind && job.agentRole === "author" &&
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
  heartbeatTimer = setInterval(() => void recordHeartbeat(heartbeat), 30_000);
  deadlineTimer = setTimeout(() => {
    if (activePid === null) return;
    try {
      process.kill(-activePid, "SIGTERM");
    } catch (caughtError) {
      recordCaughtError(caughtError, "container/supervisor.mjs:198");}
    setTimeout(() => {
      try {
        process.kill(-activePid, "SIGKILL");
      } catch (caughtError) {
        recordCaughtError(caughtError, "container/supervisor.mjs:202");}
    }, 10_000).unref();
  }, Math.max(0, deadline - Date.now()));
  const run = async (childPrompt, resumeSessionId = null) => {
    if (Date.now() >= deadline) return { code: 124, signal: null };
    if (resumeSessionId !== null) await rm(RESULT_PATH, { force: true });
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
  const authorCheck = async () => {
    const needsDispositions = designAuthor && job.requiredOutputs?.includes('design-dispositions.json');
    const context = needsDispositions ? JSON.parse(job.materializedContext) : null;
    const options = { cwd: job.cwd, change: job.openspecChange,
      reviewRepliesPath: designAuthor ? `${OUTPUT_ROOT}/review-replies.json` : undefined,
      reviewDispositionsPath: needsDispositions ? `${OUTPUT_ROOT}/design-dispositions.json` : undefined,
      expectedDispositionIds: (context?.designReviewFeedback?.findings ?? []).map(finding => finding.id),
    };
    const check = await (designAuthor ? runDesignCompletionCheck : runAuthorCompletionCheck)(options);
    return job.grounding ? checkAuthorSources(check, options) : check;
  };
  let result = await run(prompt);
  let implementationAccepted = false;
  if (implementation) {
    const sessionId = tracker.finish();
    const completion = await runImplementationCompletion({
      result, outcome: result.code === 0 ? await resultOutcome() : null, sessionId, deadline,
      feedbackRoot: "/deos/implementation/completion",
      journal: "/deos/output/implementation-diagnostics.jsonl",
      check: () => implementation.verify(),
      resume: async ({ sessionId: exactSessionId, prompt: correctionPrompt }) => {
        const resumed = await run(correctionPrompt, exactSessionId);
        if (tracker.finish() !== sessionId) throw new Error("Implementation verification resumed a different session");
        return { ...resumed, outcome: resumed.code === 0 ? await resultOutcome() : null };
      },
    });
    result = completion.result;
    implementationAccepted = completion.accepted;
  }
  const completionRounds = [];
  let completionOutcome = reviewer ? "not_applicable" : "not_run";
  let safeErrorCategory;
  if (planningAuthor && result.code === 0 && await resultOutcome() === "completed") {
    const sessionId = tracker.finish();
    if (sessionId === null) throw new Error("author completion session identity is missing");
    const bounded = await runBoundedAuthorCompletion({
      initialCheck: await authorCheck(),
      initialResult: { ...result, outcome: "completed" },
      sessionId,
      maximumRepairs: MAXIMUM_AUTHOR_COMPLETION_REPAIRS,
      resume: async ({ sessionId: exactSessionId, prompt: correctionPrompt }) => {
        const resumed = await run(correctionPrompt, exactSessionId);
        return { ...resumed, outcome: await resultOutcome() };
      },
      check: authorCheck,
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
  if (implementation) {
    // A failed model turn may never write result.json. Preserve that original
    // process failure rather than replacing it with a completion-file error.
    const failure = implementationProcessFailure(result,
      await readFile(TRANSCRIPT_PATH, "utf8"), await readFile(VALIDATION_PATH, "utf8"));
    if (failure) throw failure;
    // A finish error must reach the fatal diagnostic handler before cleanup.
    // The outer finally still closes the runtime if finish or close fails.
    if (!implementationAccepted) await implementation.finish();
    await implementation.close();
    implementationRuntime = null;
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

main().catch(async (error) => {
  recordCaughtError(error, "supervisor fatal");
  try {
    await mkdir(OUTPUT_ROOT, { recursive: true, mode: 0o700 });
    await atomicJson(STATUS_PATH, {
      exitCode: error.exitCode ?? null,
      signal: error.signal ?? null,
      timedOut: false,
      safeErrorCategory: error.safeErrorCategory ?? "supervisor_failed",
      originalError: { message: String(error), stack: error?.stack, cause: error?.cause ? originalErrorText(error.cause) : null },
      completedAt: new Date().toISOString(),
    });
  } finally {
    process.exitCode = 1;
  }
}).finally(async () => {
  if(implementationRuntime) { try { await implementationRuntime.close(); } catch(error) { recordCaughtError(error,"implementation cleanup");process.exitCode=1; } }
  clearInterval(heartbeatTimer);
  clearTimeout(deadlineTimer);
  if (completionJob !== null) await notifyAttemptCompletion(completionJob);
});
