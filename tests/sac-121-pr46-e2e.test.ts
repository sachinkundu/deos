import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const markerUrl = new URL("../canary/sac-121-pr46-e2e.txt", import.meta.url);

test("SAC-121 PR #46 canary marker has the exact required bytes", async () => {
  const marker = await readFile(markerUrl);
  const expected = Buffer.from("sac-121-pr46-live-e2e\n", "utf8");

  assert.deepEqual(marker, expected);
});
