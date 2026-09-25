import { sha256Hex } from './implementation-hash.ts';

export interface TestServiceManifest {
  id: string;
  revision: number;
  uiPaths: readonly string[];
  providerPaths: readonly string[];
}

export interface TestPathDecision {
  runId: string;
  candidateCommit: string;
  patchSha256: string;
  manifestId: string;
  manifestRevision: number;
  choice: 'test_required' | 'test_not_required';
  matchedPaths: readonly string[];
  changedPathsSha256: string;
}

export interface CompleteTestAttestation {
  runId: string;
  candidateCommit: string;
  patchSha256: string;
  manifestId: string;
  manifestRevision: number;
  state: 'complete';
}

const sha40 = /^[a-f0-9]{40}$/;
const sha64 = /^[a-f0-9]{64}$/;

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith('/') && !path.includes('\\') &&
    !/[\x00-\x1f]/.test(path) &&
    path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}

function safeRoot(root: string): boolean {
  return safePath(root.endsWith('/') ? root.slice(0, -1) : root);
}

function matchesRoot(path: string, root: string): boolean {
  if (!safeRoot(root)) throw new Error(`unsafe_test_service_root:${root}`);
  // A trailing slash declares a directory. Other roots intentionally match
  // file prefixes such as src/App. from the frozen implementation policy.
  return path.startsWith(root);
}

export async function decideTestPath(input: {
  runId: string;
  candidateCommit: string;
  patchSha256: string;
  changedPaths: readonly string[];
  manifest: TestServiceManifest;
}): Promise<TestPathDecision> {
  if (!input.runId || !sha40.test(input.candidateCommit) || !sha64.test(input.patchSha256) ||
      !input.manifest.id || !Number.isSafeInteger(input.manifest.revision) || input.manifest.revision < 1)
    throw new Error('invalid_test_path_subject');
  if (input.changedPaths.some(path => !safePath(path))) throw new Error('unsafe_test_candidate_path');
  const roots = [...input.manifest.uiPaths, ...input.manifest.providerPaths];
  if (roots.length === 0 || roots.some(root => !safeRoot(root)))
    throw new Error('invalid_test_service_manifest');
  const changedPaths = [...new Set(input.changedPaths)].sort();
  const matchedPaths = changedPaths.filter(path => roots.some(root => matchesRoot(path, root)));
  return {
    runId: input.runId,
    candidateCommit: input.candidateCommit,
    patchSha256: input.patchSha256,
    manifestId: input.manifest.id,
    manifestRevision: input.manifest.revision,
    choice: matchedPaths.length ? 'test_required' : 'test_not_required',
    matchedPaths,
    changedPathsSha256: await sha256Hex(JSON.stringify(changedPaths)),
  };
}

export function releaseHasTestProof(input: {
  decision: TestPathDecision;
  attestation: CompleteTestAttestation | null;
  runId: string;
  candidateCommit: string;
  patchSha256: string;
  manifestId: string;
  manifestRevision: number;
}): boolean {
  const {decision} = input;
  if (decision.runId !== input.runId || decision.candidateCommit !== input.candidateCommit ||
      decision.patchSha256 !== input.patchSha256 || decision.manifestId !== input.manifestId ||
      decision.manifestRevision !== input.manifestRevision)
    return false;
  if (decision.choice === 'test_not_required') return decision.matchedPaths.length === 0;
  if (decision.choice !== 'test_required' || decision.matchedPaths.length === 0) return false;
  const attestation = input.attestation;
  return attestation?.state === 'complete' && attestation.runId === input.runId &&
    attestation.candidateCommit === input.candidateCommit &&
    attestation.patchSha256 === input.patchSha256 &&
    attestation.manifestId === input.manifestId &&
    attestation.manifestRevision === input.manifestRevision;
}
