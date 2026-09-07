// Paid, isolated provider diagnostic. Does not start or retry a DEOS workflow.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { codexReviewArgs, reviewPromptWithSchema } from "../container/trace-review-proof.mjs";
import { OpenRouterReviewClient, OpenRouterReviewError } from "../src/openrouter-review.ts";
import { designReviewOutputSchema } from "../container/design-review-schema.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const model = "deepseek/deepseek-v4-pro";
const directory = mkdtempSync(`${tmpdir()}/deos-codex-contract-`);
writeFileSync(`${directory}/schema.json`, JSON.stringify(designReviewOutputSchema));
const env = parseEnv(readFileSync(".env", "utf8"));
// Diagnostic-only endpoint comparison; production routing is unchanged.
const probeProvider = process.env.PROBE_PROVIDER;
assert.ok(probeProvider === undefined || ["baidu", "venice", "fireworks"].includes(probeProvider));
const client = new OpenRouterReviewClient({
  apiKey: env.OPENROUTER_API_KEY ?? "", supportedModels: [model],
  fetcher: (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.stream, true);
    assert.equal("parallel_tool_calls" in body, false);
    assert.equal(body.tools.some((tool: {type: string}) => /web_search/.test(tool.type)), false);
    assert.equal(body.text.format.strict, true);
    assert.deepEqual(body.text.format.schema, designReviewOutputSchema);
    assert.deepEqual(body.provider, { require_parameters: true, only: ["baidu"] });
    // Default verifies production unchanged. Comparison mode changes only the host.
    if (probeProvider) body.provider.only = [probeProvider];
    return fetch(url, { ...init, ...(probeProvider ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180_000) });
  },
});
console.log(JSON.stringify({ harness: "0.147.0", model, provider: probeProvider ?? "baidu", workflowStarted: false }));
const marker = randomUUID();
writeFileSync(`${directory}/probe-input.txt`, marker);
let toolCalls = 0;
let requests = 0;
let failure: unknown;
const exitCode = await new Promise<number | null>((resolve, reject) => {
  let child: ReturnType<typeof spawn>;
  const server = createServer(async (req, res) => {
    try {
      if (++requests > 4) throw new Error("Probe request budget exceeded");
      let raw = "";
      for await (const part of req) raw += part;
      const request = JSON.parse(raw);
      const response = await client.proxyResponses(request);
      const events = response.body.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
      const completed = events.find(event => event.type === "response.completed");
      assert.ok(completed, "Provider did not complete the response");
      for (const item of completed.response.output) {
        if (item.type.endsWith("_call")) {
          assert.equal(item.type, "function_call");
          assert.equal(item.name, "exec_command", "Only the fixture read is permitted");
          const args = JSON.parse(item.arguments);
          assert.equal(args.cmd, "cat probe-input.txt", "Only the fixture read is permitted");
          toolCalls++;
        }
      }
      console.log(JSON.stringify({ request: requests, completed: true, providerRequestId: response.providerRequestId, toolCalls }));
      res.writeHead(response.status, { "content-type": response.contentType });
      res.end(response.body);
    } catch (error) {
      failure = error;
      res.writeHead(400); res.end("Probe failed; no retry");
      child.kill(); server.close();
    }
  });
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("No probe listener");
    const args = codexReviewArgs({ sessionId: null, cwd: directory, model, reasoning: "high",
      schema: `${directory}/schema.json`, destination: `${directory}/tool-result.json`, modelProvider: "openrouter",
      capabilityUrl: `http://127.0.0.1:${address.port}` });
    child = spawn("npx", ["--yes", "@openai/codex@0.147.0", ...args], {
      env: { PATH: process.env.PATH, HOME: directory, DEOS_MODEL_CAPABILITY_TOKEN: "probe-only", DEOS_ATTEMPT_ID: "probe" },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.stdin!.end(reviewPromptWithSchema(`This is a transport test. Do not delegate or call any other tools.
First use exec_command exactly once with cmd "cat probe-input.txt" to read the fixture.
Then return version 1, inputSha256 ${"a".repeat(64)}, phase independent, outcome pass,
summary equal to the fixture contents, findings [].`, JSON.stringify(designReviewOutputSchema), "openrouter"));
    child.on("error", reject);
    child.on("exit", code => { server.close(); resolve(code); });
  });
  setTimeout(() => { child?.kill(); server.close(); reject(new Error("Tool probe timeout")); }, 240_000).unref();
});
if (failure instanceof OpenRouterReviewError) {
  throw new Error(`${failure.diagnostic.httpStatus}: ${failure.diagnostic.providerMessage}`);
}
if (failure) throw failure;
assert.equal(exitCode, 0);
assert.equal(toolCalls, 1);
assert.ok(requests >= 2);
assert.deepEqual(JSON.parse(readFileSync(`${directory}/tool-result.json`, "utf8")), {
  version: 1, inputSha256: "a".repeat(64), phase: "independent", outcome: "pass", summary: marker, findings: [],
});
console.log(JSON.stringify({ result: "real Codex tool round-trip and exact review JSON passed", workflowStarted: false }));
