export function notifyAttemptCompletion(
  job: { capabilityUrl: string; capabilityToken: string; attemptId: string; deadline: string },
  options?: { fetcher?: typeof fetch; recordError?: (error: unknown, location: string) => void; now?: () => number },
): Promise<boolean>;
