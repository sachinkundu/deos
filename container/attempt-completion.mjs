import { recordCaughtError } from "./original-errors.mjs";

/** Final output is already closed. Delivery is a hint, never a success receipt. */
export async function notifyAttemptCompletion(job, { fetcher = fetch, recordError = recordCaughtError } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetcher(`${job.capabilityUrl}/attempt-completed`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${job.capabilityToken}`,
          "Deos-Attempt": job.attemptId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ version: 1 }),
        signal: AbortSignal.timeout(3_000),
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
