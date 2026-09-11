import assert from "node:assert/strict";
import test from "node:test";
import { claudeReadCommand } from "../container/claude-review-read.mjs";
import { readSnapshot } from "../container/native-review-read.mjs";

test("Claude root listing aliases expose only the frozen inventory", async () => {
  const paths = ["openspec/changes/sample/design.md", "README.md"];
  const state = { phase: "design", change: "sample", before: [],
    reviewJob: { materializedContext: JSON.stringify({ designReview: { sources: paths.map(path => ({ path })) } }) } };
  for (const command of ["ls", "ls .", "ls ./", "ls /deos/workspace/repository", "ls /deos/workspace/repository/"]) {
    assert.equal(await readSnapshot(claudeReadCommand(command), state), paths.join("\n") + "\n");
  }
  for (const command of ["ls /deos", "ls /deos/claude", "ls ..", "ls -a"]) {
    await assert.rejects(readSnapshot(claudeReadCommand(command), state));
  }
  assert.throws(() => claudeReadCommand("ls; cat /deos/claude/config.json"));
});
