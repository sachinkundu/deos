import { ImplementationError, subjectMatches, type ProofSubject } from './implementation-contract.ts';
import { ImplementationStore, type ImplementationRun } from './implementation-store.ts';
import { sha256Hex } from './implementation-hash.ts';

export interface HostedPreviewRequest {
  version: 1;
  runId: string;
  inputSha: string;
  candidateSha: string;
  treeSha: string;
  requestedBy: string;
  accountId: string;
  projectId: string;
  projectName: string;
  deploymentId: string;
  branch: string;
  build: { treeSha: string; baseSha: string; command: string; logSha256: string };
  assets: Array<{ path: string; bytes: number; sha256: string }>;
}
export interface HostedPreviewReceipt {
  version: 1;
  registrationId: string;
  provenance: 'maintainer_deployed_static_preview';
  request: HostedPreviewRequest;
  subject: ProofSubject;
  origin: string;
  checkedAt: string;
  deployment: { id: string; projectId: string; projectName: string; branch: string;
    environment: 'preview'; status: 'success'; createdOn: string; url: string };
  assets: Array<{ path: string; url: string; bytes: number; sha256: string; status: 200 }>;
}
export type HostedPreviewEnv = Pick<Env, 'DB' | 'ARTIFACTS'> & { IMPLEMENTATION_PAGES_READ_TOKEN?: string };
const invalid = (message: string): never => { throw new ImplementationError('hosted_preview_invalid', message); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('Expected a hosted preview object');
  return value as Record<string, unknown>;
};
const matches = (value: unknown, pattern: RegExp) => typeof value === 'string' && pattern.test(value);
const sha = /^[a-f0-9]{64}$/;
const gitSha = /^[a-f0-9]{40}$/;

export function validateHostedPreviewRequest(value: unknown): HostedPreviewRequest {
  const request = record(value);
  if (request.version !== 1 || typeof request.runId !== 'string' || !request.runId || request.runId.length > 300 ||
      !matches(request.inputSha, sha) || !matches(request.candidateSha, sha) || !matches(request.treeSha, gitSha) ||
      !matches(request.requestedBy, /^[a-zA-Z0-9._@-]{1,100}$/) || !matches(request.accountId, /^[a-f0-9]{32}$/) ||
      !matches(request.projectId, /^[a-f0-9-]{32,36}$/) || !matches(request.deploymentId, /^[a-f0-9-]{32,36}$/) ||
      !matches(request.projectName, /^[a-z0-9][a-z0-9-]{0,57}[a-z0-9]$/) ||
      !matches(request.branch, /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,100}$/)) invalid('Invalid hosted preview identity');
  const build = record(request.build);
  if (build.treeSha !== request.treeSha || !matches(build.baseSha, gitSha) || !matches(build.logSha256, sha) ||
      typeof build.command !== 'string' || !build.command.trim() || build.command.length > 2000)
    invalid('The maintainer build must identify its exact tree, base, command and log digest');
  if (!Array.isArray(request.assets) || !request.assets.length || request.assets.length > 32)
    invalid('A static preview needs between 1 and 32 checked assets');
  const paths = new Set<string>();
  let total = 0;
  for (const value of request.assets as unknown[]) {
    const asset = record(value);
    if (!matches(asset.path, /^[a-zA-Z0-9_][a-zA-Z0-9_./-]{0,250}$/) ||
        String(asset.path).split('/').some(part => !part || part === '.' || part === '..') ||
        paths.has(String(asset.path)) || !matches(asset.sha256, sha) ||
        !Number.isInteger(asset.bytes) || Number(asset.bytes) < 1 || Number(asset.bytes) > 2_000_000)
      invalid('Invalid, duplicate or oversized static asset');
    paths.add(String(asset.path)); total += Number(asset.bytes);
  }
  if (!paths.has('index.html') || total > 8_000_000) invalid('Static preview needs index.html and at most 8 MB of assets');
  // Reject extra fields so credentials or unbounded context cannot enter the audit.
  if (Object.keys(request).some(key => !['version','runId','inputSha','candidateSha','treeSha','requestedBy',
    'accountId','projectId','projectName','deploymentId','branch','build','assets'].includes(key)) ||
    Object.keys(build).some(key => !['treeSha','baseSha','command','logSha256'].includes(key)) ||
    (request.assets as object[]).some(asset => Object.keys(asset).some(key => !['path','bytes','sha256'].includes(key))))
    invalid('Unexpected hosted preview fields');
  return value as HostedPreviewRequest;
}

export function checkedPagesDeployment(value: unknown, request: HostedPreviewRequest): HostedPreviewReceipt['deployment'] {
  const deployment = record(value), stage = record(deployment.latest_stage);
  const metadata = record(record(deployment.deployment_trigger).metadata);
  if (deployment.id !== request.deploymentId || deployment.project_id !== request.projectId ||
      deployment.project_name !== request.projectName || deployment.environment !== 'preview' ||
      stage.name !== 'deploy' || stage.status !== 'success' || metadata.branch !== request.branch ||
      !matches(deployment.short_id, /^[a-f0-9]{8}$/) || typeof deployment.created_on !== 'string' ||
      !Number.isFinite(Date.parse(deployment.created_on))) invalid('Provider deployment differs from the requested successful preview');
  const origin = `https://${deployment.short_id}.${request.projectName}.pages.dev`;
  if (deployment.url !== origin && deployment.url !== `${origin}/`) invalid('Provider URL is not the immutable deployment origin');
  return { id: request.deploymentId, projectId: request.projectId, projectName: request.projectName,
    branch: request.branch, environment: 'preview', status: 'success', createdOn: String(deployment.created_on), url: origin };
}

async function bytesSha(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)))]
    .map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function checkHostedAssets(origin: string, assets: HostedPreviewRequest['assets'], fetcher: typeof fetch) {
  const checked: HostedPreviewReceipt['assets'] = [];
  for (const asset of assets) {
    const path = asset.path === 'index.html' ? '' : asset.path;
    const url = `${origin}/${path}`;
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000),
      headers: { 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache' } });
    if (response.status !== 200) throw new ImplementationError('hosted_preview_http', `Hosted asset ${url} returned HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) invalid(`Hosted asset has no body: ${url}`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const item = await reader!.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > asset.bytes) {
        await reader!.cancel();
        invalid(`Hosted asset exceeds the expected byte size: ${url}`);
      }
      chunks.push(item.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const digest = await bytesSha(bytes);
    if (size !== asset.bytes || digest !== asset.sha256) invalid(`Hosted asset does not match the maintainer build: ${url}`);
    checked.push({ ...asset, url, status: 200 });
  }
  return checked;
}

export class ImplementationHostedPreview {
  readonly env: HostedPreviewEnv;
  readonly store: ImplementationStore;
  readonly fetcher: typeof fetch;
  constructor(env: HostedPreviewEnv, fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {
    this.env = env; this.store = new ImplementationStore(env.DB, env.ARTIFACTS); this.fetcher = fetcher;
  }
  async latest(work: ImplementationRun): Promise<HostedPreviewReceipt | null> {
    const row = await this.env.DB.prepare(`SELECT registration_id,receipt_key,receipt_sha FROM implementation_hosted_previews
      WHERE run_id=? AND input_sha=? ORDER BY created_at DESC,registration_id DESC LIMIT 1`)
      .bind(work.run_id, work.input_sha).first<{registration_id:string;receipt_key:string;receipt_sha:string}>();
    if (!row) return null;
    const receipt = await this.store.read<HostedPreviewReceipt>(row.receipt_key, row.receipt_sha);
    if (receipt.registrationId !== row.registration_id || receipt.request.runId !== work.run_id || receipt.request.inputSha !== work.input_sha ||
        receipt.subject.approvedDesignSha !== work.approved_design_sha || receipt.subject.testedBaseSha !== work.tested_base_sha)
      invalid('Saved preview receipt differs from the current run');
    return receipt;
  }
  async register(value: unknown): Promise<HostedPreviewReceipt> {
    const request = validateHostedPreviewRequest(value);
    const work = await this.store.requireRun(request.runId);
    if (work.input_sha !== request.inputSha || work.candidate_sha !== request.candidateSha ||
        work.tree_sha !== request.treeSha || work.tested_base_sha !== request.build.baseSha)
      invalid('Registration differs from the saved candidate');
    const candidate = await this.store.candidate(work);
    if (candidate.kind !== 'build' || candidate.treeSha !== request.treeSha) invalid('Registration requires a saved build candidate');
    const stopped = await this.env.DB.prepare(`SELECT run_id FROM orchestration_runs WHERE run_id=?
      AND status='failed' AND current_node='implementation_failed' AND NOT EXISTS (
        SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting'))`)
      .bind(request.runId, request.runId).first();
    if (!stopped) invalid('Register a maintainer preview only while this implementation is stopped with no active attempt');
    const token = this.env.IMPLEMENTATION_PAGES_READ_TOKEN;
    if (!token) throw new ImplementationError('hosted_preview_unconfigured', 'The trusted Pages read token is not configured');
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${request.accountId}/pages/projects/${request.projectName}/deployments/${request.deploymentId}`;
    const response = await this.fetcher(apiUrl, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
    const body = record(await response.json());
    if (!response.ok || body.success !== true) {
      // The successful API payload contains env_vars and build tokens. Never save it.
      const errors = JSON.stringify(body.errors ?? []).replaceAll(token, '[redacted]');
      throw new ImplementationError('hosted_preview_provider', `Pages deployment read-back HTTP ${response.status}: ${errors}`);
    }
    const deployment = checkedPagesDeployment(body.result, request);
    const assets = await checkHostedAssets(deployment.url, request.assets, this.fetcher);
    const registrationId = await sha256Hex(JSON.stringify(request));
    const receipt: HostedPreviewReceipt = { version: 1, registrationId, provenance: 'maintainer_deployed_static_preview',
      request, subject: { change: work.change_id, approvedDesignSha: work.approved_design_sha,
        testedBaseSha: work.tested_base_sha, treeSha: request.treeSha }, origin: deployment.url,
      deployment, assets, checkedAt: new Date().toISOString() };
    const stored = await this.store.put(request.runId, 'hosted-preview.json', JSON.stringify(receipt));
    await this.env.DB.prepare(`INSERT INTO implementation_hosted_previews
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM implementation_runs w JOIN orchestration_runs r ON r.run_id=w.run_id
        WHERE w.run_id=? AND w.input_sha=? AND w.candidate_sha=? AND w.tree_sha=? AND w.tested_base_sha=?
          AND r.status='failed' AND r.current_node='implementation_failed')
        AND NOT EXISTS (SELECT 1 FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting'))
      ON CONFLICT(registration_id) DO NOTHING`)
      .bind(registrationId, request.runId, request.inputSha, request.candidateSha, request.treeSha,
        stored.key, stored.sha256, receipt.checkedAt, request.runId, request.inputSha, request.candidateSha,
        request.treeSha, request.build.baseSha, request.runId).run();
    const row = await this.env.DB.prepare('SELECT receipt_key,receipt_sha FROM implementation_hosted_previews WHERE registration_id=? AND run_id=?')
      .bind(registrationId, request.runId).first<{receipt_key:string;receipt_sha:string}>();
    if (!row) invalid('Run changed while the preview was checked; registration was not accepted');
    return this.store.read<HostedPreviewReceipt>(row!.receipt_key, row!.receipt_sha);
  }
}

export function hostedPreviewOrigin(receipt: HostedPreviewReceipt | null, subject: ProofSubject): string {
  if (!receipt) throw new ImplementationError('hosted_preview_missing', 'No checked hosted preview is available for this run');
  if (!subjectMatches(receipt.subject, subject))
    throw new ImplementationError('hosted_preview_stale', 'The hosted preview is for a different code tree or base; it needs a new maintainer deployment');
  return receipt.origin;
}
