// Trusted stdio MCP transport. Only a bounded repository-read tool is exposed.
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
const send = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
for await (const line of createInterface({ input: process.stdin })) {
  let request;
  try {
    if (line.length > 32_768) throw new Error("tool request too large");
    request = JSON.parse(line);
    if (request.id === undefined) continue;
    if (request.method === "initialize") {
      send(request.id, { protocolVersion: "2024-11-05", capabilities: { tools: {} },
        serverInfo: { name: "deos-read-only", version: "1" } });
    } else if (request.method === "tools/list") {
      send(request.id, { tools: [{ name: "read_repository", description:
        "Read checked review sources. Supports cat, ls, pwd, head, tail, sed -n, rg and wc -l. No writes or shell syntax.",
        inputSchema: { type: "object", properties: { command: { type: "string", maxLength: 8192 } },
          required: ["command"], additionalProperties: false } }] });
    } else if (request.method === "tools/call") {
      if (request.params?.name !== "read_repository" ||
          typeof request.params.arguments?.command !== "string" ||
          Object.keys(request.params.arguments).length !== 1) throw new Error("invalid tool");
      const response = await fetch(`${process.env.DEOS_BROKER_URL}/claude/tools`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.DEOS_BROKER_TOKEN}`,
          "Deos-Attempt": process.env.DEOS_ATTEMPT_ID, "Content-Type": "application/json" },
        body: JSON.stringify(request.params.arguments), signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error("read denied");
      const body = await response.json();
      if (typeof body.text !== "string" || body.text.length > 262144) throw new Error("invalid read result");
      send(request.id, { content: [{ type: "text", text: body.text }] });
    } else if (request.method === "ping") send(request.id, {});
    else throw new Error("unsupported method");
  } catch {
    await writeFile("/deos/claude/broker-failure.json", '{"cause":"review_failure"}', { mode: 0o600 });
    if (request?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id,
      error: { code: -32603, message: "read-only tool request failed" } }) + "\n");
  }
}
