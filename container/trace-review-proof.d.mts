export const MAXIMUM_PROOF_REPAIRS: 2;

export function findingSetFingerprint(review: unknown): string;
export function parseCodexFinalMessage(message: unknown): unknown;
export function reviewPromptWithSchema(prompt: string, schema: string, provider: "codex" | "openrouter"): string;
export function validateDiscoveryProofShape(review: unknown): void;
export function codexSessionId(stdout: string): string;
export function codexReviewArgs(input: {
  sessionId: string | null;
  cwd: string;
  model: string;
  reasoning: string;
  schema: string;
  destination: string;
  modelProvider?: "codex" | "openrouter";
  capabilityUrl?: string | null;
}): string[];
export function reviewResultPayload(provider: "codex" | "openrouter", generated: unknown): unknown;
export function canonicalRecheckResolutions(
  resolutions: Array<Record<string, any>>,
  change: string,
  documents: Array<{ file: string; source: string }>,
): Array<Record<string, any>>;
export function proofRepairPrompt(input: {
  basePrompt: string;
  prior: unknown;
  failure: string;
  repair: number;
  maximumRepairs: number;
}): string;

export function runBoundedProofReview<T>(input: {
  maximumRepairs: number;
  generate(args: {
    attempt: number;
    repair: number;
    maximumRepairs: number;
    prior: unknown;
    failure: string | null;
    sessionId: string | null;
  }): Promise<{ raw: unknown; sessionId?: string | null }>;
  validate(raw: unknown, attempt: number): Promise<T>;
}): Promise<{
  accepted: T;
  rawJudgments: unknown[];
  proofRepairCount: number;
  sessionId: string | null;
  validatorFailures: string[];
}>;
