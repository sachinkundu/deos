import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

interface BundleManifest {
  sourceRevision: string;
  files: Array<{ path: string; sha256: string }>;
}

const bundleRoot = fileURLToPath(new URL("../vendor/bettaview/", import.meta.url));
const maintainedRoot = fileURLToPath(new URL("../portal/bettaview/", import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL("../vendor/bettaview/bundle-manifest.json", import.meta.url), "utf8"),
) as BundleManifest;

test("the pinned BettaView manifest matches every vendored review asset", () => {
  assert.match(manifest.sourceRevision, /^[0-9a-f]{40}$/);
  assert.ok(manifest.files.length > 0);

  for (const file of manifest.files) {
    const bytes = readFileSync(`${bundleRoot}${file.path}`);
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(digest, file.sha256, file.path);
  }
});

test("the container's vendored BettaView assets match the maintained portal sources", () => {
  for (const file of manifest.files) {
    assert.deepEqual(
      readFileSync(`${bundleRoot}${file.path}`),
      readFileSync(`${maintainedRoot}${file.path}`),
      file.path,
    );
  }
});
