import { sandboxIdentity } from "./orchestration-identity.ts";
import { ImplementationError } from "./implementation-contract.ts";

export const previewRelayHost = "implementation-preview.internal";
export const previewRelaySandboxId = (attemptId: string) => sandboxIdentity(`implementation-preview:${attemptId}`, false);

// Only this fixed program runs in the relay. Repository code stays in the
// network-restricted author sandbox; the relay owns no provider credentials.
export const previewRelayProgram = String.raw`
import http from 'node:http';
import { Readable } from 'node:stream';
const server = http.createServer(async (request, response) => {
  try {
    const target = new URL(request.url, 'http://implementation-preview.internal');
    if (target.origin !== 'http://implementation-preview.internal') throw new Error('Invalid preview request target');
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (['host','connection','transfer-encoding','content-length','upgrade','proxy-authorization','proxy-connection'].includes(name)) continue;
      for (const item of Array.isArray(value) ? value : value ? [value] : []) headers.append(name, item);
    }
    const upstream = await fetch(target, {
      method: request.method, headers, redirect: 'manual',
      ...(['GET','HEAD'].includes(request.method) ? {} : {body: request, duplex: 'half'}),
    });
    response.statusCode = upstream.status;
    for (const [name, value] of upstream.headers) {
      if (!['connection','transfer-encoding','content-encoding','content-length','set-cookie'].includes(name)) response.setHeader(name, value);
    }
    const cookies = upstream.headers.getSetCookie();
    if (cookies.length) response.setHeader('set-cookie', cookies);
    if (!upstream.body || request.method === 'HEAD') response.end();
    else Readable.fromWeb(upstream.body).on('error', error => { console.error(error); response.destroy(error); }).pipe(response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) { response.statusCode = 502; response.end('Preview forwarding failed'); }
    else response.destroy(error);
  }
});
server.on('upgrade', (_request, socket) => socket.end('HTTP/1.1 501 Not Implemented\r\nConnection: close\r\n\r\n'));
server.listen(8787, '0.0.0.0');
`;

export async function forwardImplementationPreview(
  request: Request,
  db: D1Database,
  context: { containerId: string; params?: unknown },
  dependencies: {
    relayContainerId(id: string): string;
    forward(sandboxId: string, tier: "basic" | "standard-2", request: Request): Promise<Response>;
  },
): Promise<Response> {
  const identity = context.params as { runId?: string; attemptId?: string } | undefined;
  const url = new URL(request.url);
  if (!identity?.runId || !identity.attemptId || url.protocol !== "http:" || url.hostname !== previewRelayHost)
    throw new ImplementationError("preview_identity", "Preview relay identity is invalid");
  const row = await db.prepare(`SELECT a.sandbox_id,a.sandbox_tier,p.preview_origin,p.metadata_json
    FROM implementation_resources p JOIN agent_attempts a ON a.attempt_id=p.attempt_id
    JOIN implementation_tries t ON t.attempt_id=a.attempt_id
    WHERE p.run_id=? AND p.attempt_id=? AND a.run_id=p.run_id AND p.kind='preview'
      AND p.status='ready' AND a.state='running' AND t.status='running'`)
    .bind(identity.runId, identity.attemptId)
    .first<{sandbox_id:string;sandbox_tier:"basic"|"standard-2";preview_origin:string;metadata_json:string}>();
  const relayId = await previewRelaySandboxId(identity.attemptId);
  if (!row || JSON.parse(row.metadata_json).relaySandboxId !== relayId || context.containerId !== dependencies.relayContainerId(relayId))
    throw new ImplementationError("preview_inactive", "Preview is not owned by this active relay");
  const target = new URL(row.preview_origin);
  target.pathname = url.pathname;
  target.search = url.search;
  const headers = new Headers(request.headers);
  headers.set("Host", target.host);
  return dependencies.forward(row.sandbox_id, row.sandbox_tier, new Request(target, {
    method: request.method, headers, body: request.body, redirect: "manual", duplex: "half",
  } as RequestInit));
}
