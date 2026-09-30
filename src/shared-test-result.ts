/** A completion label cannot override an explicitly reported unresolved blocker.
 * Keep the original artifact unchanged; use this only for trusted classification. */
export function sharedTestResultHasBlocker(result: Record<string, unknown>): boolean {
  return typeof result.blocker === 'string' && result.blocker.trim().length > 0;
}
