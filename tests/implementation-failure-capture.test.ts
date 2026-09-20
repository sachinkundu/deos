import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { implementationFailureProgram, captureImplementationFailure } from "../src/implementation-failure-capture.ts";
import type { AgentAttemptRecord, SandboxView, SandboxProcessView } from "../src/sandbox-controller.ts";
import { sha256Hex } from "../src/implementation-hash.ts";
import { captureSupervisorStreams } from "../container/supervisor-io.mjs";
import { finished } from "node:stream/promises";

test("a killed supervisor's working tree and private captures survive without a result or candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-failure-"));
  try {
    const cwd = join(root, "repo"), runRoot = join(root, "run"), outputRoot = join(root, "out"), tempRoot = join(root, "tmp");
    for (const path of [cwd, runRoot, outputRoot, tempRoot]) await mkdir(path);
    const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
    await writeFile(join(cwd, "app.txt"), "before\n"); git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    await writeFile(join(cwd, "app.txt"), "recovered work\n");
    await writeFile(join(cwd, "image.bin"), Buffer.from([0, 1, 255]));
    const captures = await captureSupervisorStreams(tempRoot);
    for (const [name, capture] of Object.entries(captures)) {
      capture.stream.end(`partial ${name}\n`);
      await finished(capture.stream);
    }
    const request = { runtimeModule: resolve("container/implementation-runtime.mjs"), cwd, runRoot, outputRoot, tempRoot,
      runtimeStatePath:join(runRoot,'runtime-state.json'),
      runId: "run-1", attemptId: "failed-build", kind: "build", change: "sample", approvedDesignSha: base, testedBaseSha: base };
    const script = join(runRoot, "capture.mjs"), requestFile = join(runRoot, "request.json");
    await writeFile(script, implementationFailureProgram); await writeFile(requestFile, JSON.stringify(request));
    execFileSync(process.execPath, [script, requestFile]);
    const patch = await readFile(join(outputRoot, "recovery-patch.diff"), "utf8");
    const saved = JSON.parse(await readFile(join(outputRoot, "implementation-recovery.json"), "utf8"));
    assert.equal(saved.patchSha, await sha256Hex(patch));
    assert.equal(saved.purpose, "recovery-only"); assert.equal(saved.runId, "run-1");
    assert.equal(saved.outcome, undefined); assert.equal(saved.checks, undefined);
    assert.match(patch, /recovered work/); assert.match(patch, /GIT binary patch/);
    assert.equal(await readFile(join(outputRoot, "transcript.jsonl"), "utf8"), "partial transcript\n");
    assert.equal(await readFile(join(outputRoot, "validation.txt"), "utf8"), "partial validation\n");
    const proof = [{id:'main-flow',kind:'browser_image'}, {id:'correction',kind:'browser_image'}];
    const checklist = {version:1,planSha256:'plan',items:[{id:'saved-note',state:'complete',evidenceIds:['main-flow']}],history:[]};
    await writeFile(request.runtimeStatePath,JSON.stringify({proof,reviewProofIds:['main-flow'],evidenceChecklist:checklist}),{mode:0o600});
    await writeFile(join(outputRoot, "transcript.jsonl"), "already finalized\n");
    execFileSync(process.execPath, [script, requestFile]);
    const resumed = JSON.parse(await readFile(join(outputRoot,'implementation-recovery.json'),'utf8'));
    assert.deepEqual(resumed.proof,[{...proof[0],audience:'review'}]);
    assert.deepEqual(resumed.proofArchive,proof);
    assert.deepEqual(resumed.evidenceChecklist,checklist);
    assert.equal(await readFile(join(outputRoot, "transcript.jsonl"), "utf8"), "already finalized\n");
    await symlink("/etc/passwd", join(cwd, "escape"));
    assert.throws(() => execFileSync(process.execPath, [script, requestFile], { stdio: "pipe" }), /Unsupported candidate mode/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failure capture retains exit details and refuses cleanup when the snapshot command fails", async () => {
  const files = new Map<string, string>();
  const attempt = { attempt_id: "failed", run_id: "run", node_id: "implementation_build", job_spec_json: JSON.stringify({
    openspecChange: "sample", materializedContext: JSON.stringify({ approvedDesignSha: "a".repeat(40), testedBaseSha: "b".repeat(40) }),
  }) } as AgentAttemptRecord;
  const sandbox = {
    readFile: async () => ({ content: JSON.stringify({ attemptId: 'failed', observedAt: '2026-09-15T06:31:48Z', processPid: 76 }) }),
    exists: async () => ({ exists: true }), writeFile: async (path: string, bytes: string) => { files.set(path, bytes); },
    exec: async () => ({ output: async () => ({ exitCode: 1, timedOut: false, truncated: false, stdout: "", stderr: "disk read failed" }) }),
  } as unknown as SandboxView;
  const process = { id: "process", status: async () => ({ state: "error", exit: { code: 137, signal: 9, timedOut: false } }),
    output: async () => ({ exitCode: 137, signal: 9, stdout: "partial output", stderr: "original process diagnostic", timedOut: false, truncated: false }),
  } as unknown as SandboxProcessView;
  await assert.rejects(captureImplementationFailure(attempt, sandbox, "supervisor_failed", process), error => {
    assert.match(String(error), /disk read failed/);
    assert.match(JSON.stringify((error as Error).cause), /original process diagnostic/);
    return true;
  });
  const evidence = JSON.parse(files.get("/deos/output/supervisor-process.json")!);
  assert.equal(evidence.status.exit.signal, 9);
  assert.equal(evidence.output.stderr, "original process diagnostic");
  assert.equal(evidence.lastHeartbeat.observedAt, '2026-09-15T06:31:48Z');
  assert.equal(JSON.parse(files.get("/deos/run/implementation-recovery-request.json")!).kind, "build");
});
