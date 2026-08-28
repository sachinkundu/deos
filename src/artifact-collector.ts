export interface SandboxArtifactReader {
  exists(path: string): Promise<boolean>;
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
      "SELECT run_id, attempt_id, r2_key, state FROM artifact_manifests WHERE manifest_id = ?",
    ).bind(input.manifestId).first<{
      run_id: string;
      attempt_id: string;
      r2_key: string;
      state: "pending" | "complete" | "failed";
    }>();
    if (
      stored?.run_id !== input.runId ||
      stored.attempt_id !== input.attemptId ||
      stored.r2_key !== input.r2Key
    ) throw new Error("artifact manifest identity mismatch");
    if (stored.state === "failed") {
      await this.database.prepare(
        "UPDATE artifact_manifests SET state = 'pending' WHERE manifest_id = ? AND state = 'failed'",
      ).bind(input.manifestId).run();
    }
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

export interface ArtifactEvidenceCollectionResult {
  manifestId: string;
  aggregateDigest: string;
  objectCount: number;
  totalBytes: number;
  manifestKey: string;
  manifestSha256: string;
}

export interface ArtifactCollectionResult extends ArtifactEvidenceCollectionResult {
  result: Readonly<Record<string, unknown>>;
  providerReceipts: readonly ProviderReceiptReference[];
}

export interface FailureArtifactCollectionResult extends ArtifactEvidenceCollectionResult {
  safeErrorCategory: string;
  storedFiles: readonly string[];
  absentFiles: readonly string[];
  policyRejectedFiles: readonly string[];
}

export interface FailureArtifactCollectionInput {
  runId: string;
  attemptId: string;
  outputRoot: string;
  expectedFiles: readonly string[];
  fallbackErrorCategory: string;
}

export interface ProviderReceiptReference {
  capability: string;
  operationId: string;
  state: "succeeded" | "reconciled";
  providerResourceId: string | null;
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

const SAFE_SUPERVISOR_ERROR_CATEGORIES = new Set([
  "absolute_timeout",
  "author_completion_failed",
  "codex_exit_nonzero",
  "codex_terminated",
  "supervisor_failed",
]);

const assertArtifactPolicy = (name: string, content: Uint8Array): void => {
  if (name.toLowerCase().includes("auth.json")) throw new Error("credential artifact is forbidden");
  const text = new TextDecoder().decode(content);
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text))) {
    throw new Error(`artifact ${name} contains credential material`);
  }
};

const supervisorErrorCategory = (content: Uint8Array): string | null => {
  try {
    const value = asRecord(JSON.parse(new TextDecoder().decode(content)), "status.json");
    if (value.timedOut === true) return "absolute_timeout";
    if (
      typeof value.safeErrorCategory === "string" &&
      SAFE_SUPERVISOR_ERROR_CATEGORIES.has(value.safeErrorCategory)
    ) return value.safeErrorCategory;
    if (typeof value.exitCode === "number" && Number.isInteger(value.exitCode) && value.exitCode !== 0) {
      return "codex_exit_nonzero";
    }
    if (
      (typeof value.signal === "string" && /^[A-Z0-9]{1,32}$/.test(value.signal)) ||
      (typeof value.signal === "number" && Number.isInteger(value.signal) && value.signal !== 0)
    ) return "codex_terminated";
  } catch {}
  return null;
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
      let providerReceipts: readonly ProviderReceiptReference[] = [];
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
        if (logicalName === "provider-references.json") {
          let parsed: unknown;
          try {
            parsed = JSON.parse(new TextDecoder().decode(file.content));
          } catch {
            throw new Error("provider-references.json is invalid JSON");
          }
          if (!Array.isArray(parsed) || parsed.length > 100) {
            throw new Error("provider-references.json must be a bounded array");
          }
          providerReceipts = Object.freeze(parsed.map((value, index) => {
            const reference = asRecord(value, `provider reference ${index}`);
            const capability = reference.capability;
            const operationId = reference.operationId;
            const state = reference.state;
            const providerResourceId = reference.providerResourceId;
            if (
              typeof capability !== "string" || capability.length === 0 ||
              typeof operationId !== "string" || operationId.length === 0 ||
              !["succeeded", "reconciled"].includes(String(state)) ||
              (providerResourceId !== null && typeof providerResourceId !== "string")
            ) throw new Error(`provider reference ${index} is invalid`);
            return Object.freeze({
              capability,
              operationId,
              state: state as "succeeded" | "reconciled",
              providerResourceId,
            });
          }));
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
        providerReceipts,
        manifestKey,
        manifestSha256: manifestDigest,
      };
    } catch (error) {
      await this.manifests.fail(manifestId);
      throw error;
    }
  }

  async collectFailure(input: FailureArtifactCollectionInput): Promise<FailureArtifactCollectionResult> {
    const manifestId = `manifest:${input.attemptId}:failure`;
    const prefix = `runs/${encodeURIComponent(input.runId)}/attempts/${input.attemptId}`;
    const expectedFiles = [...new Set([...input.expectedFiles, "status.json"])]
      .filter((name) => name.length > 0)
      .sort();
    if (expectedFiles.some((name) => name.includes("/") || name.includes(".."))) {
      throw new Error("failure artifact logical names must be plain filenames");
    }
    const candidates: Array<{
      logicalName: string;
      content: Uint8Array;
      mediaType: string;
      sha256: string;
    }> = [];
    const absentFiles: string[] = [];
    const policyRejectedFiles: string[] = [];
    let totalCandidateBytes = 0;
    let safeErrorCategory = input.fallbackErrorCategory;
    for (const logicalName of expectedFiles) {
      const path = `${input.outputRoot}/${logicalName}`;
      if (!await this.reader.exists(path)) {
        absentFiles.push(logicalName);
        continue;
      }
      const file = await this.reader.read(path);
      if (file.content.byteLength > 10 * 1024 * 1024) {
        policyRejectedFiles.push(logicalName);
        continue;
      }
      if (totalCandidateBytes + file.content.byteLength > 50 * 1024 * 1024) {
        policyRejectedFiles.push(logicalName);
        continue;
      }
      try {
        assertArtifactPolicy(logicalName, file.content);
      } catch {
        policyRejectedFiles.push(logicalName);
        continue;
      }
      totalCandidateBytes += file.content.byteLength;
      if (logicalName === "status.json") {
        safeErrorCategory = supervisorErrorCategory(file.content) ?? safeErrorCategory;
      }
      candidates.push({
        logicalName,
        content: file.content,
        mediaType: file.mediaType,
        sha256: await sha256Hex(file.content),
      });
    }
    const summaryName = "failure-summary.json";
    const summaryContent = new TextEncoder().encode(JSON.stringify({
      version: 1,
      attemptId: input.attemptId,
      safeErrorCategory,
      storedFiles: candidates.map(({ logicalName }) => logicalName),
      absentFiles,
      policyRejectedFiles,
    }));
    candidates.push({
      logicalName: summaryName,
      content: summaryContent,
      mediaType: "application/json",
      sha256: await sha256Hex(summaryContent),
    });
    await this.manifests.begin({
      manifestId,
      runId: input.runId,
      attemptId: input.attemptId,
      r2Key: `${prefix}/failure-manifest.json`,
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
      for (const candidate of candidates) {
        const r2Key = `${prefix}/${candidate.logicalName}`;
        const disposition = await this.objects.putCreateOnly(
          r2Key,
          candidate.content,
          candidate.sha256,
          candidate.mediaType,
        );
        if (disposition === "already_exists" && await this.objects.sha256(r2Key) !== candidate.sha256) {
          throw new Error(`artifact ${candidate.logicalName} has an ambiguous create-only write`);
        }
        const entry = {
          logicalName: candidate.logicalName,
          r2Key,
          mediaType: candidate.mediaType,
          byteSize: candidate.content.byteLength,
          sha256: candidate.sha256,
        };
        entries.push(entry);
        totalBytes += entry.byteSize;
        await this.manifests.record({ manifestId, ...entry, now: this.now().toISOString() });
      }
      const aggregateDigest = await sha256Hex(JSON.stringify(entries));
      const manifestBytes = new TextEncoder().encode(JSON.stringify({
        version: 1,
        kind: "failure-evidence",
        manifestId,
        runId: input.runId,
        attemptId: input.attemptId,
        aggregateDigest,
        entries,
      }));
      const manifestKey = `${prefix}/failure-manifest.json`;
      const manifestSha256 = await sha256Hex(manifestBytes);
      const disposition = await this.objects.putCreateOnly(
        manifestKey,
        manifestBytes,
        manifestSha256,
        "application/json",
      );
      if (disposition === "already_exists" && await this.objects.sha256(manifestKey) !== manifestSha256) {
        throw new Error("failure artifact manifest has an ambiguous create-only write");
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
        manifestKey,
        manifestSha256,
        safeErrorCategory,
        storedFiles: candidates
          .map(({ logicalName }) => logicalName)
          .filter((name) => name !== summaryName),
        absentFiles,
        policyRejectedFiles,
      };
    } catch (error) {
      await this.manifests.fail(manifestId);
      throw error;
    }
  }

  async verifyAfterCleanup(result: ArtifactEvidenceCollectionResult): Promise<void> {
    await this.verifyDurable(result);
  }

  async verifyDurable(result: ArtifactEvidenceCollectionResult): Promise<void> {
    if (await this.objects.sha256(result.manifestKey) !== result.manifestSha256) {
      throw new Error("artifact manifest retrieval verification failed");
    }
  }
}
