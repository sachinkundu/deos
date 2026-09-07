// Small paid provider check. No workflow is started and no repository text is sent.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { OpenRouterReviewClient } from "../src/openrouter-review.ts";
import { designReviewOutputSchema } from "../container/design-review-schema.mjs";

const env = { ...process.env, ...parseEnv(readFileSync(".env", "utf8")) };
const model = "deepseek/deepseek-v4-pro";
const client = new OpenRouterReviewClient({
  apiKey: env.OPENROUTER_API_KEY ?? "", supportedModels: [model],
  fetcher: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(180_000) }),
});
const response = await client.proxyResponses({
  model, stream: false, max_output_tokens: 2048, reasoning: { effort: "high" },
  input: `This is a schema transport test, not a real design review. Return version 1,
inputSha256 ${"a".repeat(64)}, phase independent, outcome pass, summary "Schema probe passed",
and findings []. No tools are needed.`,
  tools: [{ type: "function", name: "read_source", description: "Read a test source",
    parameters: { type: "object", properties: {}, additionalProperties: false } }],
  text: { format: { type: "json_schema", name: "design_review", strict: true, schema: designReviewOutputSchema } },
});
const body = JSON.parse(response.body);
assert.equal(body.status, "completed");
const content = body.output.flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? [])
  .filter((item: { type: string }) => item.type === "output_text")
  .map((item: { text: string }) => item.text).join("");
assert.deepEqual(JSON.parse(content), {
  version: 1, inputSha256: "a".repeat(64), phase: "independent", outcome: "pass",
  summary: "Schema probe passed", findings: [],
});
console.log(JSON.stringify({ model, providerRequestId: response.providerRequestId,
  result: "exact design schema accepted", toolsIncluded: true, workflowStarted: false }));
