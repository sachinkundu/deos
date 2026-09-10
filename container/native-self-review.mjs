import { nativeReviewMessage } from "./native-review-packet.mjs";
import { readCommand } from "./native-review-read.mjs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readlink, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { runAuthorCompletionCheck, runDesignCompletionCheck } from "./author-completion.mjs";
import { parseCodexFinalMessage } from "./trace-review-proof.mjs";

const ROOT = "/deos/native-review";
const CWD = "/deos/workspace/repository";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const save = async (file, value) => {
  await writeFile(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${file}.tmp`, file);
};
const command = (argv, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(argv[0], argv.slice(1), { cwd: CWD, ...options, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data; });
  child.stderr.on("data", (data) => { stderr += data; });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve(stdout) : reject(new Error(`${argv[0]} exited ${code}: ${stderr}`)));
});

export const repositoryManifest = async () => {
  const listed = await command(["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const paths = [...new Set(listed.split("\0").filter(Boolean))].sort();
  const manifest = [];
  for (const relative of paths) {
    if (relative.startsWith("/") || relative.split("/").includes("..")) throw new Error("invalid tracked path");
    const file = path.join(CWD, relative);
    const stat = await lstat(file);
    if (!stat.isSymbolicLink() && !stat.isFile()) throw new Error("unsupported review file type");
    const bytes = stat.isSymbolicLink() ? Buffer.from(await readlink(file)) : await readFile(file);
    manifest.push({ path: relative, bytes: bytes.length, sha256: digest(bytes), type: stat.isSymbolicLink() ? "link" : "file" });
  }
  return manifest;
};

const checkpoint = async (state, kind, payload) => {
  const sequence = state.checkpointSequence++;
  const request = { version: 1, attemptId: state.attemptId, sequence, kind, candidateSequence: state.candidateSequence, ...payload };
  await save(`${ROOT}/state.json`, state);
  await save(`${ROOT}/request.json`, request);
  const expectedDigest = digest(JSON.stringify(request));
  while (Date.now() < Date.parse(state.deadline)) {
    try {
      const reply = await json(`${ROOT}/response.json`);
      if (reply.sequence === sequence && reply.requestSha256 === expectedDigest) {
        if (reply.error) throw new Error(reply.error);
        return reply;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("native review reached the parent attempt deadline");
};

const instruct = (state) => {
  const pending = state.pending;
  if (!pending) throw new Error("native review has no declared child input");
  if (pending.sessionId) return [
    "The trusted validator requests a proof correction from the same reviewer.",
    `Use the native follow-up tool for child ${pending.sessionId}; the hook will supply the exact correction input.`,
    "Await its result. Do not use repository tools while review is active.",
  ].join("\n");
  return [
    "The trusted completion check has prepared the next self-review input.",
    `Spawn a native child with agent_type=deos_reviewer, task_name=self_review_${state.candidateSequence}_${pending.index}, fork_turns=none.`,
    "Use message='Run the prepared review'. The trusted hook supplies the complete checked review context and schema.",
    "Await the child. Do not read, edit, run repository commands, or send your own context to it.",
  ].join("\n");
};

const runAdapter = async (state) => {
  const directory = `${ROOT}/candidate-${state.candidateSequence}`;
  await rm(`${directory}/next.json`, { force: true });
  await command(["node", state.phase === "design" ? "/deos/bin/design-review-runner.mjs" : "/deos/bin/trace-review-runner.mjs"], {
    env: { PATH: process.env.PATH, HOME: "/root", DEOS_JOB_PATH: `${directory}/job.json`,
      DEOS_NATIVE_REVIEW_ROOT: directory, DEOS_REVIEW_OUTPUT_ROOT: `${directory}/output` },
  });
  try {
    state.pending = await json(`${directory}/next.json`);
    state.stage = "review";
    await save(`${ROOT}/state.json`, state);
    return { decision: "block", reason: instruct(state) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const reply = await checkpoint(state, "review_completed", { outputRoot: `${directory}/output` });
  state.pending = null;
  state.activeChild = null;
  if (reply.action === "repair") {
    state.stage = "writing";
    state.completionRepairs = 0;
    state.materializedContext = reply.materializedContext;
    await save(`${ROOT}/state.json`, state);
    return { decision: "block", reason: [
      "The existing review reducer requests an author repair. Continue in this same session.",
      state.authorPrompt, "Current service-authored input:", reply.materializedContext,
      "Write required review dispositions and replies, rerun deterministic checks, and finish to request a fresh self-check.",
    ].join("\n\n") };
  }
  if (reply.action !== "stop") throw new Error("invalid native semantic stop");
  state.stage = "done";
  state.acceptedManifest = await repositoryManifest();
  await save(`${ROOT}/state.json`, state);
  return { decision: "block", reason: "The trusted self-review loop is complete and its proof is durable. Make no more repository changes. Return the required completed author JSON result." };
};

const startCandidate = async (state) => {
  const check = await (state.phase === "design" ? runDesignCompletionCheck : runAuthorCompletionCheck)({ cwd: CWD, change: state.change });
  if (!check.ok) {
    if (state.completionRepairs++ >= 2) throw new Error("author completion repair limit reached");
    await save(`${ROOT}/state.json`, state);
    return { decision: "block", reason: `The deterministic author completion check failed. Fix only the reported problems:\n${JSON.stringify(check)}` };
  }
  state.candidateSequence++;
  state.stage = "preparing";
  const response = await checkpoint(state, "candidate", { materializedContext: state.materializedContext });
  if (response.action === "stop") {
    state.stage = "done";
    state.acceptedManifest = await repositoryManifest();
    await save(`${ROOT}/state.json`, state);
    return { decision: "block", reason: "The existing review policy reached its allowed stop. Proof is durable. Do not change files; return the required completed author JSON result." };
  }
  if (response.action !== "review" || !response.reviewJob) throw new Error("native review job is missing");
  state.materializedContext = response.authorContext;
  state.reviewJob = response.reviewJob;
  const directory = `${ROOT}/candidate-${state.candidateSequence}`;
  await mkdir(`${directory}/output`, { recursive: true });
  await save(`${directory}/job.json`, response.reviewJob);
  await writeFile(`${directory}/prompt.md`, response.reviewJob.prompt);
  await save(`${directory}/judgments.json`, []);
  for (const [name, text] of [["transcript.jsonl", ""], ["patch.diff", ""], ["validation.txt", ""], ["provider-references.json", "[]"]]) {
    await writeFile(`${directory}/output/${name}`, text);
  }
  return runAdapter(state);
};

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });
const executeHook = async (event) => {
  const state = await json(`${ROOT}/state.json`);
  if (Date.now() >= Date.parse(state.deadline)) throw new Error("native review attempt expired");
  const child = event.agent_type === "deos_reviewer";
  if (event.hook_event_name === "PreToolUse" && child) {
    if (event.agent_id !== state.activeChild) throw new Error("unknown native reviewer child");
    if (event.tool_name === "Bash") {
      try {
        const input = event.tool_input;
        const parsed = readCommand(input.command ?? input.cmd);
        const command = `node /deos/bin/native-review-read.mjs ${Buffer.from(JSON.stringify(parsed)).toString("base64url")}`;
        return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
          updatedInput: { ...input, ...(input.command === undefined ? { cmd: command } : { command }),
            cwd: CWD } } };
      } catch (error) {
        state.fault = `forbidden reviewer command: ${String(error)}`;
        await save(`${ROOT}/state.json`, state);
        return deny(state.fault);
      }
    }
    // Only the bounded snapshot reader is exposed through the native shell tool.
    state.fault = `forbidden reviewer tool: ${event.tool_name}`;
    await save(`${ROOT}/state.json`, state);
    return deny(state.fault);
  }
  if (event.hook_event_name === "PreToolUse" && !child) {
    const name = event.tool_name;
    const spawnChild = name.endsWith("spawn_agent");
    const followup = name.endsWith("followup_task") || name.endsWith("send_input");
    if (spawnChild || followup) {
      if (state.stage !== "review" || !state.pending || state.activeChild) return deny("No native review session is ready");
      if (spawnChild === Boolean(state.pending.sessionId)) return deny("The review requires a different native child operation");
      state.before = await repositoryManifest();
      const payload = {
        ...state.pending, profile: "deos_reviewer", candidateSequence: state.candidateSequence,
        context: state.reviewJob.materializedContext, beforeManifest: state.before,
      };
      const reply = await checkpoint(state, "session_allocate", { launch: payload });
      if (reply.action !== "launch") throw new Error("native session was not allocated");
      state.sessionKey = reply.sessionKey;
      state.launch = payload;
      state.stage = "launching";
      const message = nativeReviewMessage(payload);
      const updatedInput = spawnChild ? {
        task_name: `self_review_${state.candidateSequence}_${payload.index}`, agent_type: "deos_reviewer", fork_turns: "none", message,
      } : { target: payload.sessionId, message };
      if (followup) { state.activeChild = payload.sessionId; state.stage = "active"; }
      state.effectiveInput = updatedInput;
      await save(`${ROOT}/state.json`, state);
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput } };
    }
    if (state.stage !== "writing" && !name.endsWith("wait_agent") && !name.endsWith("list_agents")) {
      return deny("Author tools are paused until checked review and durable proof complete");
    }
    if (name === "Bash" && state.stage === "writing") {
      const input = event.tool_input;
      const requested = input.command ?? input.cmd;
      if (typeof requested !== "string") return deny("Author shell command is missing");
      const quoted = "'" + requested.replaceAll("'", "'\\''") + "'";
      const command = `runuser -u deos-author -- env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/deos-author bash -c ${quoted}`;
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow",
        updatedInput: { ...input, ...(input.command === undefined ? { cmd: command } : { command }) } } };
    }
    if (name.endsWith("wait_agent") || name.endsWith("list_agents") || name.endsWith("update_plan")) return {};
    return deny("Use the shell tool to read or edit repository files. Trusted review control files are outside the author account.");
  }
  if (event.hook_event_name === "SubagentStart") {
    if (!child || state.stage !== "launching" || state.activeChild || event.model !== state.reviewJob.model) {
      throw new Error("native reviewer launch profile mismatch");
    }
    state.activeChild = event.agent_id;
    state.stage = "active";
    state.startReceipt = event;
    await checkpoint(state, "session_started", { sessionKey: state.sessionKey, subagentId: event.agent_id, receipt: event });
    await save(`${ROOT}/state.json`, state);
    return {};
  }
  if (event.hook_event_name === "SubagentStop") {
    if (!child || state.stage !== "active" || state.activeChild !== event.agent_id) throw new Error("native child completion identity mismatch");
    const after = await repositoryManifest();
    if (JSON.stringify(after) !== JSON.stringify(state.before)) state.fault = "review changed tracked files";
    const transcript = event.agent_transcript_path ? await readFile(event.agent_transcript_path, "utf8") : null;
    if (!transcript) state.fault = "native child transcript is missing";
    const boundedTranscript = transcript?.split("\n").filter(Boolean).map((line) => JSON.parse(line)).filter((item) =>
      item.type === "session_meta" || item.type === "turn_context" ||
      (item.type === "response_item" && ["function_call", "custom_tool_call", "function_call_output", "custom_tool_call_output"].includes(item.payload?.type)));
    const result = parseCodexFinalMessage(event.last_assistant_message ?? "");
    const proof = {
      version: 1, sessionKey: state.sessionKey, authorAttemptId: state.attemptId, subagentId: event.agent_id,
      launch: state.launch, effectiveInput: state.effectiveInput, startReceipt: state.startReceipt,
      completionReceipt: { agent_id: event.agent_id, agent_type: event.agent_type, model: event.model },
      beforeManifest: state.before, afterManifest: after, transcript: boundedTranscript, result, fault: state.fault ?? null,
    };
    await checkpoint(state, "session_completed", { sessionKey: state.sessionKey, proof });
    if (state.fault) throw new Error(state.fault);
    const directory = `${ROOT}/candidate-${state.candidateSequence}`;
    const judgments = await json(`${directory}/judgments.json`);
    judgments.push({ inputSha256: state.pending.inputSha256, subagentId: event.agent_id, result });
    await save(`${directory}/judgments.json`, judgments);
    await writeFile(`${directory}/output/transcript.jsonl`, `${JSON.stringify(proof)}\n`, { flag: "a" });
    state.activeChild = null;
    state.stage = "received";
    await save(`${ROOT}/state.json`, state);
    return {};
  }
  if (!child && event.hook_event_name === "Stop") {
    if (state.stage === "done") {
      if (JSON.stringify(await repositoryManifest()) !== JSON.stringify(state.acceptedManifest)) throw new Error("author changed the accepted candidate");
      return {};
    }
    if (state.stage === "writing") return startCandidate(state);
    if (state.stage === "received") return runAdapter(state);
    if (state.stage === "review") return { decision: "block", reason: instruct(state) };
    return { decision: "block", reason: "Await the active native reviewer before finishing." };
  }
  return {};
};

export const nativeReviewHook = async () => {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  try {
    const result = await executeHook(JSON.parse(input));
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    await save(`${ROOT}/fault.json`, { message: String(error), at: new Date().toISOString() });
    // A hook execution error normally fails open in Codex. Return an explicit
    // deny/stop instead, and leave durable acceptance to the Worker.
    const event = JSON.parse(input);
    process.stdout.write(JSON.stringify(event.hook_event_name === "PreToolUse"
      ? deny(String(error)) : { continue: false, stopReason: String(error) }));
  }
};

if (process.argv[2] === "hook") await nativeReviewHook();
