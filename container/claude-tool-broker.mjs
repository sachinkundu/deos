// Trusted stdio MCP transport. Only a bounded repository-read tool is exposed.
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { redactClaudeDiagnostic } from "/deos/bin/claude-diagnostics.ts";
import { responseError } from "/deos/bin/error-details.ts";
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
        "Read only frozen review sources. Start with bare ls (no arguments) to list all allowed file paths. Use pwd with no arguments; cat FILE; head or tail [-n COUNT] FILE; sed -n START,ENDp FILE; rg [-n] [-i] [-F] [--] PATTERN [FILE_OR_DIRECTORY]; wc -l FILE. Search directories select only listed frozen files beneath that path, never unlisted filesystem entries. Quote search patterns and paths containing spaces. Quoted regex alternatives, anchors, and escapes are literal argument data; nothing is expanded or run through a shell. No other flags, writes, glob expansion, pipelines, or redirection.",
        inputSchema: { type: "object", properties: { command: { type: "string", maxLength: 8192 } },
          required: ["command"], additionalProperties: false } },
        ...(process.env.DEOS_DEMO_REVIEW === '1' ? [{ name: 'read_demo_evidence',
          description: 'Inspect one evidence ID from the frozen demo manifest. Returns the actual hash-checked image or full text. Evidence captions alone do not establish behavior.',
          inputSchema: { type: 'object', properties: { evidenceId: { type: 'string' } }, required: ['evidenceId'], additionalProperties: false } }] : [])] });
    } else if (request.method === "tools/call") {
      const demo = request.params?.name === 'read_demo_evidence' && process.env.DEOS_DEMO_REVIEW === '1';
      if ((!demo && request.params?.name !== "read_repository") ||
          typeof request.params.arguments?.[demo ? 'evidenceId' : 'command'] !== "string" ||
          Object.keys(request.params.arguments).length !== 1) throw new Error("invalid tool");
      const response = await fetch(`${process.env.DEOS_BROKER_URL}/claude/${demo ? 'demo-evidence' : 'tools'}`, {
        method: "POST", headers: { Authorization: `Bearer ${process.env.DEOS_BROKER_TOKEN}`,
          "Deos-Attempt": process.env.DEOS_ATTEMPT_ID, "Content-Type": "application/json" },
        body: JSON.stringify(request.params.arguments), signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw await responseError("DEOS repository reader", response);
      const body = await response.json();
      if (demo) {
        if (!Array.isArray(body.content) || body.content.some(item => !['image', 'text'].includes(item.type))) throw new Error('invalid demo evidence response');
        send(request.id, { content: body.content });
      } else {
        if (typeof body.text !== "string" || body.text.length > 262144) throw new Error("invalid read result");
        send(request.id, { content: [{ type: "text", text: body.text }] });
      }
    } else if (request.method === "ping") send(request.id, {});
    else throw new Error("unsupported method");
  } catch (error) {
    const secrets = [process.env.DEOS_BROKER_TOKEN];
    const failure = redactClaudeDiagnostic({ cause: "review_failure", originalError: error,
      operation: request?.method, requestLine: line }, secrets);
    try { await writeFile("/deos/claude/broker-failure.json", JSON.stringify(failure), { mode: 0o600 }); }
    catch (storageError) {
      process.stderr.write(JSON.stringify(redactClaudeDiagnostic({ failure, storageError }, secrets)) + "\n");
      process.exitCode = 1;
      break;
    }
    if (request?.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id,
      error: { code: -32603, message: "read-only tool request failed" } }) + "\n");
  }
}
