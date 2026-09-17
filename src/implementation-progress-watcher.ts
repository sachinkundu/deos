import type { SandboxView } from "./sandbox-controller.ts";

// Installed by the trusted Worker, so active attempts can adopt it without an
// image restart. It only sends wake-up hints; the Worker reads and counts tasks.
export const implementationProgressWatcher = String.raw`
import { watch } from 'node:fs';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const { recordCaughtError } = await import(process.argv[3]);
const job = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (!/^[a-z0-9][a-z0-9-]*$/.test(job.openspecChange)) throw new Error('Invalid progress watcher change');
let timer, closed = false, sending = false, pending = false, retryDelay = 1000;
let consecutiveFailures = 0, lastSuccessAt = null;
const observationPath = join(dirname(process.argv[2]), 'implementation-progress-signal.json');
const watcher = watch(join(job.cwd, 'openspec', 'changes', job.openspecChange), (_event, name) => {
  if (name === null || String(name) === 'tasks.md') schedule();
});
const close = () => { closed = true; clearTimeout(timer); clearTimeout(deadline); watcher.close(); };
watcher.on('error', error => { recordCaughtError(error, 'implementation progress watcher'); close(); });
const deadline = setTimeout(close, Math.max(1, Date.parse(job.deadline) - Date.now()));
process.once('SIGTERM', close);
function schedule(delay = 750) {
  if (closed) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void notify(); }, delay);
}
async function notify() {
  if (closed) return;
  if (sending) { pending = true; return; }
  sending = true;
  let retry = false;
  const started = Date.now();
  let outcome = 'failed', lastError = null;
  try {
    const response = await fetch(job.capabilityUrl + '/attempt-progress', {
      method:'POST', headers:{Authorization:'Bearer ' + job.capabilityToken,'Deos-Attempt':job.attemptId,'Content-Type':'application/json'},
      body:JSON.stringify({version:1}), signal:AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      retry = [408, 429, 500, 502, 503, 504].includes(response.status);
      if (!retry) close();
      throw new Error('Progress notification HTTP ' + response.status + ': ' + await response.text());
    }
    await response.arrayBuffer();
    outcome = 'delivered';
    consecutiveFailures = 0;
    lastSuccessAt = new Date().toISOString();
    retryDelay = 1000;
  } catch (error) {
    consecutiveFailures++;
    lastError = {name:error.name,message:String(error.message).replaceAll(job.capabilityToken,'[redacted]')};
    retry = retry || error.name === 'TimeoutError' ||
      (error.name === 'TypeError' && ['UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT',
        'UND_ERR_BODY_TIMEOUT','ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN'].includes(error.cause?.code));
    recordCaughtError(error, 'implementation progress signal');
  }
  finally {
    const observation = {attemptedAt:new Date(started).toISOString(),observedAt:new Date().toISOString(),
      durationMs:Date.now()-started,outcome,retryAfterMs:retry && !closed ? retryDelay : null,
      consecutiveFailures,lastSuccessAt,lastError};
    try {
      await writeFile(observationPath+'.tmp',JSON.stringify(observation),{mode:0o600});
      await rename(observationPath+'.tmp',observationPath);
    } catch (error) { recordCaughtError(error, 'implementation progress observation write'); }
    sending = false;
    if (retry && !closed) {
      pending = false;
      schedule(retryDelay);
      retryDelay = Math.min(30000, retryDelay * 2);
    } else if (pending) { pending = false; schedule(); }
  }
}
schedule();
`;

export async function ensureImplementationProgressWatcher(sandbox: SandboxView, deadline: string) {
  const receiptPath = "/deos/run/implementation-progress-watcher.json";
  if ((await sandbox.exists(receiptPath)).exists) {
    const receipt = JSON.parse((await sandbox.readFile(receiptPath)).content) as {processId:string};
    const process = await sandbox.getProcess(receipt.processId);
    if (process && (await process.status()).state === "running") return;
  }
  const remaining = Date.parse(deadline) - Date.now();
  if (!Number.isFinite(remaining) || remaining <= 0) return;
  const path = "/deos/run/implementation-progress-watcher.mjs";
  await sandbox.writeFile(path, implementationProgressWatcher);
  // flock also prevents duplicates if the launch succeeds but its reply is lost.
  const process = await sandbox.exec(["flock", "-n", "/deos/run/implementation-progress.lock", "node", path,
    "/deos/run/job.json", "/deos/bin/original-errors.mjs"], {timeout:remaining});
  await sandbox.writeFile(receiptPath, JSON.stringify({processId:process.id}));
}
