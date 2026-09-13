import { errorDetails } from "./error-details.ts";

/** Protected failure evidence. Redact credential values, never shorten errors. */
export const redactClaudeDiagnostic = (value: unknown, secrets: readonly (string | undefined)[]): unknown => {
  const values = secrets.filter((secret): secret is string => Boolean(secret)).sort((a, b) => b.length - a.length);
  const redact = (item: unknown): unknown => {
    if (typeof item === "string") {
      for (const secret of values) {
        // A diagnostic may itself contain serialized JSON (provider stdout).
        for (const form of new Set([secret, JSON.stringify(secret).slice(1, -1)])) {
          item = (item as string).split(form).join("[REDACTED]");
        }
      }
      return item;
    }
    if (Array.isArray(item)) return item.map(redact);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, redact(entry)]));
    return item;
  };
  return redact(errorDetails(value));
};

export const claudeFailureDiagnostic = (input: {
  error: unknown; stage: string; facts: Record<string, unknown>; events: Record<string, unknown>[];
  stdout: string; stderr: string; streamError?: unknown; brokerFailure?: unknown;
  attemptId?: string; ordinal?: number;
}, secrets: readonly (string | undefined)[]): Record<string, unknown> => {
  const final = input.events.findLast(event => event.type === "result");
  const providerError = input.events.findLast(event => event.is_error === true || event.type === "error");
  const source = providerError ?? final;
  const error = source?.error;
  const providerMessage = typeof source?.result === "string" ? source.result
    : typeof error === "string" ? error
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message
    : input.error instanceof Error ? input.error.message : String(input.error);
  return redactClaudeDiagnostic({
    providerMessage, providerStatus: source?.api_error_status ?? null,
    originalError: input.error, diagnosticStage: input.stage, diagnosticFacts: input.facts,
    providerEvents: input.events, stdout: input.stdout, stderr: input.stderr,
    streamError: input.streamError, brokerFailure: input.brokerFailure,
    attemptId: input.attemptId, ordinal: input.ordinal,
  }, secrets) as Record<string, unknown>;
};
