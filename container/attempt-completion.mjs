import { recordCaughtError } from "./original-errors.mjs";

/** Final output is already closed. Delivery is a hint, never a success receipt. */
export async function notifyAttemptCompletion(job, { fetcher = fetch, recordError = recordCaughtError, now = Date.now } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Leave time for the supervisor to exit. Never spend the work's remaining
    // lifetime on this optional request; the heartbeat can observe it instead.
    const remaining = Math.floor(Date.parse(job.deadline) - now() - 1_000);
    if (!Number.isFinite(remaining) || remaining <= 0) return false;
    try {
      const response = await fetcher(`${job.capabilityUrl}/attempt-completed`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${job.capabilityToken}`,
          "Deos-Attempt": job.attemptId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: 1 }),
        signal: AbortSignal.timeout(Math.min(3_000, remaining)),
      });
      if (!response.ok) {
        throw new Error(`Attempt completion notification HTTP ${response.status}: ${await response.text()}`);
      }
      await response.arrayBuffer();
      return true;
    } catch (error) {
      // Heartbeat reconciliation is the recovery path for a failed wake-up.
      recordError(error, "supervisor completion notification");
    }
  }
  return false;
}
