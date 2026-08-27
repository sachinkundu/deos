import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenRouterReviewClient,
  parseSupportedOpenRouterModels,
} from "../src/openrouter-review.ts";

test("OpenRouter model discovery returns only configured structured-output models", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed", "vendor/no-schema"],
    fetcher: async (_input, init) => {
      assert.match(String(new Headers(init?.headers).get("Authorization")), /^Bearer /);
      return Response.json({ data: [
        { id: "vendor/allowed", name: "Allowed", context_length: 1000, supported_parameters: ["response_format"] },
        { id: "vendor/no-schema", name: "No schema", supported_parameters: [] },
        { id: "vendor/not-configured", name: "Other", supported_parameters: ["response_format"] },
      ] });
    },
  });
  assert.deepEqual(await client.listSupportedModels(), [{
    id: "vendor/allowed",
    name: "Allowed",
    contextLength: 1000,
  }]);
});

test("OpenRouter review pins model, reasoning, and strict JSON schema without exposing its key", async () => {
  let sent: Record<string, unknown> | null = null;
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed"],
    fetcher: async (_input, init) => {
      sent = JSON.parse(String(init?.body));
      return Response.json({
        id: "request-1",
        model: "vendor/allowed",
        choices: [{ message: { content: "{\"ok\":true}" } }],
      });
    },
  });
  const result = await client.review({
    model: "vendor/allowed",
    reasoning: "high",
    prompt: "Review this exact plan.",
    schemaName: "trace_review",
    schema: { type: "object", properties: { ok: { type: "boolean" } } },
  });
  assert.deepEqual(result.result, { ok: true });
  assert.equal(result.providerRequestId, "request-1");
  assert.notEqual(sent, null);
  const request = sent as unknown as Record<string, unknown>;
  assert.equal(request.model, "vendor/allowed");
  assert.deepEqual(request.reasoning, { effort: "high" });
  assert.equal(JSON.stringify(sent).includes("secret-key"), false);
});

test("supported model settings are bounded and deterministic", () => {
  assert.deepEqual(parseSupportedOpenRouterModels("b/model,a/model"), ["a/model", "b/model"]);
  assert.throws(() => parseSupportedOpenRouterModels(""), /invalid/);
  assert.throws(() => parseSupportedOpenRouterModels("a/model,a/model"), /invalid/);
});
