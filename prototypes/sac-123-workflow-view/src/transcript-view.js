const directString = (record, keys) => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
};

const nestedString = (value, keys) => {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return directString(value, keys);
};

const objectValue = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;

const readableText = (value) => {
  if (!value || !value.startsWith("{")) return value;
  try {
    const parsed = objectValue(JSON.parse(value));
    return parsed ? directString(parsed, ["summary", "message", "text"]) || value : value;
  } catch {
    return value;
  }
};

const readable = (value) => value
  .replaceAll(/[._-]+/g, " ")
  .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());

export const activityForRecord = (record) => {
  const value = record.value;
  const outerKind = directString(value, ["type", "kind", "event_type", "event", "role"]) || "record";
  const item = objectValue(value.item);
  const itemKind = item ? directString(item, ["type", "kind"]) : null;
  const kind = itemKind || outerKind;
  const tool = directString(value, ["tool_name", "tool", "name"])
    || nestedString(value.tool, ["name", "tool_name"])
    || nestedString(value.data, ["tool_name", "tool", "name"]);
  const lower = kind.toLowerCase();
  let title = readable(kind);
  if (lower === "agent_message") title = "Agent update";
  else if (lower === "command_execution") title = outerKind.endsWith("completed") ? "Command completed" : "Command started";
  else if (lower === "file_change") title = outerKind.endsWith("completed") ? "Files changed" : "Updating files";
  else if (lower.includes("tool") && lower.includes("result")) title = tool ? `Tool result · ${tool}` : "Tool result";
  else if (lower.includes("tool")) title = tool ? `Tool call · ${tool}` : "Tool call";
  else if (lower.includes("assistant") || lower.includes("agent")) title = "Agent update";
  else if (lower.includes("user")) title = "User message";
  else if (lower.includes("status")) title = "Status changed";

  const detailSource = item || value;
  let detail = readableText(directString(detailSource, ["summary", "message", "text", "content", "output", "result", "command"]));
  for (const key of ["data", "payload", "item", "event"]) {
    if (detail) break;
    detail = readableText(nestedString(detailSource[key], ["summary", "message", "text", "content", "output", "result", "command"]));
  }
  return {
    number: record.number,
    timestamp: directString(value, ["timestamp", "created_at", "createdAt", "time"]),
    kind,
    title,
    detail,
    raw: record.raw,
  };
};
