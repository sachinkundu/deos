import { errorDetails, readResponseText } from "./error-details.ts";
import { responseError } from "./error-details.ts";
import { recordCaughtError } from "./error-context.ts";
export interface OpenRouterModelSummary {
  id: string;
  name: string;
  contextLength: number | null;
}

export interface OpenRouterReviewRequest {
  model: string;
  reasoning: string;
  prompt: string;
  schemaName: string;
  schema: Readonly<Record<string, unknown>>;
}

export interface OpenRouterReviewResponse {
  model: string;
  providerRequestId: string | null;
  result: Readonly<Record<string, unknown>>;
  rawResponse: Readonly<Record<string, unknown>>;
}

export interface OpenRouterResponsesProxyResponse {
  status: number;
  contentType: string;
  body: string;
  providerRequestId: string | null;
}

export type OpenRouterFailureStage =
  | "transport"
  | "http"
  | "response_body"
  | "response_json"
  | "response_contract"
  | "structured_content"
  | "structured_json";

export interface OpenRouterFailureDiagnostic {
  responseHeaders?: Record<string, string>;
  stage: OpenRouterFailureStage;
  httpStatus: number | null;
  providerCode: string | null;
  providerType: string | null;
  providerMessage: string | null;
  providerRequestId: string | null;
  responseContentType: string | null;
  responseBodySha256: string | null;
  responseTruncated: boolean;
  requestMayHaveSucceeded: boolean;
  retryable: boolean;
  rawResponseBody: string | null;
}

export class OpenRouterReviewError extends Error {
  readonly diagnostic: OpenRouterFailureDiagnostic;

  constructor(message: string, diagnostic: OpenRouterFailureDiagnostic) {
    super(message);
    this.name = "OpenRouterReviewError";
    this.diagnostic = Object.freeze(diagnostic);
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

const nullableRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const boundedString = (value: unknown, maximum = 2_000): string | null =>
  typeof value === "string" && value.length > 0
    ? value
    : null;

const safeProviderMessage = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const transportFailureDiagnostic = (error: unknown): OpenRouterFailureDiagnostic => {
  const raw = JSON.stringify(errorDetails(error));

  return {
    stage: "transport",
    httpStatus: null,
    providerCode: null,
    providerType: null,
    providerMessage: safeProviderMessage(raw),
    providerRequestId: null,
    responseContentType: null,
    responseBodySha256: null,
    responseTruncated: false,
    requestMayHaveSucceeded: true,
    retryable: true,
    rawResponseBody: raw,
  };
};

const providerScalar = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readBoundedText = async (response: Response, _maximum = 0): Promise<{ text: string; truncated: boolean; sha256: string }> => {
  const text = await readResponseText(response);
  return { text, truncated: false, sha256: await sha256Hex(text) };
};

const readCompleteText = async (
  response: Response,
): Promise<{ text: string; truncated: false; sha256: string }> => {
  const text = await readResponseText(response);
  return { text, truncated: false, sha256: await sha256Hex(text) };
};

const retryableStatus = (status: number): boolean =>
  [408, 429, 500, 502, 503, 524, 529].includes(status);

const requestId = (response: Response, body: Record<string, unknown> | null): string | null =>
  boundedString(body?.id, 240) ??
  boundedString(response.headers.get("x-request-id"), 240) ??
  boundedString(response.headers.get("x-openrouter-request-id"), 240);

const responseIdFromSse = (text: string): string | null => {
  for (const line of text.split("\n").reverse()) {
    if (!line.startsWith("data: ")) continue;
    const value = line.slice(6);
    if (value === "[DONE]") continue;
    try {
      const event = nullableRecord(JSON.parse(value));
      const response = nullableRecord(event?.response);
      const id = boundedString(response?.id, 240) ?? boundedString(event?.id, 240);
      if (id !== null) return id;
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/openrouter-review.ts:197");
      // Ignore non-JSON SSE comments and keep looking for a response identifier.
    }
  }
  return null;
};

const diagnosticFromBody = (
  response: Response,
  stage: OpenRouterFailureStage,
  body: Record<string, unknown> | null,
  raw: { text: string; truncated: boolean; sha256: string | null },
  requestMayHaveSucceeded: boolean,
): OpenRouterFailureDiagnostic => {
  const providerError = nullableRecord(body?.error);
  return {
    stage,
    responseHeaders: Object.fromEntries(response.headers),
    httpStatus: response.status,
    providerCode: providerScalar(providerError?.code),
    providerType: boundedString(providerError?.type, 240),
    providerMessage: safeProviderMessage(providerError?.message),
    providerRequestId: requestId(response, body),
    responseContentType: boundedString(response.headers.get("content-type"), 240),
    responseBodySha256: raw.sha256,
    responseTruncated: raw.truncated,
    requestMayHaveSucceeded,
    retryable: retryableStatus(response.status),
    rawResponseBody: raw.text || null,
  };
};

export const parseSupportedOpenRouterModels = (value: string): readonly string[] => {
  const models = value.split(",").map((model) => model.trim()).filter(Boolean);
  if (
    models.length === 0 ||
    models.some((model) => !/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(model)) ||
    new Set(models).size !== models.length
  ) throw new Error("supported OpenRouter model list is invalid");
  return Object.freeze(models.sort());
};

export class OpenRouterReviewClient {
  private readonly apiKey: string;
  private readonly supportedModels: ReadonlySet<string>;
  private readonly fetcher: Fetcher;
  private readonly apiUrl: string;

  constructor(input: {
    apiKey: string;
    supportedModels: readonly string[];
    fetcher?: Fetcher;
    apiUrl?: string;
  }) {
    if (input.apiKey.length < 16) throw new Error("OpenRouter key is unavailable");
    this.apiKey = input.apiKey;
    this.supportedModels = new Set(input.supportedModels);
    this.fetcher = input.fetcher ?? ((request, init) => fetch(request, init));
    this.apiUrl = (input.apiUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  }

  async listSupportedModels(): Promise<readonly OpenRouterModelSummary[]> {
    const response = await this.fetcher(`${this.apiUrl}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
    });
    if (!response.ok) throw await responseError("OpenRouter model discovery failed", response);
    const body = asRecord(await response.json(), "OpenRouter model response");
    if (!Array.isArray(body.data)) throw new Error("OpenRouter model response is invalid");
    const models = body.data.flatMap((value): OpenRouterModelSummary[] => {
      const model = asRecord(value, "OpenRouter model");
      if (typeof model.id !== "string" || !this.supportedModels.has(model.id)) return [];
      const parameters = Array.isArray(model.supported_parameters)
        ? model.supported_parameters.filter((item): item is string => typeof item === "string")
        : [];
      if (!parameters.includes("response_format")) return [];
      return [{
        id: model.id,
        name: typeof model.name === "string" && model.name.length > 0 ? model.name : model.id,
        contextLength: Number.isSafeInteger(model.context_length) ? Number(model.context_length) : null,
      }];
    }).sort((left, right) => left.id.localeCompare(right.id));
    return Object.freeze(models);
  }

  async review(input: OpenRouterReviewRequest): Promise<OpenRouterReviewResponse> {
    if (!this.supportedModels.has(input.model)) throw new Error("OpenRouter model is not supported");
    if (!/^[a-z][a-z0-9_-]{2,63}$/.test(input.schemaName)) throw new Error("review schema name is invalid");
    if (input.prompt.length === 0) throw new Error("review prompt is invalid");
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: input.model,
          messages: [{ role: "user", content: input.prompt }],
          reasoning: { effort: input.reasoning },
          response_format: {
            type: "json_schema",
            json_schema: { name: input.schemaName, strict: true, schema: input.schema },
          },
          provider: { require_parameters: true },
          stream: false,
        }),
      });
    } catch (error) {
      recordCaughtError(error, "src/openrouter-review.ts:306");
      throw Object.assign(new OpenRouterReviewError("OpenRouter transport failed", transportFailureDiagnostic(error)), { cause: error });
    }
    const raw = response.ok
      ? await readCompleteText(response)
      : await readBoundedText(response, 16_384);
    if (raw.truncated) {
      let partialBody: Record<string, unknown> | null = null;
      try {
        partialBody = nullableRecord(JSON.parse(raw.text));
      } catch (caughtError) {
        recordCaughtError(caughtError, "src/openrouter-review.ts:316");
        // A bounded prefix is commonly not complete JSON. The encrypted diagnostic
        // retains that prefix and its hash without exposing it to the caller.
      }
      throw new OpenRouterReviewError(
        "OpenRouter response body exceeded the trusted limit",
        diagnosticFromBody(response, "response_body", partialBody, raw, response.ok),
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.text);
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/openrouter-review.ts:328");
      throw Object.assign(new OpenRouterReviewError(
        response.ok ? "OpenRouter response JSON is invalid" : `OpenRouter HTTP ${response.status}`,
        diagnosticFromBody(response, response.ok ? "response_json" : "http", null, raw, response.ok),
      ), { cause: caughtError });
    }
    const body = nullableRecord(parsed);
    if (!response.ok) {
      throw new OpenRouterReviewError(
        `OpenRouter HTTP ${response.status}`,
        diagnosticFromBody(response, "http", body, raw, false),
      );
    }
    let rawResponse: Record<string, unknown>;
    try {
      rawResponse = asRecord(body, "OpenRouter review response");
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/openrouter-review.ts:344");
      throw Object.assign(new OpenRouterReviewError(
        "OpenRouter response contract is invalid",
        diagnosticFromBody(response, "response_contract", body, raw, true),
      ), { cause: caughtError });
    }
    if (!Array.isArray(rawResponse.choices) || rawResponse.choices.length !== 1) {
      throw new OpenRouterReviewError(
        "OpenRouter response has an invalid choice count",
        diagnosticFromBody(response, "response_contract", rawResponse, raw, true),
      );
    }
    let choice: Record<string, unknown>;
    let message: Record<string, unknown>;
    try {
      choice = asRecord(rawResponse.choices[0], "OpenRouter review choice");
      message = asRecord(choice.message, "OpenRouter review message");
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/openrouter-review.ts:361");
      throw Object.assign(new OpenRouterReviewError(
        "OpenRouter response message contract is invalid",
        diagnosticFromBody(response, "response_contract", rawResponse, raw, true),
      ), { cause: caughtError });
    }
    if (typeof message.content !== "string" || message.content.length === 0) {
      throw new OpenRouterReviewError(
        "OpenRouter response has no structured content",
        diagnosticFromBody(response, "structured_content", rawResponse, raw, true),
      );
    }
    let result: Readonly<Record<string, unknown>>;
    try {
      result = Object.freeze(asRecord(JSON.parse(message.content), "OpenRouter structured result"));
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/openrouter-review.ts:376");
      throw Object.assign(new OpenRouterReviewError(
        "OpenRouter structured result is not valid JSON",
        diagnosticFromBody(response, "structured_json", rawResponse, raw, true),
      ), { cause: caughtError });
    }
    return Object.freeze({
      model: typeof rawResponse.model === "string" ? rawResponse.model : input.model,
      providerRequestId: typeof rawResponse.id === "string" ? rawResponse.id : null,
      result,
      rawResponse: Object.freeze(rawResponse),
    });
  }

  async proxyResponses(
    input: Readonly<Record<string, unknown>>,
  ): Promise<OpenRouterResponsesProxyResponse> {
    const model = boundedString(input.model, 240);
    if (model === null || !this.supportedModels.has(model)) {
      throw new Error("OpenRouter model is not supported");
    }
    const text = nullableRecord(input.text);
    const format = nullableRecord(text?.format);
    if (format?.type !== "json_schema" || nullableRecord(format.schema) === null ||
        boundedString(format.name, 100) === null) {
      throw new Error("OpenRouter review requires a JSON output schema");
    }
    const isHostedSearch = (tool: unknown): boolean => {
      const type = nullableRecord(tool)?.type;
      return typeof type === "string" &&
        (type === "web_search" || type.startsWith("web_search_preview") ||
          type === "openrouter:web_search");
    };
    if (isHostedSearch(input.tool_choice)) {
      throw new Error("Hosted web search is disabled for independent reviews");
    }
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiUrl}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          ...input,
          model,
          store: false,
          // Keep old containers compatible without enabling hosted search. The
          // independent reviewer reads its supplied sources using local tools.
          tools: Array.isArray(input.tools) ? input.tools.filter((tool) => !isHostedSearch(tool)) : input.tools,
          // DeepSeek endpoints reject this optional Codex parameter even when
          // false. Keep schema routing strict; omit the unsupported parameter.
          parallel_tool_calls: undefined,
          text: { ...text, format: { ...format, strict: true } },
          // Host policy, not a model-controlled routing preference. Unsupported
          // providers must reject routing rather than silently ignore the schema.
          // Pin the endpoint proven with the real Codex tool + schema contract.
          // Model-level structured-output support alone is not enough.
          provider: { require_parameters: true, only: ["baidu"] },
        }),
      });
    } catch (error) {
      recordCaughtError(error, "src/openrouter-review.ts:439");
      throw Object.assign(new OpenRouterReviewError("OpenRouter transport failed", transportFailureDiagnostic(error)), { cause: error });
    }
    const raw = response.ok
      ? await readCompleteText(response)
      : await readBoundedText(response, 16_384);
    let parsed: Record<string, unknown> | null = null;
    if (!raw.truncated && raw.text.length > 0 &&
        !response.headers.get("content-type")?.toLowerCase().includes("text/event-stream")) {
      try {
        parsed = nullableRecord(JSON.parse(raw.text));
      } catch (caughtError) {
        recordCaughtError(caughtError, "src/openrouter-review.ts:449");
        // Streaming Responses are SSE rather than one JSON document.
      }
    }
    if (raw.truncated) {
      throw new OpenRouterReviewError(
        "OpenRouter response body exceeded the trusted limit",
        diagnosticFromBody(response, "response_body", parsed, raw, response.ok),
      );
    }
    if (!response.ok) {
      throw new OpenRouterReviewError(
        `OpenRouter HTTP ${response.status}`,
        diagnosticFromBody(response, "http", parsed, raw, false),
      );
    }
    const contentType = boundedString(response.headers.get("content-type"), 240) ??
      "application/json";
    return Object.freeze({
      status: response.status,
      contentType,
      body: raw.text,
      providerRequestId: requestId(response, parsed) ?? responseIdFromSse(raw.text),
    });
  }
}
