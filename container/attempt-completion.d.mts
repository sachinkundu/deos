export function notifyAttemptCompletion(
  job: { capabilityUrl: string; capabilityToken: string; attemptId: string },
  options?: { fetcher?: typeof fetch; recordError?: (error: unknown, location: string) => void },
): Promise<boolean>;
