import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const MAXIMUM_PATCH_BYTES = 10 * 1024 * 1024;
const NO_CHANGES = "# No repository changes in this attempt.\n";

const capture = (args, cwd, environment, maximumBytes = MAXIMUM_PATCH_BYTES) =>
  new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let rejected = false;
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        rejected = true;
        child.kill("SIGKILL");
        reject(new Error("repository patch exceeds its limit"));
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (rejected) return;
      resolve({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });

const requireGitSuccess = async (args, cwd, environment) => {
  const result = await capture(args, cwd, environment);
  if (result.code !== 0) throw new Error("repository patch capture failed");
  return result.stdout;
};

export const captureRepositoryPatch = async (cwd) => {
  const temporary = await mkdtemp(join(tmpdir(), "deos-patch-index-"));
  const environment = { ...process.env, GIT_INDEX_FILE: join(temporary, "index") };
  try {
    await requireGitSuccess(["read-tree", "HEAD"], cwd, environment);
    await requireGitSuccess(["add", "-A", "--"], cwd, environment);
    const patch = await requireGitSuccess(
      ["diff", "--cached", "--binary", "HEAD", "--"],
      cwd,
      environment,
    );
    return patch || NO_CHANGES;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
};
