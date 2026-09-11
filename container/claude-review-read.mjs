import { pathToFileURL } from "node:url";
import { readCommand, readSnapshot } from "./native-review-read.mjs";
export const claudeReadCommand = command => {
  const parsed = readCommand(command);
  // These root aliases list the same frozen inventory as bare ls, never the filesystem.
  if (parsed.op === "ls" && parsed.args.length === 1 &&
      [".", "./", "/deos/workspace/repository", "/deos/workspace/repository/"].includes(parsed.args[0])) parsed.args = [];
  return parsed;
};

// Both arguments are encoded by the service. No model input reaches a shell.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) try {
  const state = JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8"));
  const command = Buffer.from(process.argv[3], "base64url").toString("utf8");
  const text = await readSnapshot(claudeReadCommand(command), state);
  if (Buffer.byteLength(text) > 262144) throw new Error("read exceeds limit");
  process.stdout.write(text);
} catch {
  process.stderr.write("read-only review request rejected\n");
  process.exitCode = 1;
}
