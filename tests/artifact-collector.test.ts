import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactCollector,
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

  read(path: string) {
    const content = this.files.get(path);
    if (content === undefined) return Promise.reject(new Error("missing file"));
    return Promise.resolve({ content, mediaType: path.endsWith(".json") ? "application/json" : "text/plain" });
  }
}

class Objects implements ArtifactObjectStore {
  readonly values = new Map<string, { content: Uint8Array; digest: string }>();
  ambiguousKey: string | null = null;

  putCreateOnly(key: string, content: Uint8Array, sha256: string) {
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

test("same-digest objects reconcile after an ambiguous create response", async () => {
  const { collector, objects } = setup();
  const first = await collector.collect(input);
  const second = await collector.collect(input);
  assert.equal(second.aggregateDigest, first.aggregateDigest);
});

test("missing files, invalid results, and credentials fail the manifest", async () => {
  for (const configure of [
    (reader: Reader) => reader.files.delete("/deos/output/transcript.jsonl"),
    (reader: Reader) => reader.files.set(
      "/deos/output/result.json",
      new TextEncoder().encode(JSON.stringify({ outcome: "invented", summary: "bad" })),
    ),
    (reader: Reader) => reader.files.set(
      "/deos/output/transcript.jsonl",
      new TextEncoder().encode('{"access_token":"credential-value-that-must-not-escape"}'),
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
