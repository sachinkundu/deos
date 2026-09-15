import { ImplementationError } from "./implementation-contract.ts";
import { responseError } from "./error-details.ts";
import { previewRelaySandboxId } from "./implementation-preview.ts";
import { type ImplementationResource, ImplementationStore } from "./implementation-store.ts";

type PreviewTunnel = { id: string; port: number; url: string; createdAt: string };
type PreviewReconciliationDependencies = {
  listTunnels(relayId: string): Promise<PreviewTunnel[]>;
  fetch: typeof globalThis.fetch;
  now(): Date;
};

// A readiness timeout does not make the allocated tunnel ambiguous. Read its
// inventory and health again; never launch a process or create another tunnel.
export async function reconcileImplementationPreview(
  store: ImplementationStore,
  resource: ImplementationResource,
  dependencies: PreviewReconciliationDependencies,
): Promise<{ origin: string }> {
  const active = `EXISTS (
    SELECT 1 FROM agent_attempts a
    JOIN implementation_tries t ON t.attempt_id=a.attempt_id AND t.run_id=a.run_id
    JOIN orchestration_runs r ON r.run_id=a.run_id
    WHERE a.attempt_id=implementation_resources.attempt_id
      AND a.run_id=implementation_resources.run_id
      AND a.state='running' AND t.status='running' AND r.status='active'
      AND r.current_visit_sequence=a.visit_sequence AND r.current_node=a.node_id
  )`;
  const row = await store.db.prepare(`SELECT * FROM implementation_resources
    WHERE resource_id=? AND run_id=? AND attempt_id=? AND ${active}`)
    .bind(resource.resource_id, resource.run_id, resource.attempt_id)
    .first<ImplementationResource>();
  if (!row || row.kind !== "preview" || row.provider !== "sandbox-tunnel" ||
      !["allocating", "quarantined", "ready"].includes(row.status) || !row.create_window)
    throw new ImplementationError("preview_inactive", "Preview reconciliation needs the current active try");
  const metadata = JSON.parse(row.metadata_json);
  const relayId = await previewRelaySandboxId(row.attempt_id);
  if (metadata.relaySandboxId !== relayId)
    throw new ImplementationError("preview_identity", "Preview relay differs from its saved owner");
  if (row.status === "ready" && row.preview_origin) return { origin: row.preview_origin };

  const tunnels = (await dependencies.listTunnels(relayId)).filter(tunnel => tunnel.port === 8787);
  if (tunnels.length !== 1)
    throw new ImplementationError("preview_quarantined", "The owned preview tunnel is missing or ambiguous");
  const tunnel = tunnels[0];
  const url = new URL(tunnel.url);
  const created = Date.parse(tunnel.createdAt);
  const allocated = Date.parse(row.create_window);
  if (url.protocol !== "https:" || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash ||
      !Number.isFinite(created) || !Number.isFinite(allocated) || created < allocated ||
      (metadata.tunnel && (metadata.tunnel.id !== tunnel.id || metadata.tunnel.url !== tunnel.url)))
    throw new ImplementationError("preview_identity", "Preview inventory differs from the allocated tunnel");
  const origin = url.origin;
  const response = await dependencies.fetch(`${origin}/__deos/preview-ready`, {
    redirect: "manual", signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== 200 || await response.clone().text() !== "deos-preview-ready")
    throw await responseError("Isolated preview relay reconciliation", response);
  const observedAt = dependencies.now().toISOString();
  const readiness = await store.put(row.run_id, "preview-reconciliation.json", JSON.stringify({
    resourceId: row.resource_id, attemptId: row.attempt_id, relaySandboxId: relayId,
    tunnel, previousStatus: row.status, observedAt, status: 200,
  }));
  const saved = await store.db.prepare(`UPDATE implementation_resources
    SET status='ready',provider_resource_id=?,preview_origin=?,metadata_json=?,updated_at=?
    WHERE resource_id=? AND status=? AND create_window=? AND metadata_json=? AND ${active}`)
    .bind(origin, origin, JSON.stringify({ ...metadata, tunnel, readiness }), observedAt,
      row.resource_id, row.status, row.create_window, row.metadata_json).run();
  if (saved.meta.changes !== 1) {
    const current = await store.db.prepare(`SELECT preview_origin FROM implementation_resources
      WHERE resource_id=? AND status='ready' AND preview_origin=? AND ${active}`)
      .bind(row.resource_id, origin).first<{ preview_origin: string }>();
    if (!current)
      throw new ImplementationError("preview_reconciliation_changed", "Preview ownership changed during its readiness check");
  }
  return { origin };
}
