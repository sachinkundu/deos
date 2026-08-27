export interface TranscriptRecordDto {
  number: number;
  raw: string;
  value: Record<string, unknown>;
}

export interface TranscriptDto {
  attemptId: string;
  runId: string;
  runSequence: number;
  issueKey: string;
  nodeId: string;
  byteSize: number;
  sha256: string;
  eventCount: number;
  records: TranscriptRecordDto[];
}

export interface TranscriptActivity {
  number: number;
  timestamp: string | null;
  kind: string;
  title: string;
  detail: string | null;
  raw: string;
}

const directString = (record: Record<string, unknown>, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
};

const nestedString = (value: unknown, keys: string[]): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return directString(value as Record<string, unknown>, keys);
};

const objectValue = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readableText = (value: string | null): string | null => {
  if (value === null || !value.startsWith("{")) return value;
  try {
    const parsed = objectValue(JSON.parse(value));
    return parsed === null ? value : directString(parsed, ["summary", "message", "text"]) ?? value;
  } catch {
    return value;
  }
};

const readable = (value: string): string => value
  .replaceAll(/[._-]+/g, " ")
  .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());

const detailText = (record: Record<string, unknown>): string | null => {
  const direct = readableText(directString(record, ["summary", "message", "text", "content", "output", "result"]));
  if (direct !== null) return direct;
  for (const key of ["data", "payload", "item", "event"]) {
    const nested = readableText(nestedString(record[key], ["summary", "message", "text", "content", "output", "result", "command"]));
    if (nested !== null) return nested;
  }
  return null;
};

export const activityForRecord = (record: TranscriptRecordDto): TranscriptActivity => {
  const value = record.value;
  const outerKind = directString(value, ["type", "kind", "event_type", "event", "role"]) ?? "record";
  const item = objectValue(value.item);
  const itemKind = item === null ? null : directString(item, ["type", "kind"]);
  const kind = itemKind ?? outerKind;
  const tool = directString(value, ["tool_name", "tool", "name"])
    ?? nestedString(value.tool, ["name", "tool_name"])
    ?? nestedString(value.data, ["tool_name", "tool", "name"]);
  let title = readable(kind);
  const lower = kind.toLowerCase();
  if (lower === "agent_message") title = "Agent update";
  else if (lower === "command_execution") title = outerKind.endsWith("completed") ? "Command completed" : "Command started";
  else if (lower === "file_change") title = outerKind.endsWith("completed") ? "Files changed" : "Updating files";
  else if (lower.includes("tool") && lower.includes("result")) title = tool === null ? "Tool result" : `Tool result · ${tool}`;
  else if (lower.includes("tool")) title = tool === null ? "Tool call" : `Tool call · ${tool}`;
  else if (lower.includes("assistant") || lower.includes("agent")) title = "Agent update";
  else if (lower.includes("user")) title = "User message";
  else if (lower.includes("status")) title = "Status changed";
  return {
    number: record.number,
    timestamp: directString(value, ["timestamp", "created_at", "createdAt", "time"]),
    kind,
    title,
    detail: detailText(item ?? value),
    raw: record.raw,
  };
};

export const formatTranscriptBytes = (bytes: number): string => bytes < 1024
  ? `${bytes} B`
  : `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
