export const PROVIDER_RETRY_DELAYS_MS: readonly number[];
export const PROVIDER_RESUME_PROMPT: string;
export function providerRetryReason(error: unknown): string | null;
export type RetryReceipt = {error: Error; reason: string; retry: number; delayMs: number | null;
  outcome: "exhausted" | "waiting"; sessionId: string | null; observedAt: string};
export function createProviderRetry(options: {deadline: number; record: (receipt: RetryReceipt) => Promise<void>;
  sleep: (ms: number) => Promise<unknown>; now?: () => number; random?: () => number}):
  <T> (options: {run: (sessionId?: string | null) => Promise<{result: T; error: Error | null}>;
    sessionId: () => string | null}) => Promise<T>;
