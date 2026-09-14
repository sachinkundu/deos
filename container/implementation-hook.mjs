import { readFile } from "node:fs/promises";
let input = "";
for await (const chunk of process.stdin) input += chunk;
const event = JSON.parse(input);
const deny = (reason) => ({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
});
let result = {};
if (event.hook_event_name === "PreToolUse") {
  if (event.tool_name === "Bash") {
    const original = event.tool_input.command ?? event.tool_input.cmd;
    if (typeof original !== "string") result = deny("Shell command missing");
    else {
      const quote = "'" + original.replaceAll("'", "'\\''") + "'";
      const command = `runuser -u deos-author -- env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/deos-author bash -c ${quote}`;
      result = {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "allow",
          updatedInput: {
            ...event.tool_input,
            ...(event.tool_input.command === undefined
              ? { cmd: command }
              : { command }),
          },
        },
      };
    }
  } else if (
    event.tool_name === "WebSearch" ||
    event.tool_name === "web_search"
  ) {
    result = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  } else if (
    event.tool_name.endsWith("view_image") &&
    /^\/deos\/implementation\/browser-[a-f0-9]{64}\.png$/.test(
      event.tool_input.path ?? "",
    )
  ) {
    await readFile(event.tool_input.path);
    result = {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    };
  } else if (!event.tool_name.endsWith("update_plan"))
    result = deny(
      "Use shell tools for repository work and deos-implementation for checked browser, commands and docs. Provider tools and child agents are unavailable.",
    );
}
if (event.hook_event_name === "SubagentStart")
  throw new Error("Implementation jobs cannot allocate additional agents");
process.stdout.write(JSON.stringify(result));
