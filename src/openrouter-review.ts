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

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
};

export const parseSupportedOpenRouterModels = (value: string): readonly string[] => {
  const models = value.split(",").map((model) => model.trim()).filter(Boolean);
  if (
    models.length === 0 || models.length > 50 ||
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
    this.fetcher = input.fetcher ?? fetch;
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
    if (input.prompt.length === 0 || input.prompt.length > 1_000_000) throw new Error("review prompt is invalid");
    const response = await this.fetcher(`${this.apiUrl}/chat/completions`, {
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
        stream: false,
      }),
    });
    if (!response.ok) throw new Error("OpenRouter review call failed");
    const rawResponse = asRecord(await response.json(), "OpenRouter review response");
    if (!Array.isArray(rawResponse.choices) || rawResponse.choices.length !== 1) {
      throw new Error("OpenRouter review response has an invalid choice count");
    }
    const choice = asRecord(rawResponse.choices[0], "OpenRouter review choice");
    const message = asRecord(choice.message, "OpenRouter review message");
    if (typeof message.content !== "string" || message.content.length === 0) {
      throw new Error("OpenRouter review response has no structured content");
    }
    let result: Readonly<Record<string, unknown>>;
    try {
      result = Object.freeze(asRecord(JSON.parse(message.content), "OpenRouter structured result"));
    } catch {
      throw new Error("OpenRouter review response is not valid JSON");
    }
    return Object.freeze({
      model: typeof rawResponse.model === "string" ? rawResponse.model : input.model,
      providerRequestId: typeof rawResponse.id === "string" ? rawResponse.id : null,
      result,
      rawResponse: Object.freeze(rawResponse),
    });
  }
}
