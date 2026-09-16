import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  readFile,
  writeFile,
  mkdir,
  mkdtemp,
  rm,
  chmod,
  open,
  realpath,
  rename,
  appendFile,
} from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";
import { verifyNativeGrounding } from "./grounded-agent.mjs";
import { trustGeneratedHooks } from "./native-review-setup.mjs";
import { originalErrorText } from "./original-errors.mjs";
import { killProcessGroup, stopProcessGroup } from "./implementation-process.mjs";
import { collectBrowserDemo, beginBrowserDemo, finishBrowserDemo, implementationToolQueue } from "./implementation-browser-demo.mjs";

const ROOT = "/deos/implementation";
const sha = (data) => createHash("sha256").update(data).digest("hex");
const shellQuote = (text) => "'" + text.replaceAll("'", "'\\''") + "'";
export async function command(argv, cwd, options = {}) {
  options.signal?.throwIfAborted();
  return new Promise((resolveResult, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      env: options.env ?? { PATH: process.env.PATH, HOME: "/root" },
      detached: true,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
    const stdout = [];
    const stderr = [];
    let size = 0;
    let failure;
    const cancel = () => {
      if (failure) return;
      failure = new Error(`Command canceled: ${argv[0]}`, { cause: options.signal.reason });
      killProcessGroup(child, "SIGKILL");
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      failure = new Error(`Command timed out: ${argv[0]}`);
      killProcessGroup(child, "SIGKILL");
    }, options.timeout ?? 600_000);
    const read = (into) => (data) => {
      size += data.length;
      if (size > (options.maxOutputBytes ?? 10 * 1024 * 1024)) {
        failure = new Error(
          `Command output exceeds ${options.maxOutputBytes ?? 10 * 1024 * 1024} bytes: ${argv[0]}`,
        );
        killProcessGroup(child, "SIGKILL");
      } else into.push(data);
    };
    child.stdout.on("data", read(stdout));
    child.stderr.on("data", read(stderr));
    child.once("error", (error) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
      const result = {
        command: argv.map(shellQuote).join(" "),
        exitCode: code,
        signal,
        stdout: Buffer.concat(stdout).toString(),
        stderr: Buffer.concat(stderr).toString(),
      };
      if (failure) reject(Object.assign(failure, { result }));
      else resolveResult(result);
    });
  });
}
export async function responseCommand(response, argv, cwd, options = {}) {
  const controller = new AbortController();
  const disconnect = () => {
    if (!response.writableEnded)
      controller.abort(new Error("Implementation command client closed before its result"));
  };
  response.once("close", disconnect);
  if (response.destroyed) disconnect();
  try {
    return await command(argv, cwd, { ...options, signal: controller.signal });
  } finally {
    response.off("close", disconnect);
  }
}
async function checked(argv, cwd, env) {
  const result = await command(argv, cwd, { env });
  if (result.exitCode !== 0)
    throw Object.assign(
      new Error(
        `Command failed (${result.exitCode}): ${result.command}\n${result.stderr}`,
      ),
      { result },
    );
  return result.stdout;
}
export async function snapshot(cwd) {
  const index = await mkdtemp(join(tmpdir(), "deos-implementation-index-"));
  const env = {
    PATH: process.env.PATH,
    HOME: "/root",
    GIT_INDEX_FILE: join(index, "index"),
  };
  try {
    const base = (await checked(["git", "rev-parse", "HEAD"], cwd, env)).trim();
    await checked(["git", "read-tree", "HEAD"], cwd, env);
    await checked(
      [
        "git",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.hooksPath=/dev/null",
        "add",
        "-A",
        "--",
      ],
      cwd,
      env,
    );
    const treeSha = (await checked(["git", "write-tree"], cwd, env)).trim();
    const names = (
      await checked(
        [
          "git",
          "diff",
          "--cached",
          "--name-only",
          "--no-renames",
          "-z",
          "HEAD",
        ],
        cwd,
        env,
      )
    )
      .split("\0")
      .filter(Boolean);
    const files = [];
    for (const path of names) {
      const entry = (
        await checked(
          ["git", "ls-files", "--stage", "-z", "--", path],
          cwd,
          env,
        )
      )
        .split("\0")
        .filter(Boolean)[0];
      if (!entry) {
        files.push({ path, mode: "100644", sha: null, contentBase64: null });
        continue;
      }
      const match = /^(100644|100755) ([a-f0-9]{40}) 0\t/.exec(entry);
      if (!match) throw new Error(`Unsupported candidate mode: ${entry}`);
      const content = await readFile(join(cwd, path));
      const blobSha = createHash("sha1")
        .update(`blob ${content.byteLength}\0`)
        .update(content)
        .digest("hex");
      if (blobSha !== match[2])
        throw new Error(`Candidate changed during snapshot: ${path}`);
      files.push({
        path,
        mode: match[1],
        sha: blobSha,
        contentBase64: content.toString("base64"),
      });
    }
    const patch = await checked(
      ["git", "diff", "--cached", "--binary", "--no-ext-diff", "HEAD", "--"],
      cwd,
      env,
    );
    return {
      testedBaseSha: base,
      treeSha,
      files,
      patch: patch || "# No repository changes in this attempt.\n",
    };
  } finally {
    await rm(index, { recursive: true, force: true });
  }
}
export function localConfig(request, attemptId) {
  const safe = (value) =>
    typeof value === "string" &&
    value.length &&
    !value.startsWith("/") &&
    !value.split("/").includes("..") &&
    !value.includes("\\");
  if (request.main !== undefined && !safe(request.main))
    throw new Error("Preview entrypoint must be repository relative");
  if (request.assets !== undefined && !safe(request.assets))
    throw new Error("Preview assets must be repository relative");
  if (request.assets && (request.assets.split("/").every(part => !part || part === ".") ||
    request.assets.split("/").includes("node_modules")))
    throw new Error("Preview assets must be a dedicated built-assets directory, not the repository root or node_modules");
  if (!request.main && !request.assets)
    throw new Error("Preview needs a Worker entrypoint or built assets");
  if (
    Object.keys(request).some(
      (key) => !["action", "main", "assets", "d1", "r2"].includes(key),
    )
  )
    throw new Error("Preview request contains unsupported configuration");
  const bindings = (key) =>
    (request[key] ?? []).map((name) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name))
        throw new Error("Invalid local binding name");
      return name;
    });
  return {
    name: `deos-test-${attemptId}`,
    compatibility_date: "2026-08-27",
    compatibility_flags: ["nodejs_compat"],
    ...(request.main
      ? { main: resolve("/deos/workspace/repository", request.main) }
      : {}),
    ...(request.assets
      ? {
          assets: {
            directory: resolve("/deos/workspace/repository", request.assets),
          },
        }
      : {}),
    d1_databases: bindings("d1").map((name) => ({
      binding: name,
      database_name: `test-${attemptId}-${name}`,
      database_id: `local-${attemptId}-${name}`,
    })),
    r2_buckets: bindings("r2").map((name) => ({
      binding: name,
      bucket_name: `test-${attemptId}-${name.toLowerCase()}`,
    })),
    observability: { enabled: false },
    send_metrics: false,
  };
}
export async function readRegularFile(path, root) {
  const resolved = await realpath(path);
  const within = relative(await realpath(root), resolved);
  if (within.startsWith("..") || within.startsWith("/"))
    throw new Error(`Output escaped its assigned directory: ${path}`);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > 20 * 1024 * 1024)
      throw new Error(`Output must be a bounded regular file: ${path}`);
    return await file.readFile("utf8");
  } finally {
    await file.close();
  }
}
export function recordCheck(checks, result, subject) {
  return [...checks.filter(check => check.command !== result.command || check.cwd !== result.cwd),
    { ...result, treeSha: subject.treeSha, testedBaseSha: subject.testedBaseSha }];
}
class CompletionOutputError extends Error {
  constructor(path, cause) {
    super(`Missing or invalid JSON output at ${path}: ${cause.message}`, { cause });
    this.code = "completion_output_invalid";
  }
}
async function completionJson(path) {
  try { return JSON.parse(await readRegularFile(path, "/deos/output")); }
  catch (cause) {
    if (cause.code === "ENOENT" || cause instanceof SyntaxError) throw new CompletionOutputError(path, cause);
    throw cause;
  }
}
export async function setupImplementation(job) {
  if (!job.implementationKind) return null;
  await mkdir(ROOT, { recursive: true, mode: 0o700 });
  const config = "/root/.codex/config.toml";
  const hook = "node /deos/bin/implementation-hook.mjs";
  await writeFile(
    config,
    [
      'web_search = "live"',
      "[features]",
      "hooks = true",
      "apps = false",
      "plugins = false",
      "shell_snapshot = false",
      "multi_agent = false",
      ...["PreToolUse", "SubagentStart", "SubagentStop", "Stop"].flatMap(
        (event) => [
          `[[hooks.${event}]]`,
          'matcher = ".*"',
          `[[hooks.${event}.hooks]]`,
          'type = "command"',
          `command = "${hook}"`,
          "timeout = 600",
        ],
      ),
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  await trustGeneratedHooks(job.cwd, job.model, hook);
  const runtimeSkill = await readFile('/deos/bin/implementation-skill.md','utf8');
  // The native runtime discovers administrator skills here, and the unprivileged
  // author can read them without gaining access to Codex's private credential home.
  const runtimeSkillPath = '/etc/codex/skills/deos-implementation/SKILL.md';
  await mkdir('/etc/codex/skills/deos-implementation',{recursive:true,mode:0o755});
  await writeFile(runtimeSkillPath,runtimeSkill,{mode:0o644});
  await writeFile('/deos/run/runtime-guide.md',runtimeSkill,{mode:0o644});
  const grounding = await verifyNativeGrounding(
    {
      schema: "deos-implementation-grounding-v1",
      webSearch: "native-live",
      skills: [{id:'deos-implementation',path:runtimeSkillPath}],
    },
    job.cwd,
  );
  await writeFile(`${ROOT}/grounding.json`, JSON.stringify(grounding), {
    mode: 0o600,
  });
  await checked(
    [
      "chown",
      "-R",
      "deos-author:deos-author",
      job.cwd,
      "/deos/output",
      `/deos/test-data/${job.attemptId}`,
    ],
    job.cwd,
  );
  // The author may edit the working files, but cannot replace Git's trusted
  // configuration or install executable hooks for the root snapshot process.
  await checked(["chown", "-R", "root:root", join(job.cwd, ".git")], job.cwd);
  await checked(["chmod", "-R", "go-w", join(job.cwd, ".git")], job.cwd);
  await checked(["chown", "root:deos-author", job.cwd], job.cwd);
  await checked(["chmod", "1775", job.cwd], job.cwd);
  await checked(["chown", "root:deos-author", "/deos/output"], job.cwd);
  await checked(["chmod", "1775", "/deos/output"], job.cwd);
  await checked(["chmod", "700", "/root/.codex", ROOT], job.cwd);
  await checked(
    ["git", "config", "--global", "--add", "safe.directory", job.cwd],
    job.cwd,
  );
  await checked(
    [
      "git",
      "config",
      "--file",
      "/home/deos-author/.gitconfig",
      "--add",
      "safe.directory",
      job.cwd,
    ],
    job.cwd,
  );
  const journal='/deos/output/implementation-diagnostics.jsonl';
  await writeFile(journal,'',{mode:0o600,flag:'wx'});
  const input = JSON.parse(
    await readFile("/deos/run/implementation-input.json", "utf8"),
  );
  const state = { checks: input.prior?.checks ?? [], proof: input.prior?.proof ?? [] };
  const broker = async (payload) => {
    for (;;) {
      const url = `${job.capabilityUrl}/implementation`;
      const init = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${job.capabilityToken}`,
          "Deos-Attempt": job.attemptId,
        },
        body: JSON.stringify(payload),
      };
      const response = await fetch(url, init);
      if (response.status === 429 || response.status === 409) {
        const wait = await response.json();
        if (!["browser_capacity", "browser_quarantined"].includes(wait.error))
          throw new Error(JSON.stringify(wait));
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(30000, Math.max(1000, wait.retryAfterMs)),
          ),
        );
        continue;
      }
      if (!response.ok)
        throw new Error(
          `Implementation broker HTTP ${response.status}: ${await response.text()}`,
        );
      return response.json();
    }
  };
  let preview = null;
  let previewLog = null;
  let previewError = null;
  const stopPreview = async () => {
    await stopProcessGroup(preview);
    await previewLog?.close();
    preview = null;
    previewLog = null;
    previewError = null;
  };
  const toolQueue = implementationToolQueue();
  let providerChain = Promise.resolve();
  let stateWrites = Promise.resolve();
  const persistState = () => {
    stateWrites = stateWrites.then(() => writeFile(`${ROOT}/state.json`, JSON.stringify(state), { mode: 0o600 }));
    return stateWrites;
  };
  const browserResult = async (request, subject) => {
    const result = await broker({ ...request, subject });
    if (result.imageBase64) {
      const imagePath = `${ROOT}/browser-${result.proof.sha256}.png`;
      await writeFile(imagePath, Buffer.from(result.imageBase64, "base64"), { mode: 0o644 });
      delete result.imageBase64;
      result.imagePath = imagePath;
    }
    return result;
  };
  const server = createServer((req, res) => {
    // A checked test process may call the provider adapter while its enclosing
    // check waits for exit. Keep these narrow requests off the command queue.
    if (req.method === "POST" && req.url === "/provider-test") {
      providerChain = providerChain.then(async () => {
        const chunks = []; let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024) throw new Error("Provider test request exceeds 1048576 bytes");
          chunks.push(chunk);
        }
        const request = JSON.parse(Buffer.concat(chunks).toString());
        if (request.action !== "safe_test") throw new Error("Only scoped provider tests use this endpoint");
        const current = await snapshot(job.cwd);
        const result = await broker({ ...request, subject: { change: job.openspecChange,
          approvedDesignSha: input.approvedDesignSha, testedBaseSha: current.testedBaseSha, treeSha: current.treeSha } });
        if (result.proof && !state.proof.some(p => p.id === result.proof.id)) state.proof.push(result.proof);
        await persistState();
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result));
      }).catch(async error => {
        const diagnostic = { message: error.message, stack: error.stack, cause: error.cause, result: error.result };
        try { await appendFile(journal, JSON.stringify({ operation: "provider-test", error: diagnostic }) + "\n"); }
        catch (secondary) { diagnostic.storageError = { message: secondary.message, stack: secondary.stack }; process.stderr.write(JSON.stringify(diagnostic) + "\n"); }
        if (!res.headersSent) res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(diagnostic));
      });
      return;
    }
    toolQueue.run(async () => {
        if (req.method !== "POST" || req.url !== "/tool") {
          res.writeHead(404);
          res.end();
          return;
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 1024 * 1024)
            throw new Error("Tool request exceeds 1048576 bytes");
          chunks.push(chunk);
        }
        const request = JSON.parse(Buffer.concat(chunks).toString());
        const before = await snapshot(job.cwd);
        const subject = {
          change: job.openspecChange,
          approvedDesignSha: input.approvedDesignSha,
          testedBaseSha: before.testedBaseSha,
          treeSha: before.treeSha,
        };
        let result;
        if (request.action === "status") {
          const checks = state.checks;
          result = { ...subject,
            checks: checks.map(({ command, cwd, exitCode }) => ({ command, cwd, exitCode })),
            proofKinds: [...new Set(state.proof.map(p => p.kind))],
          };
        } else if (request.action === "check") {
          if (
            !Array.isArray(request.argv) ||
            !request.argv.length ||
            request.argv.some((a) => typeof a !== "string")
          )
            throw new Error("Check argv is invalid");
          const requested = request.argv.join(" ");
          if (
            /\b(wrangler\s+(deploy|publish)|--remote|git\s+push)\b/.test(
              requested,
            )
          )
            throw new Error("Remote and publication commands are not allowed");
          const cwd = request.cwd ? resolve(job.cwd, request.cwd) : job.cwd;
          if (relative(job.cwd, cwd).startsWith(".."))
            throw new Error("Check cwd escaped repository");
          const argv = [
            "runuser",
            "-u",
            "deos-author",
            "--",
            "env",
            "-i",
            "PATH=/usr/local/bin:/usr/bin:/bin",
            "HOME=/home/deos-author",
            "NODE_EXTRA_CA_CERTS=/etc/cloudflare/certs/cloudflare-containers-ca.crt",
            ...request.argv,
          ];
          if (request.behavior === true) {
            const doc = `${ROOT}/showboat-${Date.now()}.md`;
            await checked(
              ["showboat", "init", doc, `${job.openspecChange} behavior check`],
              cwd,
            );
            // Save the complete command before handing it to Showboat through stdin.
            const script = `${ROOT}/behavior.sh`;
            await writeFile(script, argv.map(shellQuote).join(" ") + "\n", {
              mode: 0o600,
            });
            result = await responseCommand(res, ["showboat", "exec", doc, "bash"], cwd, {
              stdin: await readFile(script),
            });
            result.command = request.argv.map(shellQuote).join(" ");
            result.cwd = cwd;
          await appendFile(journal,JSON.stringify({operation:'check',...subject,result})+'\n');
            state.checks = recordCheck(state.checks, result, before);
            state.proof.push(
              await broker({
                action: "showboat",
                subject,
                command: result,
                document: await readFile(doc, "utf8"),
                audience: request.audience === "review" ? "review" : "diagnostic",
              }),
            );
          } else {
            result = await responseCommand(res, argv, cwd);
            result.command = request.argv.map(shellQuote).join(" ");
            result.cwd = cwd;
          await appendFile(journal,JSON.stringify({operation:'check',...subject,result})+'\n');
            state.checks = recordCheck(state.checks, result, before);
          }
        } else if (request.action === 'publish_preview') {
          // Build files are controlled by the author. Read them with the same
          // unprivileged identity, including during concurrent filesystem edits.
          const capture = await command(['runuser','-u','deos-author','--','node',
            '/deos/bin/implementation-static-assets.mjs',job.cwd,request.assets],job.cwd,
            {maxOutputBytes:16 * 1024 * 1024});
          if (capture.exitCode !== 0) throw Object.assign(new Error(`Static preview capture failed: ${capture.stderr}`),{result:capture});
          result = await broker({action:'publish_preview',subject,files:JSON.parse(capture.stdout)});
        } else if (request.action === "preview") {
          if (preview)
            throw new Error("This try already has a preview process");
          const config = localConfig(request, job.attemptId);
          for (const path of [config.main, config.assets?.directory].filter(
            Boolean,
          )) {
            if (relative(job.cwd, await realpath(path)).startsWith(".."))
              throw new Error("Preview symlink escaped repository");
          }
          const configPath = `${ROOT}/local-worker.json`;
          await writeFile(configPath, JSON.stringify(config));
          await chmod(configPath, 0o644);
          await chmod(ROOT, 0o711);
          await mkdir(`${ROOT}/.wrangler`, { recursive: true });
          await checked(
            ["chown", "deos-author:deos-author", `${ROOT}/.wrangler`],
            job.cwd,
          );
          try {
          previewLog = await open(`${ROOT}/preview.log`, "a", 0o600);
          preview = spawn(
            "runuser",
            [
              "-u",
              "deos-author",
              "--",
              "env",
              "-i",
              "PATH=/usr/local/bin:/usr/bin:/bin",
              "HOME=/home/deos-author",
              "NODE_EXTRA_CA_CERTS=/etc/cloudflare/certs/cloudflare-containers-ca.crt",
              "wrangler",
              "dev",
              "--local",
              "--config",
              configPath,
              "--ip",
              "0.0.0.0",
              "--port",
              "8787",
              "--persist-to",
              `/deos/test-data/${job.attemptId}`,
            ],
            { cwd: ROOT, detached:true, stdio: ["ignore", previewLog.fd, previewLog.fd] },
          );
          preview.on("error", (error) => {
            previewError = error;
          });
          let ready = false;
          for (let i = 0; i < 60; i++) {
            if (previewError) throw previewError;
            if (preview.exitCode !== null)
              throw new Error(
                `Preview exited ${preview.exitCode}: ${await readFile(`${ROOT}/preview.log`, "utf8")}`,
              );
            try {
              await fetch("http://127.0.0.1:8787/", {
                signal: AbortSignal.timeout(2000),
              });
              ready = true;
              break;
            } catch (error) {
              if (
                !["ECONNREFUSED", "ECONNRESET", "UND_ERR_SOCKET"].includes(
                  error.cause?.code,
                ) &&
                error.name !== "TimeoutError"
              )
                throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          if (!ready)
            throw new Error(
              `Preview did not become ready: ${await readFile(`${ROOT}/preview.log`, "utf8")}`,
            );
          result = await broker({ action: "preview", port: 8787 });
          } catch (error) {
            try { await stopPreview(); }
            catch (cleanupError) { throw new AggregateError([error, cleanupError], "Preview startup and cleanup failed", { cause: error }); }
            throw error;
          }
        } else if (request.action === "demo") {
          beginBrowserDemo(state);
          await persistState();
          result = await collectBrowserDemo(request, {
            browser: step => browserResult(step, subject),
            record: event => appendFile(journal, JSON.stringify({ operation: "demo", ...subject,
              occurredAt: new Date().toISOString(), ...event }) + "\n"),
          });
          finishBrowserDemo(state, result);
        } else if (["browser", "document", "search", "safe_test"].includes(request.action)) {
          result = await browserResult(request, subject);
          if (result.proof && !(state.demoCollection && result.proof.kind === "browser_image"))
            state.proof.push(result.proof);
        } else throw new Error("Unsupported implementation tool action");
        await persistState();
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      }, async (error) => {
        const diagnostic = {
          message: error.message,
          stack: error.stack,
          cause: error.cause,
          detail: originalErrorText(error),
          result: error.result,
        };
        try {
          await appendFile(journal,JSON.stringify({operation:'tool',error:diagnostic})+'\n');
          await writeFile(`${ROOT}/last-error.json`, JSON.stringify(diagnostic), {mode:0o600});
        } catch(secondary) {
          diagnostic.storageError={message:secondary.message,stack:secondary.stack};
          process.stderr.write(JSON.stringify(diagnostic)+'\n');
        }
        if (!res.headersSent)
          res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify(diagnostic));
      });
  });
  await new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(8790, "127.0.0.1", resolveServer);
  });
  const runtime = {
    async finish() {
      await toolQueue.drain();
      await providerChain;
      await stateWrites;
      const { patch, ...snap } = await snapshot(job.cwd);
      await writeFile(`${ROOT}/patch.diff`, patch, { mode: 0o600 });
      await rename(`${ROOT}/patch.diff`, "/deos/output/patch.diff");
      const result = await completionJson("/deos/output/result.json");
      if (!result || !["completed", "needs_human", "failed"].includes(result.outcome))
        throw new CompletionOutputError("/deos/output/result.json", new Error("Expected an outcome of completed, needs_human or failed"));
      // Documentation and evidence are review context, not completion gates.
      // Supply the legacy artifact so already frozen jobs can still collect it.
      const sources = [];
      try { await writeFile("/deos/output/documentation-sources.json", JSON.stringify(sources), {mode: 0o600, flag: "wx"}); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
      const candidate = {
        version: 1,
        attemptId: job.attemptId,
        kind: job.implementationKind,
        outcome: result.outcome,
        summary: result.summary,
        change: job.openspecChange,
        approvedDesignSha: input.approvedDesignSha,
        ...snap,
        tasks: await readRegularFile(
          join(job.cwd, `openspec/changes/${job.openspecChange}/tasks.md`),
          job.cwd,
        ),
        patchSha: sha(patch),
        checks: state.checks,
        proof: state.proof,
        sources,
        assumptions: result.assumptions,
        question: result.question,
      };
      await writeFile(`${ROOT}/candidate.json`, JSON.stringify(candidate), {
        mode: 0o600,
      });
      await rename(
        `${ROOT}/candidate.json`,
        "/deos/output/implementation-candidate.json",
      );
      return candidate;
    },
    async close() {
      await stopPreview();
      server.closeAllConnections();
      await new Promise((resolveClose) => server.close(resolveClose));
    },
  };
  return runtime;
}
