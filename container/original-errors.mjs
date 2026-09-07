import { appendFileSync, mkdirSync } from "node:fs";
import { inspect } from "node:util";

export const originalErrorText = (error) => inspect(error, { depth: null, maxArrayLength: null, maxStringLength: null, breakLength: 100 });

export const recordCaughtError = (error, location) => {
  const entry = { location, message: error instanceof Error ? error.message : String(error),
    detail: originalErrorText(error), occurredAt: new Date().toISOString() };
  process.stderr.write(`${JSON.stringify({ event: "deos.original_error", ...entry })}\n`);
  const outputRoot = process.env.DEOS_ERROR_OUTPUT_ROOT ?? "/deos/output";
  try {
    mkdirSync(outputRoot, { recursive: true, mode: 0o700 });
    appendFileSync(`${outputRoot}/original-errors.jsonl`, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch (storageError) {
    process.stderr.write(`${originalErrorText(new AggregateError([error, storageError], "Could not save original error"))}\n`);
  }
};
