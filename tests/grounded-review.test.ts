import assert from 'node:assert/strict';
import test from 'node:test';
import { unwrapGroundedReview } from '../container/grounded-review.mjs';

const url = 'https://developers.cloudflare.com/pages/configuration/preview-deployments/';
const envelope = (claimLocator: string) => ({
  review: { findings: [{ message: `Preview behavior is documented here (${url}).` }] },
  sources: [{ id: 'preview', title: 'Preview deployments', url, claimLocator }],
  searchDisposition: 'sources_used',
});

test('grounded review accepts relative and envelope-root citations to the same review claim', () => {
  const relative = envelope('/findings/0/message');
  const rooted = envelope('/review/findings/0/message');
  const snapshot = structuredClone(rooted);
  assert.deepEqual(unwrapGroundedReview(rooted), unwrapGroundedReview(relative));
  assert.deepEqual(rooted, snapshot, 'the original provider receipt must remain unchanged');
});

test('envelope-root citation support keeps claim existence and exact URL checks', () => {
  for (const locator of ['/review/findings/1/message', '/sources/0/url', '/review/sources/0/url', '/review/review/findings/0/message']) {
    assert.throws(() => unwrapGroundedReview(envelope(locator)), /uncited_search_result/);
  }
  const mismatch = envelope('/review/findings/0/message');
  mismatch.sources[0].url = 'https://developers.cloudflare.com.attacker.invalid/';
  assert.throws(() => unwrapGroundedReview(mismatch), /uncited_search_result/);
});

test('grounded review preserves escaped pointer keys and existing review-relative claims', () => {
  const input = {
    ...envelope('/review/a~1b/~0message'),
    review: { 'a/b': { '~message': url } },
  };
  assert.equal(unwrapGroundedReview(input).sources[0].claimLocator, '/a~1b/~0message');
  const nested = { ...envelope('/review/findings/0/message'), review: { review: { findings: [{ message: url }] } } };
  assert.equal(unwrapGroundedReview(nested).sources[0].claimLocator, '/review/findings/0/message');
});
