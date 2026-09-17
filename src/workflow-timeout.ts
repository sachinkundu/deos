/** Recognize only the expected exception from a waitForEvent checkpoint. */
export function isWorkflowEventTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "WorkflowTimeoutError") return true;
  // Cloudflare RPC preserves the remote stack but restores the name as Error.
  return error.name === "Error" && "remote" in error && error.remote === true &&
    /^Execution timed out after \d+ms$/.test(error.message) &&
    error.stack?.startsWith(`WorkflowTimeoutError: ${error.message}\n`) === true &&
    /\bat ContextImpl\.waitForEvent\b/.test(error.stack);
}
