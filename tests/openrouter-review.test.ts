import assert from "node:assert/strict";
import test from "node:test";

import {
  OpenRouterReviewClient,
  OpenRouterReviewError,
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
  assert.deepEqual(request.provider, { require_parameters: true });
  assert.equal(JSON.stringify(sent).includes("secret-key"), false);
});

test("OpenRouter review preserves successful responses beyond the former local ceiling", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed"],
    fetcher: async () => Response.json({
      id: "request-large",
      model: "vendor/allowed",
      padding: "x".repeat(2_100_000),
      choices: [{ message: { content: "{\"ok\":true}" } }],
    }),
  });
  const result = await client.review({
    model: "vendor/allowed",
    reasoning: "high",
    prompt: "Review this exact plan.",
    schemaName: "trace_review",
    schema: { type: "object", properties: { ok: { type: "boolean" } } },
  });
  assert.deepEqual(result.result, { ok: true });
  assert.equal(result.providerRequestId, "request-large");
});

test("OpenRouter HTTP failures retain actionable safe fields and a protected raw body", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed"],
    fetcher: async () => Response.json({
      id: "request-error-1",
      error: {
        code: 400,
        type: "invalid_request_error",
        message: "Invalid schema using Bearer sk-or-v1-abcdefghijklmnop",
      },
    }, { status: 400, headers: { "x-request-id": "header-request-id" } }),
  });
  await assert.rejects(
    client.review({
      model: "vendor/allowed",
      reasoning: "high",
      prompt: "Review this exact plan.",
      schemaName: "trace_review",
      schema: { type: "object" },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenRouterReviewError);
      assert.equal(error.diagnostic.stage, "http");
      assert.equal(error.diagnostic.httpStatus, 400);
      assert.equal(error.diagnostic.providerCode, "400");
      assert.equal(error.diagnostic.providerType, "invalid_request_error");
      assert.equal(error.diagnostic.providerMessage, "Invalid schema using Bearer [redacted]");
      assert.equal(error.diagnostic.providerRequestId, "request-error-1");
      assert.equal(error.diagnostic.requestMayHaveSucceeded, false);
      assert.equal(error.diagnostic.retryable, false);
      assert.match(error.diagnostic.rawResponseBody ?? "", /Invalid schema/);
      return true;
    },
  );
});

test("OpenRouter transport failures remain ambiguous and retryable", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed"],
    fetcher: async () => { throw new Error("network unavailable"); },
  });
  await assert.rejects(
    client.review({
      model: "vendor/allowed",
      reasoning: "high",
      prompt: "Review this exact plan.",
      schemaName: "trace_review",
      schema: { type: "object" },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenRouterReviewError);
      assert.equal(error.diagnostic.stage, "transport");
      assert.equal(error.diagnostic.requestMayHaveSucceeded, true);
      assert.equal(error.diagnostic.retryable, true);
      assert.match(error.diagnostic.providerMessage ?? "", /network unavailable/);
      assert.match(error.diagnostic.rawResponseBody ?? "", /network unavailable/);
      return true;
    },
  );
});

test("OpenRouter default transport calls fetch as a function", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async function (_input: RequestInfo | URL, _init?: RequestInit) {
    called = true;
    assert.equal(this, undefined);
    return Response.json({ data: [] });
  };
  try {
    const client = new OpenRouterReviewClient({
      apiKey: "secret-key-that-is-long-enough",
      supportedModels: ["vendor/allowed"],
    });
    assert.deepEqual(await client.listSupportedModels(), []);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const reviewText = { format: { type: "json_schema", name: "review", strict: false,
  schema: { type: "object", properties: { outcome: { type: "string" } }, required: ["outcome"], additionalProperties: false } } };

test("OpenRouter Responses proxy enforces schema routing without losing the Codex tool loop", async () => {
  let sent: Record<string, unknown> | null = null;
  let authorization = "";
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    apiUrl: "https://openrouter.example/api/v1",
    supportedModels: ["vendor/allowed"],
    fetcher: async (input, init) => {
      assert.equal(String(input), "https://openrouter.example/api/v1/responses");
      authorization = new Headers(init?.headers).get("Authorization") ?? "";
      sent = JSON.parse(String(init?.body));
      return new Response([
        "event: response.created",
        "data: {\"response\":{\"id\":\"resp-1\"}}",
        "",
        "event: response.completed",
        "data: {\"response\":{\"id\":\"resp-1\"}}",
        "",
      ].join("\n"), { headers: { "Content-Type": "text/event-stream" } });
    },
  });
  const response = await client.proxyResponses({
    model: "vendor/allowed",
    input: "Inspect package.json with a shell tool.",
    stream: true,
    text: reviewText,
    parallel_tool_calls: false,
    provider: { require_parameters: false, only: ["untrusted-host"] },
    tools: [{ type: "function", name: "exec", parameters: { type: "object" } },
      { type: "web_search" }, { type: "web_search_preview" },
      { type: "web_search_preview_2025_03_11" }, { type: "openrouter:web_search" }],
  });
  assert.equal(response.providerRequestId, "resp-1");
  assert.equal(response.contentType, "text/event-stream");
  assert.equal(authorization, "Bearer secret-key-that-is-long-enough");
  const captured = sent as unknown as Record<string, unknown>;
  assert.equal(captured.store, false);
  assert.equal("parallel_tool_calls" in captured, false);
  assert.deepEqual(captured.provider, { require_parameters: true, only: ["baidu"] });
  assert.deepEqual(captured.text, { format: { ...reviewText.format, strict: true } });
  assert.equal(reviewText.format.strict, false);
  assert.deepEqual(captured.tools, [{ type: "function", name: "exec", parameters: { type: "object" } }]);
  assert.equal(JSON.stringify(sent).includes("secret-key"), false);
});

test("OpenRouter Responses proxy preserves successful streams beyond the former local ceiling", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough",
    apiUrl: "https://openrouter.example/api/v1",
    supportedModels: ["vendor/allowed"],
    fetcher: async () => new Response([
      `: ${"x".repeat(10_100_000)}`,
      "event: response.completed",
      "data: {\"response\":{\"id\":\"resp-large\"}}",
      "",
    ].join("\n"), { headers: { "Content-Type": "text/event-stream" } }),
  });
  const response = await client.proxyResponses({
    model: "vendor/allowed",
    input: "Inspect the complete repository context.",
    text: reviewText,
    stream: true,
    tools: [],
  });
  assert.equal(response.providerRequestId, "resp-large");
  assert.ok(response.body.length > 10_000_000);
});

test("a missing or non-schema review format fails before any provider request", async () => {
  const client = new OpenRouterReviewClient({
    apiKey: "secret-key-that-is-long-enough", apiUrl: "https://openrouter.example/api/v1",
    supportedModels: ["vendor/allowed"],
    fetcher: async () => { throw new Error("must not contact provider"); },
  });
  for (const text of [undefined, { format: { type: "text" } }, { format: { type: "json_object" } },
    { format: { type: "json_schema", name: "review" } }]) {
    await assert.rejects(client.proxyResponses({ model: "vendor/allowed", input: "review", text }),
      /requires a JSON output schema/);
  }
});

test("independent reviews reject forced hosted search before contacting a provider", async () => {
  const client = new OpenRouterReviewClient({ apiKey: "secret-key-that-is-long-enough",
    supportedModels: ["vendor/allowed"], fetcher: async () => { throw new Error("must not contact provider"); } });
  for (const type of ["web_search", "web_search_preview", "web_search_preview_2025_03_11", "openrouter:web_search"]) {
    await assert.rejects(client.proxyResponses({ model: "vendor/allowed", input: "review", text: reviewText,
      tool_choice: { type } }), /Hosted web search is disabled/);
  }
});

test("supported model settings are bounded and deterministic", () => {
  assert.deepEqual(parseSupportedOpenRouterModels("b/model,a/model"), ["a/model", "b/model"]);
  assert.throws(() => parseSupportedOpenRouterModels(""), /invalid/);
  assert.throws(() => parseSupportedOpenRouterModels("a/model,a/model"), /invalid/);
});
