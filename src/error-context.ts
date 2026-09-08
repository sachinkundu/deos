import { AsyncLocalStorage } from "node:async_hooks";
import { errorDetails } from "./error-details.ts";

interface CapturedError { location: string; error: unknown; occurredAt: string }
const contexts = new AsyncLocalStorage<{ errors: CapturedError[]; seen: Set<unknown> }>();

/** Capture before a fallback, classification or cleanup can replace the original. */
export const recordCaughtError = (error: unknown, location: string): void => {
  const context = contexts.getStore();
  if (context?.seen.has(error)) return;
  context?.seen.add(error);
  const entry = { location, error: errorDetails(error), occurredAt: new Date().toISOString() };
  if (context) context.errors.push(entry);
  else console.error(JSON.stringify({ event: "deos.original_error", ...entry }));
};

export const captureErrors = async <T>(
  write: (errors: CapturedError[]) => Promise<void>,
  action: () => Promise<T>,
): Promise<T> => contexts.run({ errors: [], seen: new Set() }, async () => {
  let original: unknown;
  let failed = false;
  try { return await action(); }
  catch (error) { failed = true; original = error; recordCaughtError(error, "uncaught"); throw error; }
  finally {
    const errors = contexts.getStore()!.errors;
    if (errors.length) {
      try { await write(errors); }
      catch (storageError) {
        console.error(JSON.stringify({ event: "deos.error_storage_failed", errors, storageError: errorDetails(storageError) }));
        throw new AggregateError(failed ? [original, storageError] : [storageError],
          "Original error storage failed; complete errors are in Workers logs", { cause: original });
      }
    }
  }
});

export const captureWorkflowErrors = <T>(
  db: D1Database, bucket: R2Bucket, runId: string, stepName: string, action: () => Promise<T>,
): Promise<T> => captureErrors(async (errors) => {
  const run = await db.prepare("SELECT current_node, current_visit_sequence FROM orchestration_runs WHERE run_id = ?")
    .bind(runId).first<{ current_node: string; current_visit_sequence: number }>();
  for (const entry of errors) {
    const id = crypto.randomUUID();
    const key = `original-errors/${encodeURIComponent(runId)}/${id}.json`;
    const encoded = JSON.stringify(entry.error);
    // Full payload in R2 avoids D1's row-size limit; the original message stays in D1.
    await bucket.put(key, encoded, { httpMetadata: { contentType: "application/json" } });
    const diagnostic = typeof entry.error === "object" && entry.error !== null && "diagnostic" in entry.error
      ? entry.error.diagnostic as { providerMessage?: string } : null;
    const message = diagnostic?.providerMessage ?? (typeof entry.error === "object" && entry.error !== null && "message" in entry.error
      ? String(entry.error.message) : encoded);
    await db.prepare(`INSERT INTO workflow_errors
      (error_id, run_id, node_id, visit_sequence, step_name, location, message, detail_r2_key, occurred_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, runId, run?.current_node ?? null, run?.current_visit_sequence ?? null,
        stepName, entry.location, message, key, entry.occurredAt).run();
  }
}, action);
