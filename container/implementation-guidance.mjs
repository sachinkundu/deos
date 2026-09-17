// Transport and syntax decisions only; none of these helpers judges app quality.
import { readFile } from 'node:fs/promises';

export async function progressSignalObservation(path) {
  try { return JSON.parse(await readFile(path,'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function previewTarget(request, policy) {
  if (request.target !== undefined && !['local','hosted'].includes(request.target)) throw new Error('Preview target must be local or hosted');
  const backend = Boolean(request.main || request.d1?.length || request.r2?.length);
  if (request.target === 'hosted' && backend) throw new Error('Hosted static preview cannot run a Worker or D1/R2 bindings; use target local');
  if (request.target === 'local' || backend) return 'local';
  if (request.target === 'hosted' || policy.safeAdapters?.includes('static-preview-v1')) return 'hosted';
  return 'local';
}

export function checkedCommandArgv(argv) {
  // Direct shell checks stop at an unhandled command or pipeline failure.
  // Explicitly handled failures (if, ||) still belong to the author.
  const shell = argv[0]?.split('/').at(-1);
  if (['bash','sh'].includes(shell) && ['-c','-lc'].includes(argv[1]))
    return [argv[0],'-e',...(shell === 'bash' ? ['-o','pipefail'] : []),...argv.slice(1)];
  return argv;
}

export function withPreviewTarget(request, target = 'local') {
  if (request.action === 'browser') return {...request,target:request.target ?? target};
  if (request.action === 'demo' && Array.isArray(request.scenarios))
    return {...request,scenarios:request.scenarios.map(scenario => ({...scenario,target:scenario.target ?? target}))};
  return request;
}

export function proofSelectionSummary(state) {
  const groups = new Map();
  for (const proof of state.proof.filter(p => p.kind === 'browser_image')) {
    const location = state.proofLocations?.[proof.id];
    const id = location?.scenarioId ?? 'unmapped';
    if (!groups.has(id)) groups.set(id,{scenarioId:id,captures:[]});
    groups.get(id).captures.push({id:proof.id,stepIndex:location?.stepIndex ?? null,caption:proof.caption,
      selected:state.reviewProofIds ? state.reviewProofIds.includes(proof.id) : null});
  }
  return [...groups.values()];
}
