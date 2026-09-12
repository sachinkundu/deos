import { initializeBoundedReview } from "./bounded-self-review.mjs";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { createInterface } from "node:readline";

const EVENTS = ["PreToolUse", "SubagentStart", "SubagentStop", "Stop"];
const CONFIG = "/root/.codex/config.toml";
const COMMAND = "node /deos/bin/native-self-review.mjs hook";

// The parent trust bypass does not reach child sessions. Discover and trust the
// exact generated hooks through the pinned runtime's own config contract.
const trustGeneratedHooks = async (cwd, model, command = COMMAND) => {
  const child = spawn("codex", ["app-server"], {
    env: { PATH: process.env.PATH, HOME: "/root", CODEX_HOME: "/root/.codex" },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const lines = createInterface({ input: child.stdout });
  const iterator = lines[Symbol.asyncIterator]();
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  const rpc = async (id, method, params) => {
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    for (;;) {
      const line = await iterator.next();
      if (line.done) throw new Error("native hook discovery ended early");
      const response = JSON.parse(line.value);
      if (response.id !== id) continue;
      if (response.error) throw new Error(JSON.stringify(response.error));
      return response.result;
    }
  };
  try {
    await rpc(1, "initialize", { clientInfo: { name: "deos-native-review", version: "1" },
      capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    // The v2 messaging transport encrypts model-authored arguments. Hooks cannot
    // replace those with service-authored plaintext. Select the pinned native v1
    // tool contract through the supported catalog override, retaining all other
    // provider model metadata and the configured model identity.
    let cache;
    try { cache = JSON.parse(await readFile("/root/.codex/models_cache.json", "utf8")); } catch {}
    if (!cache?.models?.some((entry) => entry.slug === model)) {
      await rpc(3, "model/list", {});
      cache = JSON.parse(await readFile("/root/.codex/models_cache.json", "utf8"));
    }
    const profile = cache.models.find((entry) => entry.slug === model);
    if (!profile) throw new Error("configured native model metadata is unavailable");
    await writeFile("/root/.codex/deos-models.json", JSON.stringify({
      models: [{ ...profile, multi_agent_version: "v1" }],
    }), { mode: 0o600 });
    await writeFile(CONFIG, 'model_catalog_json = "/root/.codex/deos-models.json"\n' + await readFile(CONFIG, "utf8"));
    const result = await rpc(2, "hooks/list", { cwds: [cwd] });
    const entry = result.data?.[0];
    if (result.data?.length !== 1 || entry.errors.length || entry.warnings.length || entry.hooks.length !== EVENTS.length) {
      throw new Error(`native hook discovery mismatch: ${JSON.stringify({ errors: entry?.errors, warnings: entry?.warnings, count: entry?.hooks?.length })}`);
    }
    for (const hook of entry.hooks) {
      if (hook.command !== command || hook.sourcePath !== CONFIG || !EVENTS.some((event) => event.toLowerCase() === hook.eventName.toLowerCase())) {
        throw new Error(`unrecognized native hook configuration: ${JSON.stringify(hook)}`);
      }
      await appendFile(CONFIG, `\n[hooks.state.${JSON.stringify(hook.key)}]\ntrusted_hash = ${JSON.stringify(hook.currentHash)}\nenabled = true\n`);
    }
    await writeFile("/deos/native-review/hook-receipt.json", JSON.stringify(entry));
  } finally {
    clearTimeout(timer);
    lines.close();
    child.kill("SIGTERM");
  }
};

export const setupNativeReview = async (job) => {
  if (!job.nativeSelfReview) return;
  const phase = job.nativeSelfReview.phase;
  const bounded = job.nativeSelfReview.schema === "deos-bounded-review-v1";
  const command = bounded ? "node /deos/bin/bounded-self-review.mjs hook" : COMMAND;
  if (!["planning", "design"].includes(phase)) throw new Error("native phase is invalid");
  await mkdir("/deos/native-review", { recursive: true, mode: 0o700 });
  await writeFile("/deos/native-review/state.json", JSON.stringify({
    attemptId: job.attemptId, deadline: job.deadline, change: job.openspecChange, phase,
    authorPrompt: await readFile(job.promptPath, "utf8"), materializedContext: job.materializedContext,
    candidateSequence: 0, checkpointSequence: 0, completionRepairs: 0, stage: "writing",
  }), { mode: 0o600 });
  if (bounded) await initializeBoundedReview(job);
  await writeFile("/root/.codex/deos-reviewer.toml", [
    ...(job.grounding ? ['web_search = "live"'] : []),
    'name = "deos_reviewer"', 'description = "Fresh read-only OpenSpec reviewer"',
    'developer_instructions = "Review only the service-authored input. Never inspect parent sessions or private notes. Do not write files, call providers, or spawn children."',
    `model = ${JSON.stringify(job.model)}`, `model_reasoning_effort = ${JSON.stringify(job.reasoning)}`,
    'sandbox_mode = "read-only"', 'approval_policy = "never"',
    '[shell_environment_policy]', 'include_only = ["PATH", "HOME"]',
  ].join("\n") + "\n", { mode: 0o600 });
  await writeFile(CONFIG, [
    ...(job.grounding ? ['web_search = "live"'] : []),
    '[features]', 'multi_agent = true', 'multi_agent_v2 = false', 'hooks = true', 'apps = false', 'plugins = false', 'shell_snapshot = false',
    '[agents.deos_reviewer]', 'config_file = "deos-reviewer.toml"',
    'description = "Fresh read-only OpenSpec reviewer"',
    ...EVENTS.flatMap((event) => [`[[hooks.${event}]]`, 'matcher = ".*"',
      `[[hooks.${event}.hooks]]`, 'type = "command"', `command = ${JSON.stringify(command)}`, 'timeout = 86400']),
  ].join("\n") + "\n", { mode: 0o600 });
  await trustGeneratedHooks(job.cwd, job.model, command);
  for (const args of [
    ["chown", "-R", "deos-author:deos-author", job.cwd, "/deos/output"],
    ["chmod", "700", "/root/.codex", "/deos/native-review"],
    ["git", "config", "--global", "--add", "safe.directory", job.cwd],
  ]) {
    await new Promise((resolve, reject) => {
      const child = spawn(args[0], args.slice(1), { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("native filesystem ownership setup failed")));
    });
  }
};
