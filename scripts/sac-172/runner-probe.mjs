// Local packaged-runner check. The receiver below is a test adapter, not Cloudflare evidence.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  symlink,
} from "node:fs/promises";
import {
  setupImplementation,
  command,
} from "/deos/bin/implementation-runtime.mjs";
const cwd = "/deos/workspace/repository";
for (const dir of [
  cwd,
  "/deos/run",
  "/deos/output",
  "/root/.codex",
  "/deos/test-data/probe",
  "/evidence",
])
  await mkdir(dir, { recursive: true });
await copyFile("/probe/model-profile.json", "/root/.codex/models_cache.json");
const run = async (argv) => {
  const r = await command(argv, cwd);
  assert.equal(r.exitCode, 0, JSON.stringify(r));
  return r;
};
await run(["git", "init", "-q"]);
await run(["git", "config", "user.name", "Probe"]);
await run(["git", "config", "user.email", "probe@example.test"]);
await mkdir(`${cwd}/openspec/changes/sample`, { recursive: true });
await writeFile(
  `${cwd}/openspec/changes/sample/tasks.md`,
  "- [x] Exercise isolated preview\n",
);
await writeFile(
  `${cwd}/app.mjs`,
  `export default { async fetch(request,env) { await env.DB.exec('CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY)'); await env.DB.exec('INSERT INTO visits DEFAULT VALUES'); const row=await env.DB.prepare('SELECT COUNT(*) AS count FROM visits').first(); return Response.json(row); } };\n`,
);
await run(["git", "add", "."]);
await run(["git", "commit", "-qm", "fixture"]);
await writeFile(
  "/deos/run/implementation-input.json",
  JSON.stringify({ approvedDesignSha: "a".repeat(40) }),
);
await writeFile(
  "/deos/output/result.json",
  JSON.stringify({ outcome: "completed", assumptions: [], question: null }),
);
await writeFile("/deos/output/documentation-sources.json", "[]");
const receiver = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = JSON.parse(Buffer.concat(chunks));
  const result =
    request.action === "preview"
      ? { origin: "http://127.0.0.1:8787" }
      : {
          ...request.subject,
          id: "local-showboat",
          kind: "showboat",
          sha256: "f".repeat(64),
          sanitized: true,
        };
  if (request.action === "showboat")
    await writeFile("/evidence/showboat.md", request.document);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(result));
});
await new Promise((resolve) => receiver.listen(8791, "127.0.0.1", resolve));
let runtime;
try {
  runtime = await setupImplementation({
    implementationKind: "build",
    cwd,
    model: "gpt-5.6-sol",
    attemptId: "probe",
    openspecChange: "sample",
    capabilityUrl: "http://127.0.0.1:8791",
    capabilityToken: "local-probe-not-a-provider-token",
  });
  const tool = async (request) => {
    const r = await fetch("http://127.0.0.1:8790/tool", {
      method: "POST",
      body: JSON.stringify(request),
    });
    const result = await r.json();
    assert.equal(r.status, 200, JSON.stringify(result));
    return result;
  };
  const grounding = JSON.parse(
    await readFile("/deos/implementation/grounding.json"),
  );
  assert.equal(grounding.verification.webSearch, "live");
  const author = async (script) =>
    command(
      [
        "runuser",
        "-u",
        "deos-author",
        "--",
        "env",
        "-i",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "HOME=/home/deos-author",
        "bash",
        "-c",
        script,
      ],
      cwd,
    );
  assert.notEqual((await author("cat /root/.codex/config.toml")).exitCode, 0);
  assert.notEqual((await author("echo bad >> .git/config")).exitCode, 0);
  assert.notEqual((await author("mv .git .git-old")).exitCode, 0);
  assert.equal((await author("git status --porcelain")).exitCode, 0);
  await tool({
    action: "preview",
    main: "app.mjs",
    d1: ["DB"],
    r2: ["BUCKET"],
  });
  const response = await fetch("http://127.0.0.1:8787/");
  const data = await response.json();
  assert.ok(data.count >= 1);
  await tool({
    action: "check",
    argv: [
      "node",
      "-e",
      'fetch("http://127.0.0.1:8787/").then(r=>r.json()).then(v=>{if(v.count<2)process.exit(1);console.log(JSON.stringify(v))})',
    ],
    behavior: true,
  });
  await runtime.finish();
  const candidate = JSON.parse(
    await readFile("/deos/output/implementation-candidate.json"),
  );
  assert.equal(candidate.checks.length, 1);
  assert.equal(candidate.checks[0].exitCode, 0);
  assert.equal(candidate.proof.length, 1);
  await symlink("/root/.codex/config.toml", "/deos/output/escape");
  const result = {
    kind: "local-container-proof",
    webSearch: grounding.verification.webSearch,
    preview: data,
    checks: candidate.checks.map(({ command, exitCode }) => ({
      command,
      exitCode,
    })),
    denials: [
      "private config",
      "Git config write",
      "Git directory replacement",
    ],
    providerOriginated: false,
    treeSha: candidate.treeSha,
  };
  await writeFile(
    "/evidence/runner.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result));
} finally {
  try {
    await copyFile("/deos/implementation/preview.log", "/evidence/preview.log");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await runtime?.close();
  await new Promise((resolve) => receiver.close(resolve));
}
