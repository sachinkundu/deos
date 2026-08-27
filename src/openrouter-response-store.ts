export interface OpenRouterStoredResponse {
  operationId: string;
  status: number;
  contentType: string;
  body: string;
  providerRequestId: string | null;
}

export interface OpenRouterResponseStore {
  put(input: OpenRouterStoredResponse & { now: string }): Promise<void>;
  get(operationId: string): Promise<OpenRouterStoredResponse | null>;
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export class D1R2OpenRouterResponseStore implements OpenRouterResponseStore {
  constructor(
    private readonly database: D1Database,
    private readonly bucket: R2Bucket,
  ) {}

  async put(input: OpenRouterStoredResponse & { now: string }): Promise<void> {
    const bodySha256 = await sha256Hex(input.body);
    const operationSha256 = await sha256Hex(input.operationId);
    const r2Key = `protected/openrouter-responses/${operationSha256}.response`;
    const existing = await this.bucket.get(r2Key);
    if (existing === null) {
      await this.bucket.put(r2Key, input.body, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: input.contentType },
        customMetadata: {
          classification: "protected-model-response-v1",
          sha256: bodySha256,
        },
      });
    } else if (await sha256Hex(await existing.text()) !== bodySha256) {
      throw new Error("OpenRouter response object conflict");
    }
    const readBack = await this.bucket.get(r2Key);
    if (readBack === null || await sha256Hex(await readBack.text()) !== bodySha256) {
      throw new Error("OpenRouter response object read-back failed");
    }
    await this.database.prepare(
      `INSERT OR IGNORE INTO openrouter_response_receipts
       (operation_id, r2_key, response_sha256, http_status, content_type,
        provider_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.operationId,
      r2Key,
      bodySha256,
      input.status,
      input.contentType,
      input.providerRequestId,
      input.now,
    ).run();
    const stored = await this.database.prepare(
      `SELECT r2_key, response_sha256, http_status, content_type, provider_request_id
       FROM openrouter_response_receipts WHERE operation_id = ?`,
    ).bind(input.operationId).first<{
      r2_key: string;
      response_sha256: string;
      http_status: number;
      content_type: string;
      provider_request_id: string | null;
    }>();
    if (
      stored?.r2_key !== r2Key || stored.response_sha256 !== bodySha256 ||
      stored.http_status !== input.status || stored.content_type !== input.contentType ||
      stored.provider_request_id !== input.providerRequestId
    ) throw new Error("OpenRouter response receipt identity mismatch");
  }

  async get(operationId: string): Promise<OpenRouterStoredResponse | null> {
    const stored = await this.database.prepare(
      `SELECT r2_key, response_sha256, http_status, content_type, provider_request_id
       FROM openrouter_response_receipts WHERE operation_id = ?`,
    ).bind(operationId).first<{
      r2_key: string;
      response_sha256: string;
      http_status: number;
      content_type: string;
      provider_request_id: string | null;
    }>();
    if (stored === null) return null;
    const object = await this.bucket.get(stored.r2_key);
    if (object === null) throw new Error("OpenRouter response object is missing");
    const body = await object.text();
    if (await sha256Hex(body) !== stored.response_sha256) {
      throw new Error("OpenRouter response object digest mismatch");
    }
    return Object.freeze({
      operationId,
      status: stored.http_status,
      contentType: stored.content_type,
      body,
      providerRequestId: stored.provider_request_id,
    });
  }
}
