export interface SandboxArtifactReader {
  read(path: string): Promise<{ content: Uint8Array; mediaType: string }>;
}

export interface ArtifactObjectStore {
  putCreateOnly(
    key: string,
    content: Uint8Array,
    sha256: string,
    mediaType: string,
  ): Promise<"created" | "already_exists">;
  sha256(key: string): Promise<string | null>;
}

export interface ArtifactManifestStore {
  begin(input: {
    manifestId: string;
    runId: string;
    attemptId: string;
    r2Key: string;
    now: string;
  }): Promise<void>;
  record(input: {
    manifestId: string;
    logicalName: string;
    r2Key: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    now: string;
  }): Promise<void>;
  complete(input: {
    manifestId: string;
    aggregateDigest: string;
    objectCount: number;
    totalBytes: number;
    now: string;
  }): Promise<void>;
  fail(manifestId: string): Promise<void>;
}

export class D1ArtifactManifestStore implements ArtifactManifestStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async begin(input: {
    manifestId: string;
    runId: string;
    attemptId: string;
    r2Key: string;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO artifact_manifests
       (manifest_id, run_id, attempt_id, r2_key, state, created_at)
       VALUES (?, ?, ?, ?, 'pending', ?)`,
    ).bind(input.manifestId, input.runId, input.attemptId, input.r2Key, input.now).run();
    const stored = await this.database.prepare(
      "SELECT run_id, attempt_id, r2_key FROM artifact_manifests WHERE manifest_id = ?",
    ).bind(input.manifestId).first<{ run_id: string; attempt_id: string; r2_key: string }>();
    if (
      stored?.run_id !== input.runId ||
      stored.attempt_id !== input.attemptId ||
      stored.r2_key !== input.r2Key
    ) throw new Error("artifact manifest identity mismatch");
  }

  async record(input: {
    manifestId: string;
    logicalName: string;
    r2Key: string;
    mediaType: string;
    byteSize: number;
    sha256: string;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO artifacts
       (manifest_id, logical_name, r2_key, media_type, byte_size, sha256, created_at, policy_outcome)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'accepted')`,
    ).bind(
      input.manifestId,
      input.logicalName,
      input.r2Key,
      input.mediaType,
      input.byteSize,
      input.sha256,
      input.now,
    ).run();
    const stored = await this.database.prepare(
      "SELECT r2_key, byte_size, sha256 FROM artifacts WHERE manifest_id = ? AND logical_name = ?",
    ).bind(input.manifestId, input.logicalName).first<{
      r2_key: string;
      byte_size: number;
      sha256: string;
    }>();
    if (
      stored?.r2_key !== input.r2Key ||
      stored.byte_size !== input.byteSize ||
      stored.sha256 !== input.sha256
    ) throw new Error("artifact receipt mismatch");
  }

  async complete(input: {
    manifestId: string;
    aggregateDigest: string;
    objectCount: number;
    totalBytes: number;
    now: string;
  }): Promise<void> {
    await this.database.prepare(
      `UPDATE artifact_manifests
       SET state = 'complete', aggregate_digest = ?, object_count = ?, total_bytes = ?, completed_at = ?
       WHERE manifest_id = ? AND state IN ('pending', 'complete')`,
    ).bind(
      input.aggregateDigest,
      input.objectCount,
      input.totalBytes,
      input.now,
      input.manifestId,
    ).run();
  }

  async fail(manifestId: string): Promise<void> {
    await this.database.prepare(
      "UPDATE artifact_manifests SET state = 'failed' WHERE manifest_id = ? AND state = 'pending'",
    ).bind(manifestId).run();
  }
}

export class R2ArtifactObjectStore implements ArtifactObjectStore {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async putCreateOnly(
    key: string,
    content: Uint8Array,
    sha256: string,
    mediaType: string,
  ): Promise<"created" | "already_exists"> {
    const result = await this.bucket.put(key, content, {
      onlyIf: { etagDoesNotMatch: "*" },
      sha256,
      httpMetadata: { contentType: mediaType },
      customMetadata: { policy: "deos-artifact-v1" },
    });
    return result === null ? "already_exists" : "created";
  }

  async sha256(key: string): Promise<string | null> {
    const object = await this.bucket.head(key);
    return object?.checksums.toJSON().sha256 ?? null;
  }
}

export interface ArtifactCollectionInput {
  runId: string;
  attemptId: string;
  outputRoot: string;
  requiredFiles: readonly string[];
  resultSchema: Readonly<Record<string, unknown>>;
}

export interface ArtifactCollectionResult {
  manifestId: string;
  aggregateDigest: string;
  objectCount: number;
  totalBytes: number;
  result: Readonly<Record<string, unknown>>;
  manifestKey: string;
  manifestSha256: string;
}

const sha256Hex = async (value: Uint8Array | string): Promise<string> => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const validateSchema = (value: unknown, schemaValue: unknown, path = "result"): void => {
  const schema = asRecord(schemaValue, `${path} schema`);
  if (schema.type === "object") {
    const record = asRecord(value, path);
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (typeof key === "string" && !(key in record)) throw new Error(`${path}.${key} is required`);
    }
    const properties = schema.properties === undefined
      ? {}
      : asRecord(schema.properties, `${path} properties`);
    if (schema.additionalProperties === false) {
      const unknown = Object.keys(record).find((key) => !(key in properties));
      if (unknown !== undefined) throw new Error(`${path}.${unknown} is not allowed`);
    }
    for (const [key, nested] of Object.entries(record)) {
      if (properties[key] !== undefined) validateSchema(nested, properties[key], `${path}.${key}`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
    if (schema.items !== undefined) {
      value.forEach((entry, index) => validateSchema(entry, schema.items, `${path}[${index}]`));
    }
  } else if (schema.type === "string") {
    if (typeof value !== "string") throw new Error(`${path} must be a string`);
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      throw new Error(`${path} is too short`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      throw new Error(`${path} is too long`);
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw new Error(`${path} is not an allowed value`);
  }
};

const CREDENTIAL_PATTERNS = [
  /"(?:access_token|refresh_token|id_token)"\s*:\s*"[^"\n]+"/i,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

const assertArtifactPolicy = (name: string, content: Uint8Array): void => {
  if (name.toLowerCase().includes("auth.json")) throw new Error("credential artifact is forbidden");
  const text = new TextDecoder().decode(content);
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`artifact ${name} contains credential material`);
  }
};

export class ArtifactCollector {
  private readonly reader: SandboxArtifactReader;
  private readonly objects: ArtifactObjectStore;
  private readonly manifests: ArtifactManifestStore;
  private readonly now: () => Date;

  constructor(
    reader: SandboxArtifactReader,
    objects: ArtifactObjectStore,
    manifests: ArtifactManifestStore,
    now: () => Date = () => new Date(),
  ) {
    this.reader = reader;
    this.objects = objects;
    this.manifests = manifests;
    this.now = now;
  }

  async collect(input: ArtifactCollectionInput): Promise<ArtifactCollectionResult> {
    const manifestId = `manifest:${input.attemptId}`;
    const prefix = `runs/${encodeURIComponent(input.runId)}/attempts/${input.attemptId}`;
    await this.manifests.begin({
      manifestId,
      runId: input.runId,
      attemptId: input.attemptId,
      r2Key: `${prefix}/manifest.json`,
      now: this.now().toISOString(),
    });
    try {
      const entries: Array<{
        logicalName: string;
        r2Key: string;
        mediaType: string;
        byteSize: number;
        sha256: string;
      }> = [];
      let totalBytes = 0;
      let result: Readonly<Record<string, unknown>> | null = null;
      for (const logicalName of input.requiredFiles) {
        if (logicalName.includes("/") || logicalName.includes("..")) {
          throw new Error("artifact logical names must be plain filenames");
        }
        const file = await this.reader.read(`${input.outputRoot}/${logicalName}`);
        if (file.content.byteLength > 10 * 1024 * 1024) throw new Error(`artifact ${logicalName} is too large`);
        totalBytes += file.content.byteLength;
        if (totalBytes > 50 * 1024 * 1024) throw new Error("artifact set is too large");
        assertArtifactPolicy(logicalName, file.content);
        if (logicalName === "result.json") {
          let parsed: unknown;
          try {
            parsed = JSON.parse(new TextDecoder().decode(file.content));
          } catch {
            throw new Error("result.json is invalid JSON");
          }
          validateSchema(parsed, input.resultSchema);
          result = Object.freeze(asRecord(parsed, "result"));
        }
        const digest = await sha256Hex(file.content);
        const r2Key = `${prefix}/${logicalName}`;
        const disposition = await this.objects.putCreateOnly(r2Key, file.content, digest, file.mediaType);
        if (disposition === "already_exists" && await this.objects.sha256(r2Key) !== digest) {
          throw new Error(`artifact ${logicalName} has an ambiguous create-only write`);
        }
        const entry = {
          logicalName,
          r2Key,
          mediaType: file.mediaType,
          byteSize: file.content.byteLength,
          sha256: digest,
        };
        entries.push(entry);
        await this.manifests.record({ manifestId, ...entry, now: this.now().toISOString() });
      }
      if (result === null) throw new Error("result.json is required");
      const aggregateDigest = await sha256Hex(JSON.stringify(entries));
      const manifestBytes = new TextEncoder().encode(JSON.stringify({
        version: 1,
        manifestId,
        runId: input.runId,
        attemptId: input.attemptId,
        aggregateDigest,
        entries,
      }));
      const manifestKey = `${prefix}/manifest.json`;
      const manifestDigest = await sha256Hex(manifestBytes);
      const manifestDisposition = await this.objects.putCreateOnly(
        manifestKey,
        manifestBytes,
        manifestDigest,
        "application/json",
      );
      if (manifestDisposition === "already_exists" && await this.objects.sha256(manifestKey) !== manifestDigest) {
        throw new Error("artifact manifest has an ambiguous create-only write");
      }
      await this.manifests.complete({
        manifestId,
        aggregateDigest,
        objectCount: entries.length,
        totalBytes,
        now: this.now().toISOString(),
      });
      return {
        manifestId,
        aggregateDigest,
        objectCount: entries.length,
        totalBytes,
        result,
        manifestKey,
        manifestSha256: manifestDigest,
      };
    } catch (error) {
      await this.manifests.fail(manifestId);
      throw error;
    }
  }

  async verifyAfterCleanup(result: ArtifactCollectionResult): Promise<void> {
    if (await this.objects.sha256(result.manifestKey) !== result.manifestSha256) {
      throw new Error("artifact manifest retrieval verification failed after cleanup");
    }
  }
}
