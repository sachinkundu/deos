export interface CommandResult {
  code: number | null;
  signal: string | null;
  truncated: boolean;
  stdout: string;
  stderr: string;
}

export interface AuthorCompletionCheck {
  ok: boolean;
  allowedPaths: "passed" | "failed";
  strictOpenSpec: "passed" | "failed";
  whitespace: "passed" | "failed";
  readability: "passed" | "failed" | "not_applicable";
  requiredSections?: "passed" | "failed";
  changedPaths: readonly string[];
  filePaths: readonly string[];
  readabilityByFile: Readonly<Record<string, { fleschReadingEase: number; fleschKincaidGrade: number }>>;
  failures: readonly string[];
}

export function safePlanningPath(change: string, path: string): boolean;
export function safeDesignPath(change: string, path: string): boolean;
export function changedPathsFromPorcelain(value: string): string[];
export function runAuthorCompletionCheck(input: {
  cwd: string;
  change: string;
  execute?: (args: string[], cwd: string, timeout?: number) => Promise<CommandResult>;
}): Promise<AuthorCompletionCheck>;
export function authorCorrectionPrompt(
  check: AuthorCompletionCheck,
  round: number,
  maximumRepairs: number,
): string;
export function designCorrectionPrompt(
  check: AuthorCompletionCheck,
  round: number,
  maximumRepairs: number,
): string;
export function runDesignCompletionCheck(input: {
  cwd: string;
  change: string;
  execute?: (args: string[], cwd: string, timeout?: number) => Promise<CommandResult>;
}): Promise<AuthorCompletionCheck>;
export function runBoundedAuthorCompletion(input: {
  initialCheck: AuthorCompletionCheck;
  initialResult: { code: number | null; signal: string | null; outcome: string | null };
  sessionId: string;
  maximumRepairs: number;
  resume: (input: { sessionId: string; prompt: string }) => Promise<{
    code: number | null;
    signal: string | null;
    outcome: string | null;
  }>;
  check: () => Promise<AuthorCompletionCheck>;
  correctionPrompt?: (
    check: AuthorCompletionCheck,
    round: number,
    maximumRepairs: number,
  ) => string;
  now?: () => string;
}): Promise<{
  check: AuthorCompletionCheck;
  result: { code: number | null; signal: string | null; outcome: string | null };
  rounds: readonly Array<AuthorCompletionCheck & {
    round: number;
    kind: "initial" | "same_session_resume";
    checkedAt: string;
  }>;
}>;
