import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactCollector,
  D1ArtifactManifestStore,
  type ArtifactManifestStore,
  type ArtifactObjectStore,
  type SandboxArtifactReader,
} from "../src/artifact-collector.ts";

const NOW = new Date("2026-08-16T09:00:00.000Z");
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "summary"],
  properties: {
    outcome: { enum: ["completed", "blocked", "failed"] },
    summary: { type: "string", minLength: 1 },
  },
};

class Reader implements SandboxArtifactReader {
  readonly files = new Map<string, Uint8Array>();

  exists(path: string) {
    return Promise.resolve(this.files.has(path));
  }

  read(path: string) {
    const content = this.files.get(path);
    if (content === undefined) return Promise.reject(new Error("missing file"));
    return Promise.resolve({ content, mediaType: path.endsWith(".json") ? "application/json" : "text/plain" });
  }
}

class Objects implements ArtifactObjectStore {
  readonly values = new Map<string, { content: Uint8Array; digest: string }>();
  ambiguousKey: string | null = null;

  putCreateOnly(key: string, content: Uint8Array, sha256: string): Promise<"created" | "already_exists"> {
    if (this.ambiguousKey === key || this.values.has(key)) return Promise.resolve("already_exists" as const);
    this.values.set(key, { content, digest: sha256 });
    return Promise.resolve("created" as const);
  }

  sha256(key: string) {
    return Promise.resolve(this.values.get(key)?.digest ?? null);
  }
}

class Manifests implements ArtifactManifestStore {
  state = "none";
  records = 0;

  begin() {
    this.state = "pending";
    return Promise.resolve();
  }

  record() {
    this.records += 1;
    return Promise.resolve();
  }

  complete() {
    this.state = "complete";
    return Promise.resolve();
  }

  fail() {
    this.state = "failed";
    return Promise.resolve();
  }
}

const setup = () => {
  const reader = new Reader();
  const objects = new Objects();
  const manifests = new Manifests();
  reader.files.set(
    "/deos/output/result.json",
    new TextEncoder().encode(JSON.stringify({ outcome: "completed", summary: "done" })),
  );
  reader.files.set("/deos/output/transcript.jsonl", new TextEncoder().encode('{"event":"done"}\n'));
  return {
    reader,
    objects,
    manifests,
    collector: new ArtifactCollector(reader, objects, manifests, () => NOW),
  };
};

const input = {
  runId: "workflow:project-1:issue-1:run:1",
  attemptId: "attempt-1",
  outputRoot: "/deos/output",
  requiredFiles: ["transcript.jsonl", "result.json"],
  resultSchema: schema,
};

test("collector validates and writes immutable checksum-verified artifacts", async () => {
  const { collector, objects, manifests } = setup();
  const result = await collector.collect(input);
  assert.equal(result.objectCount, 2);
  assert.equal(result.result.outcome, "completed");
  assert.equal(manifests.state, "complete");
  assert.equal(manifests.records, 2);
  assert.equal(objects.values.size, 3);
});

test("successful collection retains notification diagnostics without changing the result", async () => {
  const { collector, reader, objects } = setup();
  const diagnostic = '{"message":"wake failed","detail":"Error: transport reset; cause: closed socket"}\n';
  reader.files.set("/deos/output/original-errors.jsonl", new TextEncoder().encode(diagnostic));
  const status = JSON.stringify({ exitCode: 0, completedAt: NOW.toISOString() });
  reader.files.set("/deos/output/status.json", new TextEncoder().encode(status));
  const result = await collector.collect(input);
  assert.equal(result.result.outcome, "completed");
  assert.equal(result.objectCount, 2);
  const stored = [...objects.values].find(([key]) => key.endsWith("/diagnostics/original-errors.jsonl"));
  assert.equal(new TextDecoder().decode(stored?.[1].content), diagnostic);
  const storedStatus = [...objects.values].find(([key]) => key.endsWith("/diagnostics/status.json"));
  assert.equal(new TextDecoder().decode(storedStatus?.[1].content), status);
  await collector.verifyDurable(result);
});

test("optional diagnostic read and write failures cannot invalidate the primary manifest", async () => {
  for (const stage of ["exists", "read", "put", "verify"] as const) {
    const { collector, reader, objects, manifests } = setup();
    const error = new Error(`diagnostic ${stage} failed`, { cause: new Error("original transport cause") });
    reader.files.set("/deos/output/original-errors.jsonl", new TextEncoder().encode('{"message":"notify failed"}\n'));
    const exists = reader.exists.bind(reader);
    reader.exists = path => path.endsWith("original-errors.jsonl") && stage === "exists"
      ? Promise.reject(error) : exists(path);
    const read = reader.read.bind(reader);
    reader.read = path => path.endsWith("original-errors.jsonl") && stage === "read"
      ? Promise.reject(error) : read(path);
    const put = objects.putCreateOnly.bind(objects);
    objects.putCreateOnly = (key, content, sha256) => key.includes("/diagnostics/") && stage === "put"
      ? Promise.reject(error) : put(key, content, sha256);
    const sha = objects.sha256.bind(objects);
    objects.sha256 = key => key.includes("/diagnostics/") && stage === "verify"
      ? Promise.reject(error) : sha(key);
    const errors: unknown[] = [];
    const { captureErrors } = await import("../src/error-context.ts");
    const result = await captureErrors(async captured => { errors.push(...captured); }, () => collector.collect(input));
    assert.equal(result.result.outcome, "completed", stage);
    assert.equal(result.objectCount, 2, stage);
    assert.equal(manifests.state, "complete", stage);
    assert.equal(manifests.records, 2, stage);
    assert.match(JSON.stringify(errors), /original transport cause/);
    if (stage === "put" || stage === "verify") assert.match(JSON.stringify(errors), /notify failed/);
    await collector.verifyDurable(result);
  }
});

test("collector parses mechanically captured successful provider receipts", async () => {
  const { collector, reader } = setup();
  reader.files.set(
    "/deos/output/provider-references.json",
    new TextEncoder().encode(JSON.stringify([{
      capability: "github",
      operationId: "operation-1",
      state: "succeeded",
      providerResourceId: "resource-1",
    }])),
  );
  const result = await collector.collect({
    ...input,
    requiredFiles: [...input.requiredFiles, "provider-references.json"],
  });

  assert.deepEqual(result.providerReceipts, [{
    capability: "github",
    operationId: "operation-1",
    state: "succeeded",
    providerResourceId: "resource-1",
  }]);
});

test("same-digest objects reconcile after an ambiguous create response", async () => {
  const { collector, objects } = setup();
  const first = await collector.collect(input);
  const second = await collector.collect(input);
  assert.equal(second.aggregateDigest, first.aggregateDigest);
});

test("missing files and invalid results fail the manifest", async () => {
  for (const configure of [
    (reader: Reader) => reader.files.delete("/deos/output/transcript.jsonl"),
    (reader: Reader) => reader.files.set(
      "/deos/output/result.json",
      new TextEncoder().encode(JSON.stringify({ outcome: "invented", summary: "bad" })),
    ),
  ]) {
    const { collector, reader, manifests } = setup();
    configure(reader);
    await assert.rejects(collector.collect(input));
    assert.equal(manifests.state, "failed");
  }
});

test("a conflicting pre-existing object makes the write ambiguous", async () => {
  const { collector, objects, manifests } = setup();
  const key = "runs/workflow%3Aproject-1%3Aissue-1%3Arun%3A1/attempts/attempt-1/transcript.jsonl";
  objects.ambiguousKey = key;
  objects.values.set(key, { content: new Uint8Array(), digest: "different" });
  await assert.rejects(collector.collect(input), /ambiguous create-only write/);
  assert.equal(manifests.state, "failed");
});

test("failure collection preserves every available safe output and records absent files", async () => {
  const { collector, reader, objects, manifests } = setup();
  reader.files.delete("/deos/output/result.json");
  reader.files.set(
    "/deos/output/status.json",
    new TextEncoder().encode(JSON.stringify({ exitCode: 1, signal: null, timedOut: false })),
  );
  reader.files.set("/deos/output/validation.txt", new TextEncoder().encode("codex failed\n"));
  reader.files.set("/deos/output/supervisor-stderr.txt", new TextEncoder().encode("Original process stderr\n"));

  const result = await collector.collectFailure({
    runId: input.runId,
    attemptId: input.attemptId,
    outputRoot: input.outputRoot,
    expectedFiles: ["transcript.jsonl", "result.json", "validation.txt", "patch.diff"],
    fallbackErrorCategory: "supervisor_failed",
  });

  assert.equal(result.safeErrorCategory, "codex_exit_nonzero");
  assert.deepEqual(result.storedFiles, ["status.json", "supervisor-stderr.txt", "transcript.jsonl", "validation.txt"]);
  assert.deepEqual(result.absentFiles, ["original-errors.jsonl", "patch.diff", "result.json"]);
  assert.deepEqual(result.policyRejectedFiles, []);
  assert.equal(result.objectCount, 5);
  assert.equal(manifests.state, "complete");
  assert.equal(objects.values.has(result.manifestKey), true);
  const summaryKey = `runs/${encodeURIComponent(input.runId)}/attempts/${input.attemptId}/failure-artifacts/failure-summary.json`;
  const summary = JSON.parse(new TextDecoder().decode(objects.values.get(summaryKey)?.content));
  assert.equal(summary.safeErrorCategory, "codex_exit_nonzero");
  assert.deepEqual(summary.absentFiles, ["original-errors.jsonl", "patch.diff", "result.json"]);
});

test("failure collection preserves original output verbatim in protected storage", async () => {
  const { collector, reader, objects, manifests } = setup();
  reader.files.set(
    "/deos/output/transcript.jsonl",
    new TextEncoder().encode('{"access_token":"credential-value-that-must-not-escape"}\n'),
  );
  reader.files.set("/deos/output/validation.txt", new TextEncoder().encode("bounded failure\n"));

  const result = await collector.collectFailure({
    runId: input.runId,
    attemptId: input.attemptId,
    outputRoot: input.outputRoot,
    expectedFiles: ["transcript.jsonl", "validation.txt"],
    fallbackErrorCategory: "supervisor_failed",
  });

  assert.deepEqual(result.storedFiles, ["transcript.jsonl", "validation.txt"]);
  assert.deepEqual(result.policyRejectedFiles, []);
  assert.equal(manifests.state, "complete");
  assert.equal(
    [...objects.values.values()].some(({ content }) =>
      new TextDecoder().decode(content).includes("credential-value-that-must-not-escape")),
    true,
  );
});

test("failure collection preserves the trusted author completion category", async () => {
  const { collector, reader } = setup();
  reader.files.set(
    "/deos/output/status.json",
    new TextEncoder().encode(JSON.stringify({
      exitCode: 1,
      signal: null,
      timedOut: false,
      safeErrorCategory: "author_completion_failed",
    })),
  );
  const result = await collector.collectFailure({
    runId: input.runId,
    attemptId: input.attemptId,
    outputRoot: input.outputRoot,
    expectedFiles: ["transcript.jsonl"],
    fallbackErrorCategory: "supervisor_failed",
  });
  assert.equal(result.safeErrorCategory, "author_completion_failed");
});


test("failure collection resumes legacy receipts after partial normal collection without key collisions", async () => {
  const { Miniflare, convertV4MiniflareOptions } = await import('miniflare');
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'receipt-test', modules: true,
    compatibilityDate: '2026-08-26', script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ['DB'] }] }));
  try {
    const db = await mf.getD1Database('DB');
    await db.prepare('CREATE TABLE artifact_manifests (manifest_id TEXT PRIMARY KEY, run_id TEXT, attempt_id TEXT, r2_key TEXT, state TEXT, created_at TEXT, aggregate_digest TEXT, object_count INTEGER, total_bytes INTEGER, completed_at TEXT)').run();
    await db.prepare('CREATE TABLE artifacts (manifest_id TEXT, logical_name TEXT, r2_key TEXT UNIQUE, media_type TEXT, byte_size INTEGER, sha256 TEXT, created_at TEXT, policy_outcome TEXT, PRIMARY KEY(manifest_id,logical_name))').run();
    const { reader, objects } = setup();
    const manifests = new D1ArtifactManifestStore(db as unknown as D1Database);
    const collector = new ArtifactCollector(reader, objects, manifests, () => NOW);
    await assert.rejects(collector.collect({ ...input, requiredFiles: [...input.requiredFiles, 'missing.json'] }), /missing/);
    const prefix = `runs/${encodeURIComponent(input.runId)}/attempts/${input.attemptId}`;
    const legacyName = 'original-errors.jsonl';
    const content = new TextEncoder().encode('{"message":"original failure"}');
    reader.files.set(`/deos/output/${legacyName}`, content);
    const digest = Buffer.from(await crypto.subtle.digest('SHA-256', content)).toString('hex');
    const manifestId = `manifest:${input.attemptId}:failure`;
    await manifests.begin({ manifestId, runId: input.runId, attemptId: input.attemptId, r2Key: `${prefix}/failure-manifest.json`, now: NOW.toISOString() });
    await objects.putCreateOnly(`${prefix}/${legacyName}`, content, digest);
    await manifests.record({ manifestId, logicalName: legacyName, r2Key: `${prefix}/${legacyName}`, mediaType: 'text/plain', byteSize: content.length, sha256: digest, now: NOW.toISOString() });
    await manifests.fail(manifestId);
    const request = { ...input, expectedFiles: [...input.requiredFiles, legacyName], fallbackErrorCategory: 'missing_output' };
    const failure = await collector.collectFailure(request);
    await collector.verifyDurable(failure);
    assert.deepEqual(await collector.collectFailure(request), failure);
    assert.equal(await manifests.artifactKey(manifestId, legacyName), `${prefix}/${legacyName}`);
    assert.equal(await manifests.artifactKey(manifestId, 'transcript.jsonl'), `${prefix}/failure-artifacts/transcript.jsonl`);
    assert.equal(await manifests.artifactKey(`manifest:${input.attemptId}`, 'transcript.jsonl'), `${prefix}/transcript.jsonl`);
  } finally { await mf.dispose(); }
});
