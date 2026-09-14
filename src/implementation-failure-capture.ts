import type { AgentAttemptRecord, SandboxProcessView, SandboxView } from "./sandbox-controller.ts";
import { errorDetails } from "./error-details.ts";
import { recordCaughtError } from "./error-context.ts";

export const implementationFailureFiles = [
  "implementation-recovery.json", "recovery-patch.diff", "supervisor-process.json",
] as const;

// Installed under the root-owned run directory. This uses the image's trusted
// snapshot code, never repository code, and makes no readiness or proof claim.
export const implementationFailureProgram = String.raw`
import { readFile, writeFile, rename, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const request = JSON.parse(await readFile(process.argv[2], 'utf8'));
const { snapshot } = await import(request.runtimeModule);
const save = async (name, content) => {
  const temporary = join(request.runRoot, name + '.tmp');
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, join(request.outputRoot, name));
};
const { patch, ...subject } = await snapshot(request.cwd);
if (subject.testedBaseSha !== request.testedBaseSha) throw new Error('Failure snapshot base differs from frozen attempt');
await save('recovery-patch.diff', patch);
await save('implementation-recovery.json', JSON.stringify({
  version: 1, purpose: 'recovery-only', runId: request.runId,
  attemptId: request.attemptId, kind: request.kind, change: request.change,
  approvedDesignSha: request.approvedDesignSha, ...subject,
  patchSha: createHash('sha256').update(patch).digest('hex'),
}));
// A killed supervisor may not have finalized its private capture streams.
// Each attempt owns a fresh sandbox. Refuse ambiguous or author-owned sources.
for (const [name, destination] of [['transcript.jsonl', 'transcript.jsonl'], ['stderr.txt', 'validation.txt']]) {
  try { await lstat(join(request.outputRoot, destination)); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const directories = (await readdir(request.tempRoot)).filter(entry => entry.startsWith('deos-' + name + '-'));
  const trusted = [];
  for (const directory of directories) {
    const root = join(request.tempRoot, directory);
    const metadata = await lstat(root);
    if (!metadata.isDirectory() || metadata.uid !== process.getuid() || (metadata.mode & 0o077) !== 0) continue;
    const file = join(root, name), fileMetadata = await lstat(file);
    if (!fileMetadata.isFile() || fileMetadata.uid !== process.getuid() || (fileMetadata.mode & 0o077) !== 0) continue;
    trusted.push(file);
  }
  if (trusted.length > 1) throw new Error('Ambiguous private ' + name + ' captures');
  if (trusted.length === 1) await save(destination, await readFile(trusted[0]));
}
`;

export async function captureImplementationFailure(
  attempt: AgentAttemptRecord, sandbox: SandboxView, category: string, process: SandboxProcessView | null,
): Promise<void> {
  const job = JSON.parse(attempt.job_spec_json);
  const kind = attempt.node_id === "implementation_tasks" ? "tasks" : attempt.node_id === "implementation_build" ? "build" : null;
  if (!kind) throw new Error("Failure capture requires an implementation attempt");
  const diagnostic: Record<string, unknown> = { attemptId: attempt.attempt_id, category, processId: process?.id ?? null };
  if (process) {
    try { diagnostic.status = await process.status(); }
    catch (error) { recordCaughtError(error, "implementation.failure.process-status"); diagnostic.statusError = errorDetails(error); }
    try { diagnostic.output = await process.output({ encoding: "utf8", timeout: 10_000, maxBytes: 10 * 1024 * 1024 }); }
    catch (error) { recordCaughtError(error, "implementation.failure.process-output"); diagnostic.outputError = errorDetails(error); }
  }
  await sandbox.writeFile("/deos/output/supervisor-process.json", JSON.stringify(diagnostic));
  recordCaughtError(new Error(`Implementation process stopped: ${category}`, { cause: diagnostic }), "implementation.failure.process");
  // Startup failures before implementation setup have no author work to capture.
  if (!(await sandbox.exists("/deos/run/implementation-input.json")).exists) return;
  const context = JSON.parse(job.materializedContext);
  const request = {
    runtimeModule: "/deos/bin/implementation-runtime.mjs", cwd: "/deos/workspace/repository",
    runRoot: "/deos/run", outputRoot: "/deos/output", tempRoot: "/tmp",
    runId: attempt.run_id, attemptId: attempt.attempt_id, kind,
    change: job.openspecChange, approvedDesignSha: context.approvedDesignSha,
    testedBaseSha: context.testedBaseSha,
  };
  await sandbox.writeFile("/deos/run/implementation-failure-capture.mjs", implementationFailureProgram);
  await sandbox.writeFile("/deos/run/implementation-recovery-request.json", JSON.stringify(request));
  const capture = await sandbox.exec(["node", "/deos/run/implementation-failure-capture.mjs", "/deos/run/implementation-recovery-request.json"], { timeout: 60_000 });
  const output = await capture.output({ encoding: "utf8", timeout: 65_000, maxBytes: 1_048_576 });
  if (output.exitCode !== 0 || output.timedOut || output.truncated) {
    throw new Error(`Implementation failure capture failed after ${category}: ${output.stderr}`, { cause: { category, diagnostic, output } });
  }
}
