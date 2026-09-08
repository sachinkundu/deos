/** Lossless diagnostic serialization. Categories must never replace the thrown value. */
export const errorDetails = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "bigint") return { type: "bigint", value: String(value) };
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => errorDetails(item, seen));
  const result: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(value)) {
    try { result[key] = errorDetails(Reflect.get(value, key), seen); }
    catch (error) { result[key] = { propertyReadError: String(error) }; }
  }
  if (value instanceof Error) {
    result.name = value.name;
    result.message = value.message;
    result.stack = value.stack;
  }
  return result;
};

export const errorText = (value: unknown): string => {
  if (typeof value === "string") return value;
  return JSON.stringify(errorDetails(value), null, 2);
};

export const errorWithContext = (context: string, cause: unknown): Error =>
  new Error(`${cause instanceof Error ? cause.message : String(cause)}\n${context}`, { cause });

export class ProviderResponseError extends Error {
  readonly provider: string;
  readonly status: number;
  readonly responseBody: string;
  readonly responseHeaders: Record<string, string>;
  constructor(
    provider: string,
    status: number,
    responseBody: string,
    responseHeaders: Record<string, string>,
  ) {
    super(`${provider} HTTP ${status}: ${responseBody}`);
    this.name = "ProviderResponseError";
    this.provider = provider; this.status = status; this.responseBody = responseBody; this.responseHeaders = responseHeaders;
  }
}

export const readResponseText = async (response: Response): Promise<string> => {
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return text + decoder.decode();
      text += decoder.decode(next.value, { stream: true });
    }
  } catch (cause) {
    throw Object.assign(errorWithContext("Response body could not be read completely", cause), {
      status: response.status, responseHeaders: Object.fromEntries(response.headers),
      partialBody: text + decoder.decode(), responseIncomplete: true,
    });
  } finally { reader.releaseLock(); }
};

export const responseError = async (provider: string, response: Response): Promise<ProviderResponseError> =>
  new ProviderResponseError(provider, response.status, await readResponseText(response), Object.fromEntries(response.headers));
