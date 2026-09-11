import { appendFile } from "node:fs/promises";
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 1_048_576) throw new Error("hook input too large");
}
const hook = JSON.parse(input);
// A missing effort value at Stop is a failed receipt, not an assumed default.
if (hook.hook_event_name === "Stop" || hook.effort) {
  await appendFile("/deos/claude/effort.jsonl", JSON.stringify({
    event: hook.hook_event_name, effort: hook.effort?.level ?? null,
  }) + "\n", { mode: 0o600 });
}
