import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { D1BoundedReviewStore } from '../src/bounded-review-store.ts';
import { sha256Hex } from '../src/trace-review.ts';
import { boundedReviewReady } from '../src/review-readiness.ts';
test('D1/R2 collection requires cleanup, survives replay, and keeps later head coverage honest', async () => {
    const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'bounded-review-test', modules: true,
                compatibilityDate: '2026-08-26', script: "export default { fetch() { return new Response('ok'); } }",
                d1Databases: ['DB'], r2Buckets: ['ARTIFACTS'] }] }));
    try {
        const db = await mf.getD1Database('DB');
        const bucket = await mf.getR2Bucket('ARTIFACTS');
        const ddl = [
            'CREATE TABLE orchestration_runs (run_id TEXT PRIMARY KEY)',
            'CREATE TABLE agent_attempts (attempt_id TEXT PRIMARY KEY, run_id TEXT, node_id TEXT, state TEXT, cleanup_state TEXT, job_spec_json TEXT, job_spec_digest TEXT, manifest_id TEXT, result_class TEXT)',
            'CREATE TABLE artifact_manifests (manifest_id TEXT PRIMARY KEY, state TEXT)',
            'CREATE TABLE artifacts (manifest_id TEXT, logical_name TEXT, r2_key TEXT, sha256 TEXT, byte_size INTEGER, policy_outcome TEXT)',
            ...(await readFile(new URL('../migrations/0036_bounded_review_cycles.sql', import.meta.url), 'utf8')).split(';').filter(sql => sql.trim()),
        ];
        for (const sql of ddl)
            await db.prepare(sql).run();
        const store = new D1BoundedReviewStore(db as unknown as D1Database, bucket as unknown as R2Bucket);
        await db.prepare("INSERT INTO orchestration_runs VALUES ('run')").run();
        const context = '{}';
        const job = JSON.stringify({ materializedContext: context, nativeSelfReview: { schema: 'deos-bounded-review-v1' } });
        const jobDigest = await sha256Hex(job);
        await db.prepare("INSERT INTO agent_attempts VALUES ('author','run','planning_author','collecting','pending',?,?, 'manifest',NULL)").bind(job, jobDigest).run();
        await db.prepare("INSERT INTO artifact_manifests VALUES ('manifest','complete')").run();
        const artifact = async (name: string, content: string, manifest = 'manifest') => {
            const key = `${manifest}/${name}`;
            await bucket.put(key, content);
            await db.prepare("INSERT INTO artifacts VALUES (?,?,?,?,?, 'accepted')")
                .bind(manifest, name, key, await sha256Hex(content), new TextEncoder().encode(content).length).run();
        };
        const files = [{ path: 'openspec/changes/test/proposal.md', content: 'A clear plan.\n' }];
        const candidate = { files, digest: await sha256Hex(JSON.stringify(files)) };
        const result = { findings: [], sources: [], searchDisposition: 'not_searched' };
        const events = [
            { type: 'invoke', slot: 'discovery', invocationId: 'child', inputDigest: candidate.digest },
            { type: 'result', slot: 'discovery', invocationId: 'child', inputDigest: candidate.digest, lifecycleVerified: true, result },
        ];
        const nativeTranscript = (id: string, result: unknown) => [JSON.stringify({type:'session_meta',payload:{id}}), JSON.stringify({type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(result)}]}})].join('\n') + '\n';
        const transcript = nativeTranscript('child', result);
        const child = { invocationId: 'child', parentAttemptId: 'author', inputDigest: candidate.digest, transcript, sha256: await sha256Hex(transcript), eventCount: 2,
            start: { hook_event_name: 'SubagentStart', agent_id: 'child', agent_type: 'deos_reviewer', session_id: 'parent' },
            finish: { hook_event_name: 'SubagentStop', agent_id: 'child', agent_type: 'deos_reviewer', session_id: 'parent', last_assistant_message: JSON.stringify(result) } };
        const journal = { schema: 'deos-bounded-review-v1', attemptId: 'author', runId: 'run', phase: 'planning', inputDigest: await sha256Hex(context),
            initialCandidate: candidate, checkedCandidate: candidate, events, children: [child], checkedSources: { sources: [], searchDisposition: 'not_searched' } };
        await artifact('review-progress.json', JSON.stringify(journal));
        await artifact('transcript.jsonl', JSON.stringify({ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed', receiver_thread_ids: ['child'] } }) + '\n');
        await store.prepare('author', jobDigest, 'manifest', { candidate: files });
        const acceptance = { runId: 'run', attemptId: 'author', manifestId: 'manifest', inputDigest: journal.inputDigest, candidateFiles: files };
        await assert.rejects(store.acceptJournal(acceptance), /cleanup incomplete/);
        assert.equal(await store.read('run', 'planning'), null);
        await db.prepare("UPDATE agent_attempts SET cleanup_state='destroyed' WHERE attempt_id='author'").run();
        await store.acceptJournal(acceptance);
        await store.acceptJournal(acceptance);
        const publication = { type: 'published', head: 'head1', candidateDigest: candidate.digest };
        await store.apply('run', 'planning', publication);
        await store.apply('run', 'planning', publication);
        await store.acceptJournal(acceptance);
        assert.equal(JSON.parse((await store.read('run', 'planning'))!.state_json).currentHead, 'head1');
        const independent = { type: 'independent_result', head: 'head1', result: {
                findings: [{ id: 'F1', summary: 'Explain the result', location: 'proposal.md:1' }], sourceEvidence: []
            } };
        await store.apply('run', 'planning', independent);
        await assert.rejects(store.apply('run', 'planning', { ...independent, head: 'head2' }), /slot mismatch/);
        await assert.rejects(store.apply('run', 'planning', { type: 'author_response', result: [] }), /incomplete/);
        await store.apply('run', 'planning', { type: 'author_response', result: [{ id: 'F1', disposition: 'applied', response: 'Explained the result.' }] });
        await store.apply('run', 'planning', { type: 'head_updated', head: 'head2' });
        await db.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='author'").run();
        const gate = await store.bindGate('run', 'planning', 7, 'head2');
        assert.equal(gate.stale, true);
        assert.equal(gate.reviewedHead, 'head1');
        await store.bindGate('run', 'planning', 7, 'head2');
        await assert.rejects(store.bindGate('run', 'planning', 7, 'wrong'), /head mismatch/);
        assert.equal(await boundedReviewReady(db as unknown as D1Database), false);
        await db.prepare("INSERT INTO review_portal_readiness VALUES ('deos-bounded-review-v1','deos-transcript-v1','portal-v1','now')").run();
        const portal = (versionId: string) => ({ fetch: async () => Response.json({ versionId, reviewSchemas: ['deos-bounded-review-v1'], transcriptSchemas: ['deos-transcript-v1'] }) });
        assert.equal(await boundedReviewReady(db as unknown as D1Database, portal('portal-v1') as any), true);
        assert.equal(await boundedReviewReady(db as unknown as D1Database, portal('rolled-back') as any), false);
        // The author crashed after the repair turn began. Only closed recheck may resume.
        await db.prepare("INSERT INTO orchestration_runs VALUES ('recovery-run')").run();
        const failureJob = JSON.stringify({ materializedContext: context, nativeSelfReview: { schema: 'deos-bounded-review-v1' }, boundedReview: 'deos-bounded-review-v1' });
        await db.prepare("INSERT INTO agent_attempts VALUES ('failed-author','recovery-run','planning_author','interrupted','destroyed',?,?, 'failure','process_lost')")
            .bind(failureJob, await sha256Hex(failureJob)).run();
        await db.prepare("INSERT INTO artifact_manifests VALUES ('failure','complete')").run();
        const found = { ...result, findings: [{ id: 'F1', summary: 'Explain the output', location: 'proposal.md:1' }] };
        const failedJournal = { ...journal, runId: 'recovery-run', attemptId: 'failed-author',
            events: [{ ...events[0], invocationId: 'failed-child' }, { ...events[1], invocationId: 'failed-child', result: found }, { type: 'repair_started' }],
            children: [{ ...child, invocationId: 'failed-child', parentAttemptId: 'failed-author', transcript: nativeTranscript('failed-child', found), sha256: await sha256Hex(nativeTranscript('failed-child', found)), start: { ...child.start, agent_id: 'failed-child' },
                    finish: { ...child.finish, agent_id: 'failed-child', last_assistant_message: JSON.stringify(found) } }] };
        await artifact('review-progress.json', JSON.stringify(failedJournal), 'failure');
        await artifact('transcript.jsonl', JSON.stringify({ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed', receiver_thread_ids: ['failed-child'] } }) + '\n', 'failure');
        const recovery = await store.recordFailure('failed-author');
        assert.equal(recovery.eligible, true);
        assert.equal(recovery.slot, 'recheck');
        assert.equal(recovery.cycle.repair.started, true);
        assert.equal(recovery.cycle.repair.outcome, 'failed');
        assert.deepEqual(await store.recordFailure('failed-author'), recovery);
        const resumedJob = JSON.stringify({ ...JSON.parse(failureJob), reviewContinuation: { sourceAttemptId: 'failed-author' } });
        const resumedJobDigest = await sha256Hex(resumedJob);
        await db.prepare("INSERT INTO agent_attempts VALUES ('resumed-author','recovery-run','planning_author','collecting','destroyed',?,?, 'resumed',NULL)")
            .bind(resumedJob, resumedJobDigest).run();
        await db.prepare("INSERT INTO artifact_manifests VALUES ('resumed','complete')").run();
        const closed = { ratings: { F1: 'open' }, sources: [], searchDisposition: 'not_searched' };
        const resumedJournal = { ...recovery.journal, attemptId: 'resumed-author', events: [...recovery.journal.events,
                { type: 'invoke', slot: 'recheck', invocationId: 'recheck-child', inputDigest: candidate.digest, authenticatedContinuation: true },
                { type: 'result', slot: 'recheck', invocationId: 'recheck-child', inputDigest: candidate.digest, lifecycleVerified: true, result: closed }],
            children: [...recovery.journal.children, { ...child, invocationId: 'recheck-child', parentAttemptId: 'resumed-author', transcript: nativeTranscript('recheck-child', closed), sha256: await sha256Hex(nativeTranscript('recheck-child', closed)),
                    start: { ...child.start, agent_id: 'recheck-child' }, finish: { ...child.finish, agent_id: 'recheck-child', last_assistant_message: JSON.stringify(closed) } }] };
        await artifact('review-progress.json', JSON.stringify(resumedJournal), 'resumed');
        await artifact('transcript.jsonl', JSON.stringify({ type: 'item.completed', item: { type: 'collab_tool_call', tool: 'spawn_agent', status: 'completed', receiver_thread_ids: ['recheck-child'] } }) + '\n', 'resumed');
        await store.prepare('resumed-author', resumedJobDigest, 'resumed', { candidate: files });
        const resumed = await store.acceptJournal({ ...acceptance, runId: 'recovery-run', attemptId: 'resumed-author', manifestId: 'resumed' });
        assert.equal(resumed.repair.outcome, 'failed');
        assert.equal(resumed.discovery.invocations.length, 1);
        assert.equal(resumed.recheck.invocations.length, 1);
        assert.deepEqual(resumed.openIds, ['F1']);
        assert.equal(resumed.originAttemptId, 'failed-author');
    }
    finally {
        await mf.dispose();
    }
});
