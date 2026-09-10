// Isolated transport proof: three synthetic 429s, followed by one real provider call.
// This does not launch or retry a workflow, and is not provider-originated 429 proof.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { OpenRouterReviewClient } from "../src/openrouter-review.ts";

const env = parseEnv(readFileSync(process.env.PROBE_ENV_FILE ?? ".env", "utf8"));
const marker = randomUUID();
let requests = 0;
let providerRequests = 0;
const started = Date.now();
const client = new OpenRouterReviewClient({
  apiKey: env.OPENROUTER_API_KEY ?? "", supportedModels: ["deepseek/deepseek-v4-pro"],
  fetcher: async (url, init) => {
    requests++;
    if (requests <= 3) return Response.json({ error: { code: 429, message: "Injected transport test" } },
      { status: 429, headers: { "Retry-After": "1" } });
    providerRequests++;
    return fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  },
});
const response = await client.proxyResponses({
  model: "deepseek/deepseek-v4-pro", stream: true, tools: [], reasoning: { effort: "high" },
  input: [{ role: "user", content: `Return exactly this JSON object: {"probe":"${marker}"}` }],
  text: { format: { type: "json_schema", name: "retry_probe", strict: true,
    schema: { type: "object", properties: { probe: { type: "string" } }, required: ["probe"], additionalProperties: false } } },
});
const events = response.body.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
const completed = events.find(event => event.type === "response.completed");
assert.ok(completed, "Provider must complete the response");
const output = completed.response.output.filter((item: { type: string }) => item.type === "message")
  .flatMap((item: { content?: { text?: string }[] }) => item.content ?? [])
  .map((part: { text?: string }) => part.text ?? "").join("");
assert.deepEqual(JSON.parse(output), { probe: marker });
assert.equal(requests, 4);
assert.equal(providerRequests, 1);
console.log(JSON.stringify({ result: "passed", synthetic429s: 3, requestAttempts: requests,
  realProviderRequests: providerRequests, elapsedMs: Date.now() - started,
  providerRequestId: response.providerRequestId, exactSchemaResult: true, workflowStarted: false }));
