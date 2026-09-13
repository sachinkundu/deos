import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedPortalFixture, sha256Hex } from './helpers/bounded-portal-fixture.ts';
import { activityForRecord } from '../src/transcript-view.ts';

test('captured native review survives real schema collection and portal transcript reads', async t => {
  const fixture = await boundedPortalFixture();
  t.after(() => fixture.mf.dispose());
  const { db, bucket, store, journal, journalText, acceptance, request } = fixture;
  await assert.rejects(store.acceptJournal(acceptance), /cleanup incomplete/);
  await db.prepare("UPDATE agent_attempts SET cleanup_state='destroyed' WHERE attempt_id=?").bind(journal.attemptId).run();
  await store.acceptJournal(acceptance);
  await store.acceptJournal(acceptance);
  const response = await request(`/api/runs/${journal.runId}/review-cycles`);
  assert.equal(response.status, 200, await response.clone().text());
  const { cycles } = await response.json() as any;
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].discovery.invocations.length, 1);
  assert.equal(cycles[0].recheck.invocations.length, 1);
  assert.equal(cycles[0].repair.outcome, 'checked');
  assert.deepEqual(cycles[0].openIds, []);
  for (const child of journal.children) {
    const path = `/api/review-children/${child.invocationId}/transcript`;
    assert.equal((await request(path, false)).status, 401);
    const result = await request(path);
    assert.equal(result.status, 200);
    const transcript = await result.json() as any;
    assert.equal(transcript.state, 'content');
    assert.equal(transcript.sha256, child.sha256);
    assert.equal(transcript.eventCount, 14);
    assert.equal(transcript.records.map((record: any) => record.raw).join('\n') + '\n', child.transcript);
    const updates = transcript.records.map(activityForRecord).filter((event: any) => event.title === 'Agent update');
    assert.ok(updates.some((event: any) => event.detail === child.finish.last_assistant_message),
      `Activity view must show the ${child.slot} reviewer result, not just a generic event label`);
    assert.ok(transcript.records.map(activityForRecord).some((event: any) =>
      event.title === 'Tool result' && event.detail?.includes('Script completed')));
  }
  const path = `/api/review-children/${journal.children[0].invocationId}/transcript`;
  await bucket.put('replay/review-progress.json', journalText + ' ');
  assert.equal((await (await request(path)).json() as any).state, 'corrupt');
  await bucket.put('replay/review-progress.json', journalText);
  await db.prepare("DELETE FROM review_transcript_owners WHERE owner_id=?").bind(journal.children[0].invocationId).run();
  assert.match((await (await request(path)).json() as any).message, /required child transcript evidence is missing/);
  await store.acceptJournal(acceptance);
  assert.equal((await (await request(path)).json() as any).state, 'content');
  assert.equal((await request('/api/review-children/00000000-0000-4000-8000-000000000000/transcript')).status, 404);
  await db.prepare("DELETE FROM linear_issue_index WHERE issue_id='replay-issue'").run();
  assert.equal((await request(path)).status, 404);
});

test('stored review accepts one independent result and preserves coverage across later edits', async t => {
  const fixture = await boundedPortalFixture();
  t.after(() => fixture.mf.dispose());
  const { db, store, bucket, journal, acceptance, request } = fixture;
  await db.prepare("UPDATE agent_attempts SET cleanup_state='destroyed' WHERE attempt_id=?").bind(journal.attemptId).run();
  await store.acceptJournal(acceptance);
  await store.apply(journal.runId, 'design', { type: 'published', head: 'reviewed-head', candidateDigest: journal.checkedCandidate.digest });
  const independentId = '00000000-0000-4000-8000-000000000170';
  await db.prepare(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('independent-manifest',?,?,'replay/independent-manifest','complete','now')`).bind(journal.runId, independentId).run();
  await db.prepare(`INSERT INTO agent_attempts
    (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,absolute_deadline,manifest_id,cleanup_state,created_at,updated_at)
    VALUES (?,'local-independent',?,'design_independent_review','{}','unused','completed','now','independent-manifest','destroyed','now','now')`)
    .bind(independentId, journal.runId).run();
  const review = { review: { summary: 'Explain the error text.' }, sources: [], searchDisposition: 'not_searched' };
  for (const [name, value] of Object.entries({
    'review-sources.json': JSON.stringify([review]),
    'transcript.jsonl': JSON.stringify({ type: 'agent_message', text: JSON.stringify(review) }) + '\n',
  })) {
    await bucket.put(`replay/independent/${name}`, value);
    await db.prepare(`INSERT INTO artifacts VALUES ('independent-manifest',?,?,'application/jsonl',?,?,'now','accepted')`)
      .bind(name, `replay/independent/${name}`, new TextEncoder().encode(value).length, await sha256Hex(value)).run();
  }
  const independent = { runId: journal.runId, phase: 'design', attemptId: independentId,
    manifestId: 'independent-manifest', head: 'reviewed-head', findings: [{ id: 'I1', summary: 'Explain the error text.', location: 'design.md:15' }] };
  await store.acceptIndependent(independent);
  await store.acceptIndependent(independent); // Delivery replay is idempotent.
  await assert.rejects(store.acceptIndependent({ ...independent, findings: [] }), /slot mismatch/);
  await assert.rejects(store.bindGate(journal.runId, 'design', 1, 'reviewed-head'), /incomplete human gate evidence/);
  await store.apply(journal.runId, 'design', { type: 'author_response', result: [
    { id: 'I1', disposition: 'applied', response: 'Added the error text.' },
  ] });
  await assert.rejects(store.bindGate(journal.runId, 'design', 1, 'reviewed-head'), /unfinished attempts/);
  await db.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id=?").bind(journal.attemptId).run();
  for (let visit = 1; visit <= 3; visit++) {
    const head = `edited-head-${visit}`;
    await store.apply(journal.runId, 'design', { type: 'head_updated', head });
    const gate = await store.bindGate(journal.runId, 'design', visit, head);
    assert.equal(gate.reviewedHead, 'reviewed-head');
    assert.equal(gate.currentHead, head);
    assert.equal(gate.stale, true);
  }
  const cycles = await (await request(`/api/runs/${journal.runId}/review-cycles`)).json() as any;
  assert.equal(cycles.cycles[0].independent.attemptId, independentId);
  assert.equal(cycles.cycles[0].response.result[0].disposition, 'applied');
  assert.equal(cycles.cycles[0].discovery.invocations.length, 1);
  assert.equal(cycles.cycles[0].recheck.invocations.length, 1);
  const transcript = await (await request(`/api/attempts/${independentId}/transcript`)).json() as any;
  assert.equal(transcript.state, 'content');
  assert.equal(transcript.eventCount, 1);
});
