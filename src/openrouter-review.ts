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
    ? value.slice(0, maximum)
    : null;

const safeProviderMessage = (value: unknown): string | null => {
  const message = boundedString(value);
  if (message === null) return null;
  return message
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk|or)-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(
      /("(?:api[_-]?key|authorization|token|secret)"\s*:\s*")[^"]+("\s*)/gi,
      "$1[redacted]$2",
    );
};

const transportFailureDiagnostic = (error: unknown): OpenRouterFailureDiagnostic => {
  const record = error instanceof Error
    ? { name: error.name, message: error.message, cause: error.cause }
    : { name: "UnknownError", message: String(error), cause: null };
  let raw: string;
  try {
    raw = JSON.stringify(record, (_key, value) =>
      value instanceof Error
        ? { name: value.name, message: value.message, cause: value.cause }
        : value) ?? "{}";
  } catch {
    raw = JSON.stringify({ name: record.name, message: record.message });
  }
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
    rawResponseBody: raw.slice(0, 16_384),
  };
};

const providerScalar = (value: unknown): string | null =>
  typeof value === "string" || typeof value === "number"
    ? String(value).slice(0, 240)
    : null;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const readBoundedText = async (
  response: Response,
  maximumBytes: number,
): Promise<{ text: string; truncated: boolean; sha256: string | null }> => {
  if (response.body === null) return { text: "", truncated: false, sha256: await sha256Hex("") };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const remaining = maximumBytes - received;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    const accepted = next.value.byteLength > remaining
      ? next.value.slice(0, remaining)
      : next.value;
    chunks.push(accepted);
    received += accepted.byteLength;
    if (accepted.byteLength !== next.value.byteLength) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
  return { text, truncated, sha256: await sha256Hex(text) };
};

const readCompleteText = async (
  response: Response,
): Promise<{ text: string; truncated: false; sha256: string }> => {
  const text = await response.text();
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
    } catch {
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
    if (!response.ok) throw new Error("OpenRouter model discovery failed");
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
      throw new OpenRouterReviewError("OpenRouter transport failed", transportFailureDiagnostic(error));
    }
    const raw = response.ok
      ? await readCompleteText(response)
      : await readBoundedText(response, 16_384);
    if (raw.truncated) {
      let partialBody: Record<string, unknown> | null = null;
      try {
        partialBody = nullableRecord(JSON.parse(raw.text));
      } catch {
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
    } catch {
      throw new OpenRouterReviewError(
        response.ok ? "OpenRouter response JSON is invalid" : `OpenRouter HTTP ${response.status}`,
        diagnosticFromBody(response, response.ok ? "response_json" : "http", null, raw, response.ok),
      );
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
    } catch {
      throw new OpenRouterReviewError(
        "OpenRouter response contract is invalid",
        diagnosticFromBody(response, "response_contract", body, raw, true),
      );
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
    } catch {
      throw new OpenRouterReviewError(
        "OpenRouter response message contract is invalid",
        diagnosticFromBody(response, "response_contract", rawResponse, raw, true),
      );
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
    } catch {
      throw new OpenRouterReviewError(
        "OpenRouter structured result is not valid JSON",
        diagnosticFromBody(response, "structured_json", rawResponse, raw, true),
      );
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
          provider: undefined,
        }),
      });
    } catch (error) {
      throw new OpenRouterReviewError("OpenRouter transport failed", transportFailureDiagnostic(error));
    }
    const raw = response.ok
      ? await readCompleteText(response)
      : await readBoundedText(response, 16_384);
    let parsed: Record<string, unknown> | null = null;
    if (!raw.truncated && raw.text.length > 0) {
      try {
        parsed = nullableRecord(JSON.parse(raw.text));
      } catch {
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
