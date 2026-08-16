import assert from "node:assert/strict";
import test from "node:test";

import {
  CredentialVault,
  decryptCredential,
  encryptCredential,
  type CredentialLeaseStore,
  type ProtectedObject,
  type ProtectedObjectStore,
} from "../src/credential-vault.ts";

const MASTER = "test-only-master-secret-with-at-least-thirty-two-bytes";
const NOW = new Date("2026-08-16T08:00:00.000Z");

class ObjectStore implements ProtectedObjectStore {
  readonly objects = new Map<string, { value: string; etag: string; version: string }>();
  rejectConditional = false;

  get(key: string): Promise<ProtectedObject | null> {
    const object = this.objects.get(key);
    if (object === undefined) return Promise.resolve(null);
    return Promise.resolve({
      etag: object.etag,
      version: object.version,
      text: () => Promise.resolve(object.value),
    });
  }

  put(
    key: string,
    value: string,
    options: { onlyIf: { etagMatches?: string; doesNotExist?: boolean } },
  ) {
    const existing = this.objects.get(key);
    if (
      this.rejectConditional ||
      (options.onlyIf.doesNotExist && existing !== undefined) ||
      (options.onlyIf.etagMatches !== undefined && existing?.etag !== options.onlyIf.etagMatches)
    ) return Promise.resolve(null);
    const sequence = Number(existing?.version ?? "0") + 1;
    const stored = { value, etag: `etag-${sequence}`, version: String(sequence) };
    this.objects.set(key, stored);
    return Promise.resolve({ etag: stored.etag, version: stored.version });
  }
}

class LeaseStore implements CredentialLeaseStore {
  readonly active = new Map<string, string>();
  readonly refreshes: string[] = [];

  acquire(input: { profileId: string; attemptId: string }) {
    if (this.active.has(input.profileId)) return Promise.resolve(false);
    this.active.set(input.profileId, input.attemptId);
    return Promise.resolve(true);
  }

  recordRefresh(_profile: string, _attempt: string, outcome: string) {
    this.refreshes.push(outcome);
    return Promise.resolve();
  }

  async release(profileId: string, attemptId: string) {
    if (this.active.get(profileId) === attemptId) this.active.delete(profileId);
  }

  find(profileId: string, attemptId: string) {
    if (this.active.get(profileId) !== attemptId) return Promise.resolve(null);
    return Promise.resolve({
      profile_id: profileId,
      attempt_id: attemptId,
      encrypted_object_key: `credentials/${profileId}/auth.v1.enc`,
      object_version: "1",
      object_etag: "etag-1",
    });
  }
}

test("authenticated envelope round-trips and rejects the wrong key", async () => {
  const plaintext = JSON.stringify({ tokens: { access_token: "secret-value" } });
  const encrypted = await encryptCredential(plaintext, MASTER);
  assert.equal(encrypted.includes("secret-value"), false);
  assert.equal(await decryptCredential(encrypted, MASTER), plaintext);
  await assert.rejects(
    decryptCredential(encrypted, `${MASTER}-wrong`),
    /authentication failed/,
  );
});

test("vault leases one profile and conditionally preserves refreshed auth", async () => {
  const objects = new ObjectStore();
  const leases = new LeaseStore();
  const key = "credentials/trial/auth.v1.enc";
  objects.objects.set(key, {
    value: await encryptCredential(JSON.stringify({ auth: "initial" }), MASTER),
    etag: "etag-1",
    version: "1",
  });
  const vault = new CredentialVault(objects, leases, MASTER, () => NOW);
  const lease = await vault.acquire("trial", "attempt-1", 60_000);
  await assert.rejects(
    vault.acquire("trial", "attempt-2", 60_000),
    /already leased/,
  );
  await vault.replaceAndRelease(lease, JSON.stringify({ auth: "refreshed" }));

  assert.deepEqual(leases.refreshes, ["replaced"]);
  assert.equal(leases.active.size, 0);
  const stored = objects.objects.get(key);
  assert.equal(await decryptCredential(stored?.value ?? "", MASTER), JSON.stringify({ auth: "refreshed" }));
});

test("conditional replacement failure is recorded and releases the lease", async () => {
  const objects = new ObjectStore();
  const leases = new LeaseStore();
  const key = "credentials/trial/auth.v1.enc";
  objects.objects.set(key, {
    value: await encryptCredential(JSON.stringify({ auth: "initial" }), MASTER),
    etag: "etag-1",
    version: "1",
  });
  const vault = new CredentialVault(objects, leases, MASTER, () => NOW);
  const lease = await vault.acquire("trial", "attempt-1", 60_000);
  objects.rejectConditional = true;

  await assert.rejects(
    vault.replaceAndRelease(lease, JSON.stringify({ auth: "refreshed" })),
    /replacement is ambiguous/,
  );
  assert.deepEqual(leases.refreshes, ["conditional_replace_failed"]);
  assert.equal(leases.active.size, 0);
});

test("invalid decrypted JSON releases a credential lease", async () => {
  const objects = new ObjectStore();
  const leases = new LeaseStore();
  objects.objects.set("credentials/trial/auth.v1.enc", {
    value: await encryptCredential("not-json", MASTER),
    etag: "etag-1",
    version: "1",
  });
  const vault = new CredentialVault(objects, leases, MASTER, () => NOW);
  await assert.rejects(vault.acquire("trial", "attempt-1", 60_000));
  assert.equal(leases.active.size, 0);
});
