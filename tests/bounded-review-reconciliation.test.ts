import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedReviewReconciliationController } from '../src/bounded-review-reconciliation.ts';
import { D1AgentStageRetryStore } from '../src/stage-retry.ts';
import { D1BoundedReviewStore } from '../src/bounded-review-store.ts';
import { sha256Hex } from '../src/implementation-hash.ts';
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from './helpers/implementation-fixture.ts';
import type { LoadedWorkflowDefinition } from '../src/workflow-definition.ts';

async function fixture() {
  const db = new ImplementationTestDatabase(); seedRun(db); seedAttempt(db, 'author');
  const bucket = new ImplementationTestBucket();
  const storage = { put: bucket.put.bind(bucket), get: async (key: string) => {
    const object = await bucket.get(key); return object && { ...object, size: bucket.objects.get(key)!.length };
  } } as unknown as R2Bucket;
  db.sqlite.exec(`INSERT INTO artifact_manifests (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest','run-1','author','manifest','complete','now');
    UPDATE orchestration_runs SET current_node='review_reconciliation',current_visit_sequence=2,
      status='manual_reconciliation_required',terminal_cause='review_reconciliation' WHERE run_id='run-1';
    INSERT INTO dispatch_intents (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
      VALUES ('run-1','delivery','run-1','established','now','now');
    INSERT INTO workflow_transitions_v2
      (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
      VALUES ('failure','run-1','design_author','review_reconciliation',1,2,'agent','agent:design_author:manual_reconciliation_required','now');`);
  const job = JSON.stringify({ materializedContext: '{}', model: 'model', boundedReview: 'deos-bounded-review-v1',
    nativeSelfReview: { schema: 'deos-bounded-review-v1' } });
  db.sqlite.prepare(`UPDATE agent_attempts SET job_spec_json=?,job_spec_digest=?,node_id='design_author',state='failed',
    cleanup_state='destroyed',manifest_id='manifest',ended_at='2026-09-15T15:00:00Z' WHERE attempt_id='author'`)
    .run(job, await sha256Hex(job));
  const files = [{ path: 'openspec/changes/test/design.md', content: 'A checked design.\n' }];
  const candidate = { files, digest: await sha256Hex(JSON.stringify(files)) };
  const result = { findings: [{ id: 'F1', summary: 'Use exact math.', location: 'design.md' }], sources: [], searchDisposition: 'none_used' };
  const childTranscript = JSON.stringify({ type: 'session_meta', payload: { id: 'discovery' } }) + '\n' +
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result) }] } }) + '\n';
  const journal = { schema: 'deos-bounded-review-v1', attemptId: 'author', runId: 'run-1', phase: 'design',
    inputDigest: await sha256Hex('{}'), initialCandidate: candidate, checkedCandidate: candidate,
    checkedSources: { searchDisposition: 'none_used', sources: [] },
    events: [
      { type: 'invoke', slot: 'discovery', invocationId: 'discovery', inputDigest: candidate.digest },
      { type: 'result', slot: 'discovery', invocationId: 'discovery', inputDigest: candidate.digest, lifecycleVerified: true, result },
      { type: 'repair_started' }, { type: 'repair_finished', passed: true, candidateDigest: candidate.digest },
      { type: 'invoke', slot: 'recheck', invocationId: 'recheck', inputDigest: candidate.digest },
      { type: 'failure', slot: 'recheck', invocationId: 'recheck', cause: { message: 'invalid source declaration' } },
    ], children: [{ invocationId: 'discovery', parentAttemptId: 'author', inputDigest: candidate.digest,
      transcript: childTranscript, sha256: await sha256Hex(childTranscript), eventCount: 2,
      start: { hook_event_name: 'SubagentStart', agent_id: 'discovery', agent_type: 'deos_reviewer', session_id: 'parent', model: 'model' },
      finish: { hook_event_name: 'SubagentStop', agent_id: 'discovery', agent_type: 'deos_reviewer', session_id: 'parent', last_assistant_message: JSON.stringify(result) } }] };
  const encodedJournal = JSON.stringify(journal);
  await storage.put('journal', encodedJournal);
  db.sqlite.prepare("INSERT INTO artifacts VALUES ('manifest','review-progress.json','journal','application/json',?,?,'now','accepted')")
    .run(Buffer.byteLength(encodedJournal), await sha256Hex(encodedJournal));
  const original = JSON.stringify({ eligible: false, cause: { message: 'required review artifact missing: transcript.jsonl', originalManifestId: 'manifest' } });
  db.sqlite.prepare("INSERT INTO bounded_review_recoveries VALUES ('author',0,?,?)").run(original, await sha256Hex(original));
  const transcript = ['discovery','recheck'].map(id => JSON.stringify({ type: 'item.completed', item: {
    type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed', receiver_thread_ids: [id] } })).join('\n') + '\n';
  const input = { version: 1, runId: 'run-1', attemptId: 'author', workflowInstanceId: 'run-1',
    definitionDigest: 'd'.repeat(64), visitSequence: 2, transcript, observedAt: '2026-09-15T14:59:00Z', requestedBy: 'operator' };
  const controller = new BoundedReviewReconciliationController({ DB: db as unknown as D1Database, ARTIFACTS: storage, STAGE_RETRY_SECRET: 'secret' });
  const request = (extra = {}, secret = 'secret') => new Request('https://internal/bounded-review-reconciliations', {
    method: 'POST', headers: { Authorization: `Bearer ${secret}` }, body: JSON.stringify({ ...input, ...extra }),
  });
  const retry = new D1AgentStageRetryStore(db as unknown as D1Database);
  const retryInput = { runId: 'run-1', failedAttemptId: 'author', retryNode: 'design_author' as const,
    requestedBy: 'operator', now: '2026-09-15T16:00:00Z', targetDefinition: { name: 'implementation', version: 28, digest: 'e'.repeat(64) } as LoadedWorkflowDefinition };
  return { db, storage, input, request, controller, retry, retryInput, original };
}

test('audited transcript restoration retains the failed recheck and resumes only its remaining slot', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.retry.prepare(f.retryInput), /not_eligible/);
    const plan = await (await f.controller.handle(f.request())).json() as any;
    assert.equal(plan.ready, true); assert.equal(plan.plan.remainingInvocations, 1);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM bounded_review_reconciliations').get()!.n, 0);
    await assert.rejects(f.controller.handle(f.request({ execute: true, planDigest: 'wrong' })), /plan_mismatch/);
    const applied = await (await f.controller.handle(f.request({ execute: true, planDigest: plan.planDigest }))).json();
    assert.deepEqual(await (await f.controller.handle(f.request({ execute: true, planDigest: plan.planDigest }))).json(), applied);
    const store = new D1BoundedReviewStore(f.db as unknown as D1Database, f.storage);
    const recovered = await store.recovery('author');
    assert.equal(recovered.eligible, true); assert.equal(recovered.slot, 'recheck');
    assert.equal(recovered.cycle.recheck.status, 'failed'); assert.equal(recovered.cycle.recheck.invocations.length, 1);
    assert.deepEqual(recovered.cycle.openIds, ['F1']);
    assert.equal(f.db.sqlite.prepare('SELECT original_recovery_json FROM bounded_review_reconciliations').get()!.original_recovery_json, f.original);
    assert.equal(f.db.sqlite.prepare("SELECT count(*) n FROM artifacts WHERE logical_name='transcript.jsonl'").get()!.n, 0);
    const retry = await f.retry.prepare(f.retryInput);
    assert.equal(retry.retry_kind, 'same_definition');
    assert.equal(f.db.sqlite.prepare("SELECT from_node FROM workflow_transitions_v2 WHERE transition_id=?").get(retry.transition_id)!.from_node, 'review_reconciliation');
    assert.equal((await f.retry.prepare(f.retryInput)).retry_id, retry.retry_id);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM agent_attempts').get()!.n, 1);
  } finally { f.db.close(); }
});

test('restoration rejects missing child identities, stale runs, and unauthorized or competing work', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.controller.handle(f.request({}, 'wrong'))).status, 401);
    await assert.rejects(f.controller.handle(f.request({ transcript: '{}\n' })), /unobserved_child_invocation/);
    await assert.rejects(f.controller.handle(f.request({ visitSequence: 3 })), /not_eligible/);
    await assert.rejects(f.controller.handle(f.request({ observedAt: '2026-09-16T00:00:00Z' })), /not_eligible/);
    seedAttempt(f.db, 'active');
    await assert.rejects(f.controller.handle(f.request()), /evidence_or_run_changed/);
    assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM bounded_review_reconciliations').get()!.n, 0);
    assert.equal(f.db.sqlite.prepare('SELECT eligible FROM bounded_review_recoveries').get()!.eligible, 0);
  } finally { f.db.close(); }
});
