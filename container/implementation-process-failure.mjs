/** Preserve a failed Codex turn before any completion-file validation runs. */
export function implementationProcessFailure(result, transcript, stderr) {
  if (result.code === 0) return null;
  let failures = [];
  const malformed = [];
  for (const line of transcript.split("\n").filter(Boolean)) {
    let event;
    try { event = JSON.parse(line); }
    catch (error) { malformed.push({ line, message: error.message }); continue; }
    // A resumed turn must not inherit a previous turn's failure as its cause.
    if (event.type === "turn.started" || event.type === "thread.started") failures = [];
    if (event.type === "error" || event.type === "turn.failed") failures.push(event);
  }
  const terminal = failures.at(-1);
  const message = terminal?.error?.message ?? terminal?.message ??
    `Codex exited with code ${result.code} and signal ${result.signal ?? "none"}`;
  const error = new Error(message, { cause: { process: result, failures, malformed, stderr } });
  error.safeErrorCategory = "codex_exit_nonzero";
  error.exitCode = result.code;
  error.signal = result.signal;
  return error;
}
