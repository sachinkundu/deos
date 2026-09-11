import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
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
  const text = await readSnapshot(claudeReadCommand(command), state);
  if (Buffer.byteLength(text) > 262144) throw new Error("read exceeds limit");
  process.stdout.write(text);
} catch (error) {
  recordCaughtError(error, "container/claude-review-read.mjs");
  process.exitCode = 1;
}
