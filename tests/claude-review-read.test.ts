import assert from "node:assert/strict";
import test from "node:test";
import { claudeReadCommand } from "../container/claude-review-read.mjs";
import { readSnapshot } from "../container/native-review-read.mjs";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

test("Claude reader launches with large file context and preserves command errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-read-"));
  const run = promisify(execFile);
  const script = resolve("container/claude-review-read.mjs");
  const options = { env: { ...process.env, DEOS_ERROR_OUTPUT_ROOT: dir } };
  try {
    const content = "Frozen unpublished design\n";
    const sha256 = createHash("sha256").update(content).digest("hex");
    const requests = ["first", "second"].map(name => ({
      state: { phase: "design", change: "sample", before: [{ path: `${name}.md`, sha256 }], reviewJob: {
        materializedContext: JSON.stringify({ padding: "x".repeat(1_000_000),
          designReview: { sources: [{ path: `${name}.md`, content, sha256 }] } }),
      } }, command: "ls",
    }));
    const paths = requests.map((_, i) => join(dir, `request-${i}.json`));
    await Promise.all(requests.map((request, i) => writeFile(paths[i], JSON.stringify(request))));
    const results = await Promise.all(paths.map(path => run(process.execPath, [script, "--request-file", path], options)));
    assert.deepEqual(results.map(result => result.stdout), ["first.md\n", "second.md\n"]);
    await writeFile(paths[0], JSON.stringify({ ...requests[0], command: "cat first.md" }));
    assert.equal((await run(process.execPath, [script, "--request-file", paths[0]], options)).stdout, content);
    for (const source of [
      { path: "first.md", content: "tampered", sha256 },
      { path: "../escape.md", content, sha256 },
    ]) {
      const bad = { ...requests[0], state: { ...requests[0].state, reviewJob: {
        materializedContext: JSON.stringify({ designReview: { sources: [source] } }),
      } } };
      await writeFile(paths[0], JSON.stringify(bad));
      await assert.rejects(run(process.execPath, [script, "--request-file", paths[0]], options),
        (error: any) => error.code === 1 && /source hash mismatch|invalid design review source/.test(error.stderr));
    }
    await writeFile(paths[0], JSON.stringify({ ...requests[0], command: "ls; cat .env" }));
    await assert.rejects(run(process.execPath, [script, "--request-file", paths[0]], options),
      (error: any) => error.code === 1 && error.stderr.includes("unsupported review command"));
    const errors = await readFile(join(dir, "original-errors.jsonl"), "utf8");
    assert.match(errors, /unsupported review command/);
    assert.match(errors, /readCommand/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

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

test("Claude file reader executes quoted searches over frozen sources without shell expansion", async () => {
  const dir = await mkdtemp(join(tmpdir(), "claude-search-"));
  const run = promisify(execFile);
  const content = 'Skill tools\nSubagent review\nWeb search\nHarness\nprice $5; a|b & <tag>\nsay "hello"\n';
  const path = "docs/current-architecture.md";
  const sha256 = createHash("sha256").update(content).digest("hex");
  const state = { phase: "design", change: "sample", before: [{ path, sha256 }], reviewJob: {
    materializedContext: JSON.stringify({ designReview: { sources: [{ path, content, sha256 }] } }),
  } };
  const request = join(dir, "request.json");
  const read = async (command: string) => {
    await writeFile(request, JSON.stringify({ state, command }));
    return await run(process.execPath, [resolve("container/claude-review-read.mjs"), "--request-file", request],
      { env: { ...process.env, DEOS_ERROR_OUTPUT_ROOT: dir } });
  };
  try {
    const alternatives = await read('rg -n -i "skill|subagent|web search|harness" docs/current-architecture.md');
    assert.equal(alternatives.stdout, ['Skill tools', 'Subagent review', 'Web search', 'Harness']
      .map((line, index) => `${path}:${index + 1}:${line}\n`).join(""));
    assert.equal((await read(String.raw`rg -i "\bskill\s+tools$" docs/current-architecture.md`)).stdout,
      `${path}:1:Skill tools\n`);
    assert.equal((await read(`rg -F 'price $5; a|b & <tag>' docs/current-architecture.md`)).stdout,
      `${path}:5:price $5; a|b & <tag>\n`);
    assert.equal((await read(String.raw`rg -F "say \"hello\"" docs/current-architecture.md`)).stdout,
      `${path}:6:say "hello"\n`);
    assert.equal((await read('rg "no matches" docs/current-architecture.md')).stdout, "\n");
    for (const command of ['cat "../.env"', 'cat "/etc/passwd"', 'rg -n --pre env skill',
      'rg "skill|tools" docs/current-architecture.md | cat .env']) {
      await assert.rejects(read(command), (error: any) => error.code === 1 &&
        /outside the checked input|unsupported review search flag|unsupported review command/.test(error.stderr));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
