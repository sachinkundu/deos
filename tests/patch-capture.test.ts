import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { captureRepositoryPatch } from "../container/patch-capture.mjs";

const git = (cwd: string, ...args: string[]): string =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

test("repository patch capture includes untracked files without mutating the real index", async () => {
  const repository = await mkdtemp(join(tmpdir(), "deos-patch-test-"));
  try {
    git(repository, "init", "-q");
    git(repository, "config", "user.email", "test@example.com");
    git(repository, "config", "user.name", "DEOS Test");
    await writeFile(join(repository, "tracked.txt"), "before\n");
    git(repository, "add", "tracked.txt");
    git(repository, "commit", "-qm", "baseline");

    await writeFile(join(repository, "tracked.txt"), "after\n");
    await writeFile(join(repository, "untracked.txt"), "new\n");

    const patch = await captureRepositoryPatch(repository);

    assert.match(patch, /diff --git a\/untracked\.txt b\/untracked\.txt/);
    assert.match(patch, /new file mode/);
    assert.match(patch, /\+new/);
    assert.equal(spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: repository }).status, 0);
    assert.match(git(repository, "status", "--porcelain"), /\?\? untracked\.txt/);
  } finally {
    await rm(repository, { recursive: true, force: true });
  }
});
