export interface VerificationFeedback {
  ready: boolean;
  code?: string;
  message?: string;
  [key: string]: unknown;
}
export interface CompletionResult { code: number | null; signal: string | null }
export function runImplementationCompletion(options: {
  result: CompletionResult;
  outcome: string | null;
  sessionId: string | null;
  check: () => Promise<VerificationFeedback>;
  resume: (input: { sessionId: string; promptPath: string; prompt: string }) => Promise<CompletionResult & { outcome: string | null }>;
  deadline: number;
  feedbackRoot: string;
  journal: string;
  now?: () => number;
}): Promise<{ result: CompletionResult; accepted: boolean }>;
