import { recordCaughtError } from "./error-context.ts";

type Fields = Readonly<Record<string, unknown>>;
export interface GitHubReadbackContext {
  message: string;
  repository: string;
  operationId: string;
  phase: string;
}

export class GitHubReadbackMismatchError extends Error {
  readonly context: GitHubReadbackContext;
  readonly attempt: number;
  readonly mismatches: Record<string, { expected: unknown; actual: unknown }>;

  constructor(context: GitHubReadbackContext, attempt: number, expected: Fields, actual: Fields) {
    super(context.message);
    this.name = "GitHubReadbackMismatchError";
    this.context = context;
    this.attempt = attempt;
    this.mismatches = Object.fromEntries(Object.entries(expected)
      .filter(([field, value]) => !Object.is(value, actual[field]))
      .map(([field, value]) => [field, { expected: value, actual: actual[field] }]));
  }
}

/** Recheck observations only. The expected identity/content never changes and writes never replay here. */
export const confirmGitHubReadback = async <T>(
  context: GitHubReadbackContext,
  expected: Fields,
  read: () => Promise<{ value: T; actual: Fields }>,
  pause: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<T> => {
  const delays = [250, 1000, 2500];
  for (let attempt = 1; ; attempt += 1) {
    // Transport, parsing, and boundary errors propagate through their existing recovery paths.
    const { value, actual } = await read();
    const error = new GitHubReadbackMismatchError(context, attempt, expected, actual);
    if (Object.keys(error.mismatches).length === 0) return value;
    recordCaughtError(error, `github-readback:${context.phase}`);
    const delay = delays[attempt - 1];
    if (delay === undefined) throw error;
    await pause(delay);
  }
};
