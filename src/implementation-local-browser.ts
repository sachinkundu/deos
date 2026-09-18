import { ImplementationStore } from './implementation-store.ts';
import type { ImplementationInput, ImplementationRun } from './implementation-store.ts';
import { ImplementationError, type ProofSubject } from './implementation-contract.ts';
import { ImplementationHostedPreview, hostedPreviewOrigin } from './implementation-hosted-preview.ts';
import { ImplementationEnvironment } from './implementation-environment.ts';

export const localBrowserOrigin = 'http://127.0.0.1:8787';

export async function localBrowserTarget(env: Env, work: ImplementationRun, input: ImplementationInput,
  attemptId: string, subject: ProofSubject, target: unknown) {
  if (target === 'local') return {origin:localBrowserOrigin,identity:'local',target:'local'};
  if (target === 'remote') {
    if (!input.policy.safeAdapters.includes('temporary-environment-v1'))
      throw new ImplementationError('environment_denied','This run has no temporary environment capability');
    const service = new ImplementationEnvironment(env);
    const row = await service.row(attemptId);
    const origin = await service.origin(work.run_id,attemptId);
    return {origin,identity:row!.receipt_sha!,target:'remote'};
  }
  if (target === 'hosted') {
    const hosted = await new ImplementationHostedPreview(env).latest(work);
    const origin = hostedPreviewOrigin(hosted,subject);
    return {origin,identity:hosted!.registrationId,target:'hosted'};
  }
  throw new ImplementationError('browser_target','Browser target must be local, hosted or remote');
}

// Both the network handler and browser broker use durable ownership. Never grant
// an arbitrary agent-supplied URL, account wildcard, or retired attempt's Worker.
export async function ownedBrowserDestination(env: Env, runId: string, attemptId: string, url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  const remote = await env.DB.prepare("SELECT origin FROM implementation_environments WHERE run_id=? AND attempt_id=? AND state='ready'")
    .bind(runId,attemptId).first<{origin:string}>();
  if (remote?.origin === url.origin) return true;
  const store = new ImplementationStore(env.DB,env.ARTIFACTS);
  const work = await store.requireRun(runId);
  const hosted = await new ImplementationHostedPreview(env).latest(work);
  return hosted?.origin === url.origin;
}

export function checkedLocalCapture(value: unknown, origin: string) {
  const capture = value as {url?:unknown;documentStatus?:unknown;imageBase64?:unknown;measurements?:unknown;transport?:unknown};
  if (!capture || capture.transport !== 'sandbox-local-chromium' || typeof capture.url !== 'string' ||
      new URL(capture.url).origin !== origin || new URL(capture.url).username || new URL(capture.url).password)
    throw new ImplementationError('browser_origin','Local capture differs from the assigned target');
  if (!Number.isInteger(capture.documentStatus) || Number(capture.documentStatus) < 200 || Number(capture.documentStatus) >= 400)
    throw new ImplementationError('browser_document','Local capture requires a successful document response');
  if (typeof capture.imageBase64 !== 'string' || capture.imageBase64.length > 8 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(capture.imageBase64))
    throw new ImplementationError('browser_image','Local capture needs a bounded PNG image');
  const image = Buffer.from(capture.imageBase64,'base64');
  if (image.length < 24 || image.subarray(0,8).toString('hex') !== '89504e470d0a1a0a')
    throw new ImplementationError('browser_image','Local capture is not PNG');
  return {image,url:capture.url};
}
