import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyReviewJournal } from '../container/bounded-review.mjs';
import { sha256Hex } from '../src/trace-review.ts';

// Native bytes captured by the offline pinned-runtime integration probe.
const evidence = new URL('../docs/evidence/sac-170-implementation/', import.meta.url);
const original = JSON.parse(await readFile(new URL('journal.json', evidence), 'utf8'));
const parentTranscript = await readFile(new URL('stdout.jsonl', evidence), 'utf8');
const verify = (journal: any) => verifyReviewJournal(journal, {
  attemptId: 'probe-author', runId: 'probe-run', inputDigest: original.inputDigest,
  candidateFiles: original.checkedCandidate.files, parentTranscript, hash: sha256Hex, model: 'gpt-5.6-sol',
});

test('trusted collection accepts the actual pinned native parent and child streams', async () => {
  const cycle = await verify(original);
  assert.equal(cycle.discovery.status, 'accepted');
  assert.equal(cycle.recheck.status, 'accepted');
  assert.equal(cycle.repair.outcome, 'checked');
});

test('a rehashed transcript cannot substitute a different child result', async () => {
  const journal = structuredClone(original);
  const child = journal.children[0];
  const records = child.transcript.split('\n').filter(Boolean).map((line: string) => JSON.parse(line));
  const message = records.findLast((item: any) => item.type === 'response_item' && item.payload?.type === 'message' && item.payload.role === 'assistant');
  message.payload.content = [{ type: 'output_text', text: '{"findings":[]}' }];
  child.transcript = records.map((item: any) => JSON.stringify(item)).join('\n') + '\n';
  child.sha256 = await sha256Hex(child.transcript);
  await assert.rejects(verify(journal), /transcript differs/);
});

test('a local journal cannot grant itself a review continuation', async () => {
  const journal = structuredClone(original);
  journal.events[0].authenticatedContinuation = true;
  await assert.rejects(verify(journal), /unauthenticated/);
});

test('a checked snapshot cannot substitute different published candidate bytes', async () => {
  const journal = structuredClone(original);
  journal.checkedCandidate.files[0].content += 'Unreviewed change.\n';
  journal.checkedCandidate.digest = await sha256Hex(JSON.stringify(journal.checkedCandidate.files));
  await assert.rejects(verify(journal), /final candidate/);
});
