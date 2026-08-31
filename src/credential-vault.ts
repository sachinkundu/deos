export interface CredentialLeaseStore {
  acquire(input: {
    profileId: string;
    attemptId: string;
    encryptedObjectKey: string;
    objectVersion: string | null;
    objectEtag: string | null;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean>;
  recordRefresh(
    profileId: string,
    attemptId: string,
    outcome: string,
    objectVersion: string | null,
    objectEtag: string | null,
    now: string,
  ): Promise<void>;
  release(profileId: string, attemptId: string): Promise<void>;
  find(profileId: string, attemptId: string): Promise<{
    profile_id: string;
    attempt_id: string;
    encrypted_object_key: string;
    object_version: string | null;
    object_etag: string | null;
  } | null>;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1CredentialLeaseStore implements CredentialLeaseStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async acquire(input: {
    profileId: string;
    attemptId: string;
    encryptedObjectKey: string;
    objectVersion: string | null;
    objectEtag: string | null;
    leaseExpiresAt: string;
    now: string;
  }): Promise<boolean> {
    await this.database.prepare(
      "DELETE FROM credential_leases WHERE profile_id = ? AND lease_expires_at <= ?",
    ).bind(input.profileId, input.now).run();
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO credential_leases
       (profile_id, attempt_id, encrypted_object_key, object_version, object_etag,
        lease_expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.profileId,
      input.attemptId,
      input.encryptedObjectKey,
      input.objectVersion,
      input.objectEtag,
      input.leaseExpiresAt,
      input.now,
      input.now,
    ).run();
    return changes(result) === 1;
  }

  async recordRefresh(
    profileId: string,
    attemptId: string,
    outcome: string,
    objectVersion: string | null,
    objectEtag: string | null,
    now: string,
  ): Promise<void> {
    await this.database.prepare(
      `UPDATE credential_leases
       SET refresh_outcome = ?, object_version = ?, object_etag = ?, updated_at = ?
       WHERE profile_id = ? AND attempt_id = ?`,
    ).bind(outcome, objectVersion, objectEtag, now, profileId, attemptId).run();
  }

  async release(profileId: string, attemptId: string): Promise<void> {
    await this.database.prepare(
      "DELETE FROM credential_leases WHERE profile_id = ? AND attempt_id = ?",
    ).bind(profileId, attemptId).run();
  }

  find(profileId: string, attemptId: string): Promise<{
    profile_id: string;
    attempt_id: string;
    encrypted_object_key: string;
    object_version: string | null;
    object_etag: string | null;
  } | null> {
    return this.database.prepare(
      `SELECT profile_id, attempt_id, encrypted_object_key, object_version, object_etag
       FROM credential_leases WHERE profile_id = ? AND attempt_id = ?`,
    ).bind(profileId, attemptId).first();
  }
}

export interface ProtectedObject {
  etag: string;
  version: string;
  text(): Promise<string>;
}

export interface ProtectedObjectStore {
  get(key: string): Promise<ProtectedObject | null>;
  put(
    key: string,
    value: string,
    options: { onlyIf: { etagMatches?: string; doesNotExist?: boolean } },
  ): Promise<{ etag: string; version: string } | null>;
}

export class R2ProtectedObjectStore implements ProtectedObjectStore {
  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async get(key: string): Promise<ProtectedObject | null> {
    const object = await this.bucket.get(key);
    if (object === null) return null;
    return {
      etag: object.etag,
      version: object.version,
      text: () => object.text(),
    };
  }

  async put(
    key: string,
    value: string,
    options: { onlyIf: { etagMatches?: string; doesNotExist?: boolean } },
  ): Promise<{ etag: string; version: string } | null> {
    const onlyIf: R2Conditional = options.onlyIf.doesNotExist
      ? { etagDoesNotMatch: "*" }
      : { etagMatches: options.onlyIf.etagMatches };
    const object = await this.bucket.put(key, value, {
      onlyIf,
      httpMetadata: { contentType: "application/json" },
      customMetadata: { classification: "protected-codex-auth-v1" },
    });
    return object === null ? null : { etag: object.etag, version: object.version };
  }
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
  if (masterSecret.length < 32) throw new Error("credential encryption key is too short");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("deos-codex-auth-v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
};

export const encryptCredential = async (plaintext: string, masterSecret: string): Promise<string> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterSecret, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("codex-auth.json") },
    key,
    new TextEncoder().encode(plaintext),
  );
  const envelope: EncryptedEnvelope = {
    version: 1,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
};

export const decryptCredential = async (encoded: string, masterSecret: string): Promise<string> => {
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(encoded) as EncryptedEnvelope;
  } catch {
    throw new Error("credential envelope is invalid");
  }
  if (envelope.version !== 1 || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error("credential envelope is unsupported");
  }
  try {
    const salt = base64ToBytes(envelope.salt);
    const iv = base64ToBytes(envelope.iv);
    const key = await deriveKey(masterSecret, salt);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("codex-auth.json") },
      key,
      base64ToBytes(envelope.ciphertext),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("credential envelope authentication failed");
  }
};

export interface CredentialLease {
  profileId: string;
  attemptId: string;
  objectKey: string;
  sourceEtag: string;
  sourceVersion: string;
  plaintext: string;
}

export class CredentialVault {
  private readonly objects: ProtectedObjectStore;
  private readonly leases: CredentialLeaseStore;
  private readonly masterSecret: string;
  private readonly now: () => Date;

  constructor(
    objects: ProtectedObjectStore,
    leases: CredentialLeaseStore,
    masterSecret: string,
    now: () => Date = () => new Date(),
  ) {
    this.objects = objects;
    this.leases = leases;
    this.masterSecret = masterSecret;
    this.now = now;
  }

  async acquire(profileId: string, attemptId: string, leaseDurationMs: number): Promise<CredentialLease> {
    const objectKey = `credentials/${profileId}/auth.v1.enc`;
    const object = await this.objects.get(objectKey);
    if (object === null) throw new Error("Codex credential seed is missing");
    const now = this.now();
    const acquired = await this.leases.acquire({
      profileId,
      attemptId,
      encryptedObjectKey: objectKey,
      objectVersion: object.version,
      objectEtag: object.etag,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs).toISOString(),
      now: now.toISOString(),
    });
    if (!acquired) throw new Error("Codex credential lease already exists for this attempt");
    try {
      const plaintext = await decryptCredential(await object.text(), this.masterSecret);
      JSON.parse(plaintext);
      return {
        profileId,
        attemptId,
        objectKey,
        sourceEtag: object.etag,
        sourceVersion: object.version,
        plaintext,
      };
    } catch (error) {
      await this.leases.release(profileId, attemptId);
      throw error;
    }
  }

  async replaceAndRelease(lease: CredentialLease, refreshedPlaintext: string): Promise<void> {
    try {
      JSON.parse(refreshedPlaintext);
      const encrypted = await encryptCredential(refreshedPlaintext, this.masterSecret);
      const replaced = await this.objects.put(lease.objectKey, encrypted, {
        onlyIf: { etagMatches: lease.sourceEtag },
      });
      if (replaced === null) {
        const current = await this.objects.get(lease.objectKey);
        let validConcurrentRefresh = false;
        if (current !== null && current.etag !== lease.sourceEtag) {
          try {
            JSON.parse(await decryptCredential(await current.text(), this.masterSecret));
            validConcurrentRefresh = true;
          } catch {
            validConcurrentRefresh = false;
          }
        }
        if (current !== null && validConcurrentRefresh) {
          await this.leases.recordRefresh(
            lease.profileId,
            lease.attemptId,
            "concurrent_refresh_preserved",
            current.version,
            current.etag,
            this.now().toISOString(),
          );
          return;
        }
        await this.leases.recordRefresh(
          lease.profileId,
          lease.attemptId,
          "conditional_replace_failed",
          lease.sourceVersion,
          lease.sourceEtag,
          this.now().toISOString(),
        );
        throw new Error("refreshed credential replacement is ambiguous");
      }
      await this.leases.recordRefresh(
        lease.profileId,
        lease.attemptId,
        "replaced",
        replaced.version,
        replaced.etag,
        this.now().toISOString(),
      );
    } finally {
      await this.leases.release(lease.profileId, lease.attemptId);
    }
  }

  release(lease: CredentialLease): Promise<void> {
    return this.leases.release(lease.profileId, lease.attemptId);
  }

  async resume(profileId: string, attemptId: string): Promise<CredentialLease> {
    const lease = await this.leases.find(profileId, attemptId);
    if (
      lease === null ||
      lease.object_etag === null ||
      lease.object_version === null
    ) throw new Error("Codex credential lease is missing");
    return {
      profileId,
      attemptId,
      objectKey: lease.encrypted_object_key,
      sourceEtag: lease.object_etag,
      sourceVersion: lease.object_version,
      plaintext: "",
    };
  }
}
