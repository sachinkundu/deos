export interface RecordedError {
  visitSequence?: number;
  occurredAt: string;
}
export function separateErrors<T extends RecordedError>(errors: T[], run: {
  status: string; currentVisitSequence?: number; failureStartedAt?: string; freshness: string;
}): { failed: boolean; current: T[]; historical: T[] } {
  const failed = ["failed", "blocked", "denied"].includes(run.status);
  const current = failed ? errors.filter(error => error.visitSequence != null && run.currentVisitSequence != null
    ? error.visitSequence >= run.currentVisitSequence - 1
    : error.occurredAt >= (run.failureStartedAt ?? run.freshness)) : [];
  return { failed, current, historical: errors.filter(error => !current.includes(error)) };
}
