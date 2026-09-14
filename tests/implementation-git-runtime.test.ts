import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ImplementationGitHub } from "../src/implementation-github.ts";
import {
  snapshot,
  localConfig,
  readRegularFile,
  currentChecks,
  // @ts-expect-error The container entrypoint is deployed as JavaScript.
} from "../container/implementation-runtime.mjs";
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
test("trusted snapshot uses the actual Git tree, includes binary bytes, and refuses symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-tree-"));
  try {
    git(root, "init", "-q");
    git(root, "config", "user.name", "Test");
    git(root, "config", "user.email", "test@example.test");
    await writeFile(join(root, "old.txt"), "old");
    git(root, "add", ".");
    git(root, "commit", "-qm", "base");
    const base = git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "binary.bin"), new Uint8Array([0, 255, 1, 128]));
    await rm(join(root, "old.txt"));
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.py"), 'print("hi")\n');
    const result = await snapshot(root);
    assert.equal(result.testedBaseSha, base);
    assert.equal(result.files.length, 3);
    assert.equal(
      result.files.find((f: { path: string }) => f.path === "binary.bin")
        .contentBase64,
      Buffer.from([0, 255, 1, 128]).toString("base64"),
    );
    assert.equal(
      result.files.find((f: { path: string }) => f.path === "old.txt")
        .contentBase64,
      null,
    );
    git(root, "add", "-A");
    assert.equal(result.treeSha, git(root, "write-tree"));
    await symlink("/etc/passwd", join(root, "escape"));
    await assert.rejects(snapshot(root), /Unsupported candidate mode/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("atomic ref write speaks the real Git protocol and rejects a raced prior head", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-cas-"));
  try {
    git(root, "init", "--bare", "-q");
    const tree = execFileSync("git", ["mktree"], {
      cwd: root,
      input: "",
      encoding: "utf8",
    }).trim();
    const commit = (message: string) =>
      execFileSync(
        "git",
        [
          "-c",
          "user.name=Test",
          "-c",
          "user.email=test@example.test",
          "commit-tree",
          tree,
        ],
        { cwd: root, input: message, encoding: "utf8" },
      ).trim();
    const first = commit("first"),
      next = commit("next"),
      raced = commit("external");
    const branch = "deos/agent/SAC-172/run-1";
    const request = (async (_url: unknown, init: RequestInit) => {
      const response = execFileSync(
        "git",
        ["receive-pack", "--stateless-rpc", root],
        {
          input: Buffer.from(init.body as Uint8Array),
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return new Response(response);
    }) as typeof fetch;
    const api = new ImplementationGitHub(
      "https://api.github.com",
      "owner/repo",
      { token: async () => "test-token" },
      request,
    );
    await api.compareAndSwapRef(branch, null, first);
    assert.equal(git(root, "rev-parse", `refs/heads/${branch}`), first);
    await api.compareAndSwapRef(branch, first, next);
    assert.equal(git(root, "rev-parse", `refs/heads/${branch}`), next);
    git(root, "update-ref", `refs/heads/${branch}`, raced);
    await assert.rejects(
      api.compareAndSwapRef(branch, next, first),
      /rejected/,
    );
    assert.equal(git(root, "rev-parse", `refs/heads/${branch}`), raced);
    await assert.rejects(
      api.compareAndSwapRef("main", raced, next),
      /reserved/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("local preview config cannot carry remote bindings, secrets or another try persistence", () => {
  const one = localConfig(
    { action: "preview", main: "src/index.ts", d1: ["DB"], r2: ["ARTIFACTS"] },
    "one",
  );
  const two = localConfig(
    { action: "preview", main: "src/index.ts", d1: ["DB"] },
    "two",
  );
  assert.notEqual(
    one.d1_databases[0].database_id,
    two.d1_databases[0].database_id,
  );
  assert.equal(one.d1_databases[0].remote, undefined);
  assert.equal(one.services, undefined);
  assert.throws(
    () => localConfig({ action: "preview", main: "../prod.ts" }, "one"),
    /relative/,
  );
  assert.throws(
    () =>
      localConfig(
        {
          action: "preview",
          main: "src/app.ts",
          services: [{ service: "live" }],
        },
        "one",
      ),
    /unsupported/,
  );
});

test("check acceptance is tied to the exact final tree and base", () => {
  const checks = [
    { command: "check", exitCode: 0, treeSha: "old", testedBaseSha: "base" },
    { command: "check", exitCode: 0, treeSha: "new", testedBaseSha: "base" },
    {
      command: "other",
      exitCode: 0,
      treeSha: "new",
      testedBaseSha: "old-base",
    },
  ];
  assert.deepEqual(
    currentChecks(checks, { treeSha: "new", testedBaseSha: "base" }),
    [checks[1]],
  );
});
test("trusted output reads refuse symlink and cross-directory targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "implementation-output-"));
  try {
    await writeFile(join(root, "regular"), "okay");
    assert.equal(await readRegularFile(join(root, "regular"), root), "okay");
    await symlink(join(root, "regular"), join(root, "link"));
    await assert.rejects(readRegularFile(join(root, "link"), root), /ELOOP/);
    await symlink("/etc/passwd", join(root, "escape"));
    await assert.rejects(
      readRegularFile(join(root, "escape"), root),
      /escaped/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
