import { appendFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { originalErrorText } from "./original-errors.mjs";

const transportCodes = new Set([
  "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET", "ECONNRESET", "EPIPE",
]);
const recoverable = (error) => {
  const seen = new Set();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    if (error.name === "TimeoutError" || transportCodes.has(error.code)) return true;
    error = error.cause;
  }
  return false;
};

// Verification reads the trusted snapshot and evidence. It cannot publish or
// call providers. Never reuse this transport for an effectful broker action.
export async function requestVerification(url, init, {
  deadline, journal, request = fetch, timeoutMs = 20_000, now = Date.now,
}) {
  if (init.method !== "POST" || typeof init.body !== "string" || JSON.parse(init.body).action !== "verify")
    throw new Error("Verification transport only accepts the read-only verify action");
  const failures = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const remaining = deadline - now();
    if (!Number.isFinite(remaining) || remaining <= 0)
      throw new AggregateError(failures, "Implementation verification deadline reached", { cause: failures[0] });
    try {
      const response = await request(url, {
        ...init, signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))),
      });
      // Keep the timeout active until the response body has also arrived.
      const text = await response.text();
      return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      failures.push(error);
      try {
        await appendFile(journal, JSON.stringify({ operation: "verification.transport", attempt,
          occurredAt: new Date(now()).toISOString(), message: error instanceof Error ? error.message : String(error),
          detail: originalErrorText(error) }) + "\n", { mode: 0o600 });
      } catch (diagnosticError) {
        throw new AggregateError([...failures, diagnosticError], "Could not retain verification transport failure", { cause: failures[0] });
      }
      if (!recoverable(error) || attempt === 3 || now() >= deadline)
        throw failures.length === 1 ? error : new AggregateError(failures, "Implementation verification transport failed", { cause: failures[0] });
      await sleep(Math.min(attempt * 1000, Math.max(0, deadline - now())));
    }
  }
}
