import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptProviderDiagnostic,
  encryptProviderDiagnostic,
} from "../src/provider-diagnostics.ts";

const SECRET = "test-provider-diagnostic-key-with-at-least-thirty-two-bytes";

test("provider diagnostic envelope is encrypted and decrypts with the operator key", async () => {
  const plaintext = JSON.stringify({ providerMessage: "invalid schema", raw: "protected body" });
  const encrypted = await encryptProviderDiagnostic(plaintext, SECRET);
  assert.equal(encrypted.includes("invalid schema"), false);
  assert.equal(encrypted.includes("protected body"), false);
  assert.equal(await decryptProviderDiagnostic(encrypted, SECRET), plaintext);
  await assert.rejects(
    decryptProviderDiagnostic(encrypted, "different-provider-diagnostic-key-that-is-long-enough"),
    /decryption failed/,
  );
});
