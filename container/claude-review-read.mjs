import { readCommand, readSnapshot } from "./native-review-read.mjs";
// Both arguments are encoded by the service. No model input reaches a shell.
try {
  const state = JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8"));
  const command = Buffer.from(process.argv[3], "base64url").toString("utf8");
  const text = await readSnapshot(readCommand(command), state);
  if (Buffer.byteLength(text) > 262144) throw new Error("read exceeds limit");
  process.stdout.write(text);
} catch {
  process.stderr.write("read-only review request rejected\n");
  process.exitCode = 1;
}
