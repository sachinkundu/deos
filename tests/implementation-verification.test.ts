import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { runImplementationCompletion } from "../container/implementation-completion.mjs";
// @ts-expect-error Deployed container JavaScript.
import { snapshot, currentChecks, recordCheck } from "../container/implementation-runtime.mjs";
import { isRepairableVerificationError, verifyImplementationCandidate } from "../src/implementation-verification.ts";
import { ImplementationError, implementationPolicy, type ImplementationCandidate } from "../src/implementation-contract.ts";
import { ImplementationStore, type ImplementationInput } from "../src/implementation-store.ts";
import { sha256Hex } from "../src/implementation-hash.ts";
import { errorDetails } from "../src/error-details.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

test("real worktree repair resumes one session until failed tests, stale checks and proof pass the shared gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-repair-"));
  const repo = join(root, "repo");
  const db = new ImplementationTestDatabase();
  const bucket = new ImplementationTestBucket();
  try {
    await mkdir(repo);
    const git = (...argv: string[]) => execFileSync("git", argv, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.test");
    await writeFile(join(repo, "value"), "broken");
    await writeFile(join(repo, "check.cjs"), 'require("node:assert/strict").equal(require("node:fs").readFileSync("value","utf8"),"fixed"); console.log("behavior passes");\n');
    git("add", "."); git("commit", "-qm", "base");
    seedRun(db); seedAttempt(db, "attempt");
    const input: ImplementationInput = {
      version: 1, runId: "run-1", repository: "owner/repo", change: "sample", branch: "deos/agent/SAC-172/run-1",
      approvedDesignSha: git("rev-parse", "HEAD"), testedBaseSha: git("rev-parse", "HEAD"),
      policy: implementationPolicy, approvedFiles: [], issue: {}, receipts: {},
      requirements: { kinds: ["showboat"], reasons: [], blockedProviders: [] },
    };
    const store = new ImplementationStore(db as unknown as D1Database, bucket as unknown as R2Bucket);
    const work = await store.allocate(input, { userId: "human", revision: 1 }, "SAC-172", 1);
    await store.beginTry(work, { attempt_id: "attempt", sandbox_id: "impl-attempt", visit_sequence: 1 }, "build");
    type Check = ImplementationCandidate["checks"][number] & { treeSha: string; testedBaseSha: string; cwd: string };
    let checks: Check[] = [], proof: ImplementationCandidate["proof"] = [], candidate: ImplementationCandidate;
    let patch = "", resumes = 0;
    const runCheck = async (label: string) => {
      const subject = await snapshot(repo);
      const actual = spawnSync(process.execPath, ["check.cjs"], { cwd: repo, encoding: "utf8" });
      if (actual.error) throw actual.error;
      checks = recordCheck(checks, { command: label, cwd: repo, exitCode: actual.status,
        stdout: actual.stdout, stderr: actual.stderr }, subject);
    };
    await runCheck("behavior"); await runCheck("regression");
    const journal = join(root, "diagnostics.jsonl");
    const result = await runImplementationCompletion({
      result: { code: 0, signal: null }, outcome: "completed", sessionId: "same-session", deadline: Date.now() + 60_000,
      journal, feedbackRoot: join(root, "feedback"),
      check: async () => {
        const snap = await snapshot(repo);
        patch = snap.patch;
        candidate = { ...snap, version: 1, attemptId: "attempt", kind: "build", outcome: "completed",
          change: "sample", approvedDesignSha: input.approvedDesignSha, tasks: "- [x] Fix behavior", patchSha: await sha256Hex(patch),
          checks: currentChecks(checks, snap),
          proof, sources: [], assumptions: [], question: null };
        try {
          await verifyImplementationCandidate(db as unknown as D1Database, work, input, "attempt", candidate, patch);
          return { ready: true };
        } catch (error) {
          if (!isRepairableVerificationError(error)) throw error;
          return { ready: false, code: error.code, message: error.message, originalError: errorDetails(error) };
        }
      },
      resume: async ({ sessionId, promptPath, prompt }) => {
        assert.equal(sessionId, "same-session");
        assert.equal(await readFile(promptPath, "utf8"), prompt);
        assert.ok(!promptPath.startsWith(repo));
        resumes++;
        if (resumes === 1) {
          assert.match(prompt, /Required commands failed/);
          await writeFile(join(repo, "value"), "fixed");
        } else if (resumes === 2) {
          assert.match(prompt, /No recorded checks match/);
          await runCheck("behavior");
          await runCheck("regression");
        } else if (resumes === 3) {
          assert.match(prompt, /Current showboat proof/);
          const snap = await snapshot(repo);
          const evidence = await store.put("run-1", "behavior.txt", checks[0].stdout);
          proof = [{ change: "sample", approvedDesignSha: input.approvedDesignSha, testedBaseSha: input.testedBaseSha,
            treeSha: snap.treeSha, id: "proof", kind: "showboat", path: evidence.key, caption: "Local test fixture",
            sha256: evidence.sha256, sanitized: true }];
          db.sqlite.prepare("INSERT INTO implementation_proof VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
            .run("proof", "run-1", "attempt", "showboat", input.approvedDesignSha, input.testedBaseSha, snap.treeSha,
              evidence.key, evidence.sha256, evidence.byteSize, "text/plain", "Local test fixture", 1, null, new Date().toISOString());
        } else assert.fail("Unexpected repair round");
        return { code: 0, signal: null, outcome: "completed" };
      },
    });
    assert.equal(result.accepted, true);
    assert.equal(resumes, 3);
    const rounds = (await readFile(journal, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(rounds.map(r => r.ready), [false, false, false, true]);
    assert.match(rounds[0].originalError.stack, /Required commands failed/);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM implementation_tries").get()!.n, 1);
    assert.equal(db.sqlite.prepare("SELECT status FROM orchestration_runs").get()!.status, "awaiting_human");
    // Collection uses this same gate again: neither a later patch nor a claimed proof can pass it.
    await assert.rejects(verifyImplementationCandidate(db as unknown as D1Database, work, input, "attempt", candidate!, patch + "x"), /patch differs/);
    db.sqlite.prepare("UPDATE implementation_proof SET sha256=? WHERE proof_id='proof'").run("0".repeat(64));
    await assert.rejects(verifyImplementationCandidate(db as unknown as D1Database, work, input, "attempt", candidate!, patch), /trusted broker/);
  } finally { db.close(); await rm(root, { recursive: true, force: true }); }
});

test("repair classification never turns infrastructure, identity or integrity errors into author feedback", () => {
  for (const code of ["checks_incomplete", "tasks_incomplete", "proof_incomplete", "documentation_locator", "documentation_missing", "invalid_question"])
    assert.equal(isRepairableVerificationError(new ImplementationError(code, code)), true);
  for (const code of ["candidate_identity", "patch_integrity", "untrusted_proof", "stale_proof", "attempt_inactive", "unsafe_path"])
    assert.equal(isRepairableVerificationError(new ImplementationError(code, code)), false);
  assert.equal(isRepairableVerificationError(new Error("D1 unavailable")), false);
  assert.equal(isRepairableVerificationError({ code: "checks_incomplete" }), false);
});

test("deadline, explicit failed result and unexpected faults cannot silently continue or pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-boundaries-"));
  try {
    let resumes = 0, time = 100;
    const options = { result: { code: 0, signal: null }, outcome: "completed", sessionId: "session", deadline: 200,
      journal: join(root, "journal"), feedbackRoot: join(root, "feedback"), now: () => time,
      check: async () => { time = 201; return { ready: false, code: "checks_incomplete", message: "Rerun test" }; },
      resume: async () => { resumes++; return { code: 0, signal: null, outcome: "completed" }; },
    };
    assert.deepEqual(await runImplementationCompletion(options), { result: { code: 124, signal: null }, accepted: false });
    assert.match(await readFile(options.journal, "utf8"), /Rerun test/);
    assert.equal(resumes, 0);
    assert.equal((await runImplementationCompletion({ ...options, outcome: "failed" })).accepted, false);
    time = 100;
    const fault = new Error("D1 read failed", { cause: new Error("original connection reset") });
    await assert.rejects(runImplementationCompletion({ ...options, check: async () => { throw fault; } }), error => error === fault);
    assert.equal(resumes, 0);
    const human = await runImplementationCompletion({ ...options, outcome: "needs_human", check: async () => ({ ready: true }) });
    assert.equal(human.accepted, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
