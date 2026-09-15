// Local process proof. The model and capability transport are deterministic fixtures;
// the supervisor, implementation runtime, shell checks and Showboat are the built code.
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, appendFile, chmod } from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { verifyImplementationCandidate, isRepairableVerificationError } from "../../src/implementation-verification.ts";
import { implementationPolicy } from "../../src/implementation-contract.ts";
import { errorDetails } from "../../src/error-details.ts";

const repo = "/deos/workspace/repository";
const sha = value => createHash("sha256").update(value).digest("hex");
const file = (path, content) => writeFile(path, content, { mode: 0o600 });
const sessionId = "local-process-proof-session";
const capacityFailure = process.argv.includes("--capacity-failure");
if (process.argv.includes("fake-codex")) {
  const args = process.argv.slice(process.argv.indexOf("fake-codex") + 1);
  if (args[0] === "app-server") {
    for await (const line of createInterface({ input: process.stdin })) {
      const request = JSON.parse(line);
      if (request.id === undefined) continue;
      let result = {};
      if (request.method === "hooks/list") result = { data: [{ errors: [], warnings: [], hooks:
        ["PreToolUse", "SubagentStart", "SubagentStop", "Stop"].map(eventName => ({
          eventName, command: "node /deos/bin/implementation-hook.mjs", sourcePath: "/root/.codex/config.toml",
          key: eventName, currentHash: "fixture-hash",
        })) }] };
      if (request.method === "config/read") result = { config: { web_search: "live" } };
      if (request.method === "skills/list") result = { data: [{ cwd: repo, errors: [], skills: [] }] };
      process.stdout.write(JSON.stringify({ id: request.id, result }) + "\n");
    }
  } else {
    let prompt = "";
    for await (const chunk of process.stdin) prompt += chunk;
    const resumed = args[1] === "resume";
    if (resumed) assert.equal(args[2], sessionId);
    const calls = JSON.parse(await readFile("/proof-state/calls.json", "utf8"));
    calls.push({ args, prompt, pid: process.pid });
    await file("/proof-state/calls.json", JSON.stringify(calls));
    process.stdout.write(JSON.stringify({ type: "thread.started", thread_id: sessionId }) + "\n");
    if (capacityFailure) {
      await writeFile(`${repo}/value`, "saved", { flag: "r+" });
      process.stdout.write(JSON.stringify({ type: "turn.started" }) + "\n");
      const message = "Selected model is at capacity. Please try a different model.";
      process.stdout.write(JSON.stringify({ type: "error", message }) + "\n");
      process.stdout.write(JSON.stringify({ type: "turn.failed", error: { message } }) + "\n");
      process.exit(1);
    }
    const check = async behavior => {
      const path = `/deos/output/requests/check-${calls.length}-${behavior}.json`;
      await file(path, JSON.stringify({ action: "check", argv: ["node", "check.cjs"], ...(behavior ? { behavior: true } : {}) }));
      const result = execFileSync("deos-implementation", [path], { cwd: repo, encoding: "utf8" });
      await appendFile("/proof-state/checks.jsonl", result.trim() + "\n");
    };
    await mkdir("/deos/output/requests", { recursive: true });
    if (calls.length === 1) {
      assert.equal(resumed, false);
      await check(false);
    } else if (calls.length === 2) {
      assert.match(prompt, /Required commands failed/);
      // The deterministic model runs as root; open the author-owned file without
      // O_CREAT, respecting Linux's protected_regular rule on the sticky worktree.
      await writeFile(`${repo}/value`, "fixed", { flag: "r+" });
      await check(false);
      // An intended repository edit after the passing check must force a retest.
      await writeFile(`${repo}/notes.md`, "The changed behavior was checked.\n");
    } else if (calls.length === 3) {
      assert.match(prompt, /No recorded checks match/);
      await check(false);
      await check(true);
    } else assert.fail("Unexpected extra model turn");
    await file("/deos/output/documentation-sources.json", "[]");
    await file("/deos/output/result.json", JSON.stringify({ outcome: "completed", assumptions: [], question: null }));
    process.stdout.write(JSON.stringify({ type: "turn.completed" }) + "\n");
  }
} else {
  for (const path of [repo, "/deos/run", "/deos/output", "/deos/test-data/proof-attempt", "/root/.codex", "/proof-state", "/proof-bin"])
    await mkdir(path, { recursive: true });
  await file("/proof-state/calls.json", "[]");
  await file("/root/.codex/models_cache.json", JSON.stringify({ models: [{ slug: "fixture-model" }] }));
  const self = new URL(import.meta.url).pathname;
  await writeFile("/proof-bin/codex", `#!/bin/sh\nexec node --experimental-strip-types '${self}' ${capacityFailure ? "--capacity-failure " : ""}fake-codex "$@"\n`);
  await chmod("/proof-bin/codex", 0o755);
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
  await writeFile(`${repo}/value`, "wrong");
  await writeFile(`${repo}/check.cjs`, 'require("node:assert/strict").equal(require("node:fs").readFileSync("value","utf8"),"fixed");console.log("changed behavior passes");\n');
  await mkdir(`${repo}/openspec/changes/sample`, { recursive: true });
  await writeFile(`${repo}/openspec/changes/sample/tasks.md`, "- [x] 1. Fix the behavior\n");
  git("add", "."); git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  const input = { version: 1, runId: "proof-run", repository: "fixture/repo", change: "sample", approvedDesignSha: base,
    testedBaseSha: base, policy: implementationPolicy, approvedFiles: [], requirements: { kinds: ["showboat"], reasons: [], blockedProviders: [] } };
  const work = { run_id: "proof-run", change_id: "sample", approved_design_sha: base, tested_base_sha: base,
    requirements_json: JSON.stringify(input.requirements) };
  const proofs = new Map(), verification = [];
  const db = { prepare: sql => ({ bind: (...args) => ({
    all: async () => { assert.match(sql, /implementation_doc_access/); return { results: [] }; },
    first: async () => { assert.match(sql, /implementation_proof/); return proofs.get(args[0]) ?? null; },
  }) }) };
  let notifications = 0, heartbeatDuringVerification = false, verificationRequests = 0, beforeHeartbeat;
  const server = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      assert.equal(req.headers["deos-attempt"], "proof-attempt");
      if (req.url === "/attempt-completed") { notifications++; res.end("{}"); return; }
      assert.equal(req.url, "/implementation");
      let result;
      if (request.action === "showboat") {
        assert.match(request.document, /changed behavior passes/);
        const id = `proof-${proofs.size + 1}`, digest = sha(request.document);
        proofs.set(id, { sha256: digest, tree_sha: request.subject.treeSha });
        result = { ...request.subject, id, kind: "showboat", path: "fixture-showboat.md", caption: "Actual local command", sha256: digest, sanitized: true };
      } else {
        assert.equal(request.action, "verify");
        verificationRequests++;
        if (verificationRequests === 1) {
          beforeHeartbeat = JSON.parse(await readFile("/deos/output/heartbeat.json", "utf8"));
          return; // Drop one read response; the built supervisor must recover.
        }
        if (verificationRequests === 2) {
          await new Promise(resolve => setTimeout(resolve, 12_000));
          const after = JSON.parse(await readFile("/deos/output/heartbeat.json", "utf8"));
          assert.equal(after.attemptId, beforeHeartbeat.attemptId);
          assert.ok(Date.parse(after.observedAt) > Date.parse(beforeHeartbeat.observedAt));
          heartbeatDuringVerification = true;
        }
        const candidate = JSON.parse(await readFile("/deos/output/implementation-candidate.json", "utf8"));
        const patch = await readFile("/deos/output/patch.diff", "utf8");
        try {
          await verifyImplementationCandidate(db, work, input, "proof-attempt", candidate, patch);
          result = { ready: true, subject: request.subject };
        } catch (error) {
          if (!isRepairableVerificationError(error)) throw error;
          result = { ready: false, code: error.code, message: error.message, originalError: errorDetails(error) };
        }
        verification.push(result);
      }
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result));
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify(errorDetails(error))); }
  });
  await new Promise(resolve => server.listen(8791, "127.0.0.1", resolve));
  try {
    await file("/deos/run/implementation-input.json", JSON.stringify(input));
    await file("/deos/run/prompt.md", "Run the local verification repair fixture.");
    await file("/deos/run/schema.json", "{}");
    await file("/deos/run/job.json", JSON.stringify({ runId: "proof-run", attemptId: "proof-attempt", nodeId: "implementation_build",
      implementationKind: "build", openspecChange: "sample", agentRole: "author", model: "fixture-model", cwd: repo,
      promptPath: "/deos/run/prompt.md", resultSchemaPath: "/deos/run/schema.json", deadline: new Date(Date.now() + 120_000).toISOString(),
      capabilityUrl: "http://127.0.0.1:8791", capabilityToken: "fixture-only" }));
    const child = spawn("node", ["/deos/bin/supervisor.mjs"], {
      env: { ...process.env, PATH: `/proof-bin:${process.env.PATH}` }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    await file("/proof-state/supervisor.log", output);
    await file("/proof-state/validation.txt", await readFile("/deos/output/validation.txt", "utf8"));
    if (capacityFailure) {
      const status = JSON.parse(await readFile("/deos/output/status.json", "utf8"));
      const errors = await readFile("/deos/output/original-errors.jsonl", "utf8");
      assert.equal(code, 1);
      assert.equal(status.exitCode, 1);
      assert.equal(status.safeErrorCategory, "codex_exit_nonzero");
      assert.match(status.originalError.message, /Selected model is at capacity/);
      assert.match(status.originalError.cause, /turn.failed/);
      assert.match(errors, /Selected model is at capacity/);
      assert.doesNotMatch(errors, /ENOENT.*result.json/);
      assert.equal(await readFile(`${repo}/value`, "utf8"), "saved");
      assert.equal(notifications, 1);
      const summary = { proof: "local container with a deterministic provider capacity failure",
        supervisorExit: code, status, savedWork: true, completionSignals: notifications,
        missingResultDidNotMaskFailure: true };
      await file("/proof-state/summary.json", JSON.stringify(summary, null, 2));
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    } else {
    await file("/proof-state/diagnostics.jsonl", await readFile("/deos/output/implementation-diagnostics.jsonl", "utf8"));
    if (code !== 0) process.stderr.write(await readFile("/proof-state/validation.txt", "utf8"));
    assert.equal(code, 0, output);
    const status = JSON.parse(await readFile("/deos/output/status.json", "utf8"));
    const candidate = JSON.parse(await readFile("/deos/output/implementation-candidate.json", "utf8"));
    const calls = JSON.parse(await readFile("/proof-state/calls.json", "utf8"));
    const rounds = (await readFile("/deos/output/implementation-diagnostics.jsonl", "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(status.exitCode, 0); assert.equal(calls.length, 3);
    assert.deepEqual(verification.map(r => r.ready), [false, false, true]);
    assert.equal(sha(await readFile("/deos/output/patch.diff")), candidate.patchSha);
    assert.equal(candidate.checks.length, 1);
    assert.equal(candidate.proof.length, 1); assert.equal(notifications, 1);
    assert.equal(rounds.filter(r => r.operation === "verification").length, 3);
    assert.equal(verificationRequests, 4);
    const transportFailures = rounds.filter(r => r.operation === "verification.transport");
    assert.equal(transportFailures.length, 1);
    assert.match(transportFailures[0].detail, /TimeoutError/);
    assert.equal(rounds.filter(r => r.operation === "check").length, 4);
    assert.ok(rounds.some(r => r.operation === "check" && r.result.exitCode === 1));
    const summary = { proof: "local container with deterministic model and broker fixtures", supervisorExit: code,
      agentProcesses: calls.map(c => ({ pid: c.pid, mode: c.args[1] === "resume" ? "resume" : "initial", sessionId })),
      verification: verification.map(({ ready, code, message }) => ({ ready, code, message })),
      finalTree: candidate.treeSha, matchedPatchSha: candidate.patchSha, finalChecks: candidate.checks.map(({ command, cwd, exitCode }) => ({ command, cwd, exitCode })),
      retainedCheckRecords: 4, completionSignals: notifications, heartbeatDuringVerification,
      verificationRequests, retainedTransportFailures: transportFailures.length };
    await file("/proof-state/summary.json", JSON.stringify(summary, null, 2));
    process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
