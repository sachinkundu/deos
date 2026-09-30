import assert from 'node:assert/strict';
import test from 'node:test';
import {decideTestPath, releaseHasTestProof} from '../src/shared-test-path-rule.ts';

const commit = 'a'.repeat(40);
const patch = 'b'.repeat(64);
const manifest = {id:'manifest-1',revision: 7, uiPaths: ['portal/', 'src/App.'], providerPaths: ['src/linear-']};
const subject = {runId: 'run-1', candidateCommit: commit, patchSha256: patch, manifest};

test('matching app and provider roots require the shared test', async () => {
  const decision = await decideTestPath({...subject, changedPaths: ['docs/notes.md', 'src/linear-capability.ts', 'portal/src/main.tsx']});
  assert.equal(decision.choice, 'test_required');
  assert.deepEqual(decision.matchedPaths, ['portal/src/main.tsx', 'src/linear-capability.ts']);
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 7, decision, attestation: null}), false);
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 7, decision,
    attestation: {runId: 'run-1', candidateCommit: commit, patchSha256: patch, manifestId:'manifest-1', manifestRevision: 7, state: 'complete'}}), true);
});

test('a non-app candidate passes only for the exact saved subject and manifest', async () => {
  const decision = await decideTestPath({...subject, changedPaths: ['docs/notes.md']});
  assert.equal(decision.choice, 'test_not_required');
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 7, decision, attestation: null}), true);
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 8, decision, attestation: null}), false);
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-2', manifestRevision: 7, decision, attestation: null}), false);
  assert.equal(releaseHasTestProof({...subject, candidateCommit: 'c'.repeat(40), manifestId:'manifest-1', manifestRevision: 7, decision, attestation: null}), false);
});

test('a stale or foreign attestation cannot unlock app release', async () => {
  const decision = await decideTestPath({...subject, changedPaths: ['portal/src/main.tsx']});
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 7, decision,
    attestation: {runId: 'another-run', candidateCommit: commit, patchSha256: patch, manifestId:'manifest-1', manifestRevision: 7, state: 'complete'}}), false);
  assert.equal(releaseHasTestProof({...subject, manifestId:'manifest-1', manifestRevision: 7, decision,
    attestation: {runId: 'run-1', candidateCommit: commit, patchSha256: patch, manifestId:'manifest-1', manifestRevision: 6, state: 'complete'}}), false);
});

test('unsafe candidate paths and roots fail closed', async () => {
  await assert.rejects(decideTestPath({...subject, changedPaths: ['../portal/main.tsx']}), /unsafe_test_candidate_path/);
  await assert.rejects(decideTestPath({...subject, changedPaths: ['docs/a'], manifest: {...manifest, providerPaths: ['../src/']}}), /invalid_test_service_manifest/);
});
