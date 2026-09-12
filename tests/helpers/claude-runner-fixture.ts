import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { digest } from "../../src/claude-review.ts";

export const credential = 'test-oauth-"credential';
export const capability = "test-capability-credential";
export const providerMessage = `Authentication rejected.\nAccount access denied: ${credential}\nRequest req-original-42.`;
export const runClaudeFailure = async (mode: "401" | "403" | "malformed" | "exit" | "spawn" | "storage" | "broker") => {
  const dir = await mkdtemp(join(tmpdir(), "claude-failure-"));
  try {
    const source = await readFile("container/claude-trusted-runner.mjs", "utf8");
    await writeFile(join(dir, "runner.mjs"), source
      .replaceAll('"./grounded-agent.mjs"', JSON.stringify(resolve("container/grounded-agent.mjs")))
      .replaceAll('"/deos/bin/claude-review.ts"', JSON.stringify(resolve("src/claude-review.ts")))
      .replaceAll('"/deos/bin/claude-diagnostics.ts"', JSON.stringify(resolve("src/claude-diagnostics.ts")))
      .replace('const ROOT = "/deos/claude";', `const ROOT = ${JSON.stringify(dir)};`));
    const request = { prompt: "Review this fixture", schema: {}, sessionId: null };
    await writeFile(join(dir, "request-0.json"), JSON.stringify({ ...request, ordinal: 0,
      inputSha256: await digest(JSON.stringify(request)) }));
    await writeFile(join(dir, "config.json"), JSON.stringify({ attemptId: "attempt",
      deadline: new Date(Date.now() + 15_000).toISOString(), capabilityToken: capability,
      capabilityUrl: "https://fixture.invalid", enrollment: {} }));
    const final = { type: "result", subtype: "success", is_error: true,
      api_error_status: mode === "401" ? 401 : 403, result: providerMessage,
      error: { type: "authentication_error", request_id: "req-original-42", message: providerMessage,
        cause: { detail: "Provider explanation retained exactly" } } };
    const stderr = `Provider stderr before failure: ${capability}\n${"Long diagnostic detail. ".repeat(20_000)}EOF stderr\n`;
    const fake = `#!${process.execPath}
import { writeFileSync } from "node:fs";
process.stdin.once("data", () => {
  process.stderr.write(${JSON.stringify(stderr)});
  const mode = ${JSON.stringify(mode)};
  if (mode === "exit") { process.exitCode = 17; process.stdin.destroy(); return; }
  if (mode === "malformed") { process.stdout.write("{broken provider JSON\\n"); return; }
  if (mode === "broker") { writeFileSync(${JSON.stringify(join(dir, "broker-failure.json"))}, JSON.stringify({
    cause: "review_failure", originalError: { name: "Error", message: "repository transport disconnected", cause: { code: "ECONNRESET" } }
  })); return; }
  process.stdout.write(JSON.stringify({type:"system", subtype:"init", model:"claude-opus-5", session_id:"session"}) + "\\n");
  process.stdout.write(JSON.stringify(${JSON.stringify(final)}) + "\\n");
});
`;
    if (mode !== "spawn") await writeFile(join(dir, "claude"), fake, { mode: 0o700 });
    if (mode === "storage") await mkdir(join(dir, "failure.json.tmp"));
    let processError: any;
    try {
      await promisify(execFile)(process.execPath, ["--experimental-strip-types", join(dir, "runner.mjs")], {
        env: { PATH: dir, CLAUDE_CODE_OAUTH_TOKEN: credential } as unknown as NodeJS.ProcessEnv,
        timeout: 20_000, maxBuffer: 4_000_000,
      });
    } catch (error) { processError = error; }
    const failure = mode === "storage" ? null : JSON.parse(await readFile(join(dir, "failure.json"), "utf8"));
    return { failure, processError, expectedStderr: stderr.replaceAll(capability, "[REDACTED]"),
      expectedMessage: providerMessage.replaceAll(credential, "[REDACTED]") };
  } finally { await rm(dir, { recursive: true, force: true }); }
};
