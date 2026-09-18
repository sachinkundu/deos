/** Retry only a failed provider turn, never an individual tool/browser action. */
export const PROVIDER_RETRY_DELAYS_MS = Object.freeze([15_000, 45_000, 120_000]);

export const providerRetryReason = (error) => {
  // Inspect the trusted terminal provider event, not arbitrary tool output or
  // stderr. Permanent quota/auth/configuration errors need a different remedy.
  const terminal = error?.cause?.failures?.at(-1);
  const message = terminal?.error?.message ?? terminal?.message;
  if (typeof message !== "string") return null;
  if (/usage limit|quota|insufficient.quota|billing|unauthori[sz]ed|invalid.api.key|refresh.token|permission denied/i.test(message)) return null;
  if (/^Selected model is at capacity\./i.test(message)) return "model_capacity";
  if (/\b(?:overloaded|temporarily unavailable|service unavailable)\b/i.test(message)) return "provider_unavailable";
  if (/^stream disconnected before completion\b/i.test(message)) return "provider_stream_disconnected";
  return null;
};

export const PROVIDER_RESUME_PROMPT = `The previous model turn stopped because of a temporary provider failure. Continue from the saved session and current workspace. Preserve completed work, approved inputs, review feedback and existing evidence. Before repeating any command or external action, inspect its saved receipt and current state: the prior command may already have completed. Do not replay an uncertain browser action; use the runtime's documented reconciliation or whole-scenario reset. Continue only the remaining work. Keep the assigned model and original completion contract.`;

/** One shared budget per supervisor attempt, including completion-repair turns. */
export function createProviderRetry({ deadline, record, sleep, now = Date.now, random = Math.random }) {
  let retries = 0;
  return async ({ run, sessionId }) => {
    let resume = false;
    while (true) {
      const { result, error } = await run(resume ? sessionId() : undefined);
      if (!error) return result;
      const reason = providerRetryReason(error);
      if (!reason) return result;
      const delay = PROVIDER_RETRY_DELAYS_MS[retries];
      const delayMs = delay === undefined ? null : Math.ceil(delay * (1 + random() * 0.2));
      const exhausted = delayMs === null || now() + delayMs >= deadline;
      // Persist the original failure and decision before waiting or exiting.
      await record({ error, reason, retry: retries + 1, delayMs: exhausted ? null : delayMs,
        outcome: exhausted ? "exhausted" : "waiting", sessionId: sessionId(),
        observedAt: new Date(now()).toISOString() });
      if (exhausted) return result;
      retries += 1;
      await sleep(delayMs);
      // Sleep can overshoot. Do not launch a child after the attempt deadline.
      if (now() >= deadline) return result;
      resume = true;
    }
  };
}
