#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

const [authPath] = process.argv.slice(2);
const masterSecret = process.env.CODEX_AUTH_ENCRYPTION_KEY;
if (!authPath || !masterSecret || masterSecret.length < 32) {
  process.stderr.write("usage: CODEX_AUTH_ENCRYPTION_KEY=... encrypt-codex-auth.mjs /path/to/auth.json\n");
  process.exit(2);
}
const plaintext = await readFile(authPath, "utf8");
JSON.parse(plaintext);
const salt = webcrypto.getRandomValues(new Uint8Array(16));
const iv = webcrypto.getRandomValues(new Uint8Array(12));
const material = await webcrypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(masterSecret),
  "HKDF",
  false,
  ["deriveKey"],
);
const key = await webcrypto.subtle.deriveKey(
  { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("deos-codex-auth-v1") },
  material,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const ciphertext = await webcrypto.subtle.encrypt(
  { name: "AES-GCM", iv, additionalData: new TextEncoder().encode("codex-auth.json") },
  key,
  new TextEncoder().encode(plaintext),
);
process.stdout.write(JSON.stringify({
  version: 1,
  salt: Buffer.from(salt).toString("base64"),
  iv: Buffer.from(iv).toString("base64"),
  ciphertext: Buffer.from(ciphertext).toString("base64"),
}));
