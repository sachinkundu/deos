import { pathToFileURL } from "node:url";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { recordCaughtError } from "./original-errors.mjs";
import { readCommand, readSnapshot } from "./native-review-read.mjs";
export const claudeReadCommand = command => {
  const parsed = readCommand(command);
  // These root aliases list the same frozen inventory as bare ls, never the filesystem.
  if (parsed.op === "ls" && parsed.args.length === 1 &&
      [".", "./", "/deos/workspace/repository", "/deos/workspace/repository/"].includes(parsed.args[0])) parsed.args = [];
  return parsed;
};

// The service writes each complete request before launching this reader.
// Only a file path reaches argv, regardless of the context size.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) try {
  if (process.argv.length !== 4 || process.argv[2] !== "--request-file") {
    throw new Error("Claude read tool requires --request-file PATH");
  }
  const { state, command } = JSON.parse(await readFile(process.argv[3], "utf8"));
  let sourceRoot;
  if (state.phase === "design") {
    // Design review snapshots may include an unpublished draft absent from the
    // checkout. Materialize the frozen inputs, never substitute checkout files.
    const context = JSON.parse(state.reviewJob.materializedContext);
    const sources = context.designReview.sources;
    if (sources.length !== state.before.length) throw new Error("design review source inventory mismatch");
    sourceRoot = await mkdtemp(join(dirname(process.argv[3]), "sources-"));
    const seen = new Set();
    for (const source of sources) {
      if (typeof source.path !== "string" || source.path.startsWith("/") ||
          source.path.split("/").some(part => !part || part === "." || part === "..") ||
          seen.has(source.path) || typeof source.content !== "string") throw new Error("invalid design review source");
      seen.add(source.path);
      const expected = state.before.find(file => file.path === source.path);
      const hash = createHash("sha256").update(source.content).digest("hex");
      if (!expected || hash !== expected.sha256 || hash !== source.sha256) throw new Error("design review source hash mismatch");
      const path = join(sourceRoot, source.path);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, source.content, { flag: "wx", mode: 0o600 });
    }
  }
  const text = await readSnapshot(claudeReadCommand(command), state, sourceRoot);
  if (Buffer.byteLength(text) > 262144) throw new Error("read exceeds limit");
  process.stdout.write(text);
} catch (error) {
  recordCaughtError(error, "container/claude-review-read.mjs");
  process.exitCode = 1;
}
