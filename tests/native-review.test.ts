import { D1ArtifactManifestStore } from "../src/artifact-collector.ts";
import { nativeReviewMessage } from "../container/native-review-packet.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { D1NativeReviewStore, nativeChildTerminalError, nativeDigest } from "../src/native-review-store.ts";
import { readCommand } from "../container/native-review-read.mjs";

class Statement {
  db: DatabaseSync; sql: string; args: any[];
  constructor(db: DatabaseSync, sql: string, args: any[] = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args: any[]) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
  async run() { return { meta: { changes: this.db.prepare(this.sql).run(...this.args).changes } }; }
}
const fixture = () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE agent_attempts(attempt_id TEXT PRIMARY KEY); INSERT INTO agent_attempts VALUES ('author');");
  db.exec(readFileSync("migrations/0030_native_self_review.sql", "utf8"));
  const objects = new Map<string, string>();
  const bucket = {
    async put(key: string, value: string) { if (!objects.has(key)) objects.set(key, value); },
    async get(key: string) { const value = objects.get(key); return value === undefined ? null : { text: async () => value }; },
  } as unknown as R2Bucket;
  const store = new D1NativeReviewStore({ prepare: (sql: string) => new Statement(db, sql) } as unknown as D1Database, bucket);
  return { db, objects, store };
};
const child = "11111111-1111-7111-8111-111111111111";
const launch = { index: 0, inputSha256: "a".repeat(64), model: "gpt-5.6-sol", sessionId: null };
const proof = (key: string) => ({ sessionKey: key, authorAttemptId: "author", subagentId: child, launch,
  effectiveInput: { fork_turns: "none", agent_type: "deos_reviewer", message: nativeReviewMessage(launch) },
  startReceipt: { agent_type: "deos_reviewer", model: launch.model },
  completionReceipt: { agent_id: child, agent_type: "deos_reviewer" },
  beforeManifest: [{ path: "proposal.md", sha256: "b".repeat(64) }],
  afterManifest: [{ path: "proposal.md", sha256: "b".repeat(64) }],
  transcript: [{ type: "session_meta" }], result: { findings: [] }, fault: null });

test("checkpoint replay returns the saved response without repeating the reducer", async () => {
  const { store, db } = fixture();
  const request = { attemptId: "author", sequence: 0, candidateSequence: 1, kind: "candidate" };
  let count = 0;
  const action = async () => ({ action: "review", count: ++count });
  const first = await store.checkpoint("author", request, action);
  assert.deepEqual(await store.checkpoint("author", request, action), first);
  assert.equal(count, 1);
  assert.equal(first.requestSha256, await nativeDigest(JSON.stringify(request)));
  await assert.rejects(store.checkpoint("author", { ...request, kind: "changed" }, action), /input changed/);
  db.close();
});

test("native children use one parent attempt and immutable proof must survive read-back", async () => {
  const { store, db, objects } = fixture();
  const key = await store.allocate("author", "planning", 1, launch);
  await store.started(key, "author", child);
  await store.complete(key, "author", proof(key));
  await store.accepted("author", 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agent_attempts").get()?.n, 1);
  assert.equal((await store.session(key, "author")).state, "accepted");
  await store.verifyCandidate("author", 1);
  const second = await store.allocate("author", "planning", 2, launch);
  await assert.rejects(store.started(second, "author", child), /already used/);
  objects.set((await store.session(key, "author")).proof_r2_key!, "changed");
  await assert.rejects(store.verifyCandidate("author", 1), /read-back failed/);
  db.close();
});

test("changed files retain fault proof and cannot advance a review", async () => {
  const { store, db, objects } = fixture();
  const key = await store.allocate("author", "design", 1, launch);
  await store.started(key, "author", child);
  await assert.rejects(store.complete(key, "author", { ...proof(key), afterManifest: [] }), /proof rejected/);
  assert.equal((await store.session(key, "author")).state, "fault");
  assert.equal(objects.size, 1);
  await assert.rejects(store.accepted("author", 1), /incomplete/);
  db.close();
});

test("forked author context is rejected before proof acceptance", async () => {
  const { store, db } = fixture();
  const key = await store.allocate("author", "planning", 1, launch);
  await store.started(key, "author", child);
  await assert.rejects(store.complete(key, "author", { ...proof(key), effectiveInput: { fork_turns: "all", agent_type: "deos_reviewer" } }), /fresh session/);
  db.close();
});

test("review shell exposes reads while denying execution and shell expansion", () => {
  assert.deepEqual(readCommand("sed -n '1,20p' proposal.md"), { op: "sed", args: ["-n", "1,20p", "proposal.md"] });
  assert.deepEqual(readCommand('rg -n "temperature scale" proposal.md'), { op: "rg", args: ["-n", "temperature scale", "proposal.md"] });
  for (const command of ["touch proposal.md", "curl https://example.com", "cat $(env)", "cat x > proposal.md", "cat x; env", "python3 -c print(1)"]) {
    assert.throws(() => readCommand(command));
  }
});


test("a child runtime error is retained even without a SubagentStop callback", async () => {
  const error = { message: "encrypted output could not be decoded", codex_error_info: "other" };
  const event = JSON.stringify({ type: "event_msg", timestamp: "2026-09-10T07:06:20Z", payload: { type: "task_complete", error } });
  assert.deepEqual(nativeChildTerminalError(event + '\n{"partial":'), { error, completedAt: "2026-09-10T07:06:20Z" });
  assert.equal(nativeChildTerminalError(JSON.stringify({ type: "event_msg", payload: { type: "task_complete", error: null } })), null);
  const { store, db } = fixture();
  await store.allocate("author", "planning", 1, launch);
  await store.failAttempt("author");
  assert.equal(db.prepare("SELECT state FROM self_review_sessions").get()?.state, "fault");
});

test("manifest migration preserves saved review references and permits native cycles plus author output", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE orchestration_runs(run_id TEXT PRIMARY KEY); INSERT INTO orchestration_runs VALUES ('run');");
  const original = readFileSync("migrations/0006_sandbox_orchestration.sql", "utf8");
  db.exec(original.slice(original.indexOf("CREATE TABLE IF NOT EXISTS artifact_manifests"), original.indexOf("CREATE TABLE IF NOT EXISTS agent_attempts")));
  const store = new D1ArtifactManifestStore({ prepare: (sql: string) => new Statement(db, sql) } as unknown as D1Database);
  const first = { manifestId: "manifest:author:native-1", runId: "run", attemptId: "author", r2Key: "native-1/manifest.json", now: "now" };
  await store.begin(first);
  db.exec("CREATE TABLE saved_review (manifest_id TEXT REFERENCES artifact_manifests(manifest_id)); INSERT INTO saved_review VALUES ('manifest:author:native-1');");
  db.exec("BEGIN;" + readFileSync("migrations/0031_native_review_artifact_manifests.sql", "utf8") + "COMMIT;");
  await store.begin(first);
  await store.begin({ ...first, manifestId: "manifest:author:native-2", r2Key: "native-2/manifest.json" });
  await store.begin({ ...first, manifestId: "manifest:author", r2Key: "manifest.json" });
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM artifact_manifests WHERE attempt_id='author'").get()?.n, 3);
  assert.equal(db.prepare("SELECT manifest_id FROM saved_review").get()?.manifest_id, first.manifestId);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  await assert.rejects(store.begin({ ...first, r2Key: "changed" }), /identity mismatch/);
  db.close();
});
