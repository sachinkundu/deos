import type { OpenRouterFailureDiagnostic } from "./openrouter-review.ts";

export interface ProviderDiagnosticWriter {
  record(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    provider: "openrouter";
    safeCategory: string;
    diagnostic: OpenRouterFailureDiagnostic;
    now: string;
  }): Promise<string>;
}

interface EncryptedEnvelope {
  version: 1;
  salt: string;
  iv: string;
  ciphertext: string;
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const deriveKey = async (masterSecret: string, salt: Uint8Array): Promise<CryptoKey> => {
  if (masterSecret.length < 32) throw new Error("provider diagnostic encryption key is too short");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: new TextEncoder().encode("deos-provider-diagnostic-v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptProviderDiagnostic = async (
  plaintext: string,
  masterSecret: string,
): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterSecret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: new TextEncoder().encode("provider-diagnostic.json"),
    },
    key,
    new TextEncoder().encode(plaintext),
  );
  return JSON.stringify({
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  } satisfies EncryptedEnvelope);
};

export const decryptProviderDiagnostic = async (
  encoded: string,
  masterSecret: string,
): Promise<string> => {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(encoded) as EncryptedEnvelope;
  } catch {
    throw new Error("provider diagnostic envelope is invalid");
  }
  if (envelope.version !== 1 || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error("provider diagnostic envelope is unsupported");
  }
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveKey(masterSecret, salt);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode("provider-diagnostic.json"),
      },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("provider diagnostic decryption failed");
  }
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const diagnosticIdentity = async (operationId: string): Promise<string> =>
  `diagnostic:provider:${await sha256Hex(operationId)}`;

const accessPolicy = JSON.stringify({
  version: 1,
  audience: "operator",
  classification: "protected-provider-diagnostic-v1",
});

export class D1R2ProviderDiagnosticStore implements ProviderDiagnosticWriter {
  private readonly database: D1Database;
  private readonly bucket: R2Bucket;
  private readonly masterSecret: string;

  constructor(database: D1Database, bucket: R2Bucket, masterSecret: string) {
    this.database = database;
    this.bucket = bucket;
    this.masterSecret = masterSecret;
  }

  async record(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    provider: "openrouter";
    safeCategory: string;
    diagnostic: OpenRouterFailureDiagnostic;
    now: string;
  }): Promise<string> {
    const diagnosticId = await diagnosticIdentity(input.operationId);
    const r2Key = `protected/provider-diagnostics/${diagnosticId}.json.enc`;
    const payload = JSON.stringify({
      version: 1,
      diagnosticId,
      operationId: input.operationId,
      runId: input.runId,
      attemptId: input.attemptId,
      provider: input.provider,
      safeCategory: input.safeCategory,
      observedAt: input.now,
      ...input.diagnostic,
    });
    const payloadSha256 = await sha256Hex(payload);
    const existing = await this.bucket.get(r2Key);
    if (existing === null) {
      const encrypted = await encryptProviderDiagnostic(payload, this.masterSecret);
      await this.bucket.put(r2Key, encrypted, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          classification: "protected-provider-diagnostic-v1",
          plaintextSha256: payloadSha256,
        },
      });
    } else {
      const recovered = await decryptProviderDiagnostic(await existing.text(), this.masterSecret);
      if (await sha256Hex(recovered) !== payloadSha256) {
        throw new Error("provider diagnostic object conflict");
      }
    }
    const readBack = await this.bucket.get(r2Key);
    if (readBack === null) throw new Error("provider diagnostic object is missing after write");
    const recovered = await decryptProviderDiagnostic(await readBack.text(), this.masterSecret);
    if (await sha256Hex(recovered) !== payloadSha256) {
      throw new Error("provider diagnostic object read-back failed");
    }
    await this.database.prepare(
      `INSERT OR IGNORE INTO diagnostics
       (diagnostic_id, run_id, attempt_id, stage, encrypted_r2_key, safe_category,
        access_policy_json, created_at, operation_id, provider, failure_stage,
        http_status, provider_code, provider_type, provider_request_id,
        response_content_type, response_body_sha256, response_truncated,
        request_may_have_succeeded, retryable, safe_message)
       VALUES (?, ?, ?, 'provider.openrouter', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      diagnosticId,
      input.runId,
      input.attemptId,
      r2Key,
      input.safeCategory,
      accessPolicy,
      input.now,
      input.operationId,
      input.provider,
      input.diagnostic.stage,
      input.diagnostic.httpStatus,
      input.diagnostic.providerCode,
      input.diagnostic.providerType,
      input.diagnostic.providerRequestId,
      input.diagnostic.responseContentType,
      input.diagnostic.responseBodySha256,
      input.diagnostic.responseTruncated ? 1 : 0,
      input.diagnostic.requestMayHaveSucceeded ? 1 : 0,
      input.diagnostic.retryable ? 1 : 0,
      input.diagnostic.providerMessage,
    ).run();
    const stored = await this.database.prepare(
      `SELECT operation_id, encrypted_r2_key, safe_category, failure_stage,
              response_body_sha256
       FROM diagnostics WHERE diagnostic_id = ?`,
    ).bind(diagnosticId).first<{
      operation_id: string | null;
      encrypted_r2_key: string;
      safe_category: string;
      failure_stage: string | null;
      response_body_sha256: string | null;
    }>();
    if (
      stored?.operation_id !== input.operationId || stored.encrypted_r2_key !== r2Key ||
      stored.safe_category !== input.safeCategory || stored.failure_stage !== input.diagnostic.stage ||
      stored.response_body_sha256 !== input.diagnostic.responseBodySha256
    ) throw new Error("provider diagnostic D1 read-back failed");
    return diagnosticId;
  }
}
