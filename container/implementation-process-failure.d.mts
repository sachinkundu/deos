type ProcessResult = { code: number | null; signal: string | null };
type ProcessFailure = Error & {
  safeErrorCategory: "codex_exit_nonzero";
  exitCode: number | null;
  signal: string | null;
  cause: {
    process: ProcessResult;
    failures: unknown[];
    malformed: { line: string; message: string }[];
    stderr: string;
  };
};
export function implementationProcessFailure(result: ProcessResult, transcript: string, stderr: string): ProcessFailure | null;
