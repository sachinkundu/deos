import type { SandboxView } from "./sandbox-controller.ts";
import { sha256Hex } from "./implementation-hash.ts";
import { countImplementationTasks } from "./implementation-progress.ts";

// Run the read with the author's filesystem permissions, never as sandbox root.
export async function readImplementationTaskProgress(sandbox: SandboxView, change: string) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(change)) throw new Error("Invalid implementation change for progress read");
  const path = `/deos/workspace/repository/openspec/changes/${change}/tasks.md`;
  if (!(await sandbox.exists(path)).exists) return null;
  const command = ["runuser", "-u", "deos-author", "--", "env", "-i", "PATH=/usr/bin:/bin", "cat", "--", path] as const;
  const process = await sandbox.exec(command, { timeout: 5_000 });
  const output = await process.output({ encoding: "utf8", timeout: 10_000, maxBytes: 1_048_576 });
  if (output.exitCode !== 0 || output.timedOut || output.truncated) {
    throw Object.assign(new Error(`Implementation checklist read failed: ${output.stderr || `exit ${output.exitCode}`}`), {
      command, ...output,
    });
  }
  return { ...countImplementationTasks(output.stdout), tasksSha: await sha256Hex(output.stdout), tasks: output.stdout };
}
