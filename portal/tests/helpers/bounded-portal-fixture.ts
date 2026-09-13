import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { D1BoundedReviewStore } from '../../../src/bounded-review-store.ts';
import { routePortalRequest } from '../../src/worker.ts';

export const sha256Hex = async (text: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
)).map(byte => byte.toString(16).padStart(2, '0')).join('');

// Local replay only. Native transcript bytes are unchanged; no provider is called.
export async function boundedPortalFixture() {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'bounded-portal-replay', modules: true, compatibilityDate: '2026-08-26',
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: ['DB'], r2Buckets: ['ARTIFACTS'],
  }] }));
  try {
    const db = await mf.getD1Database('DB') as unknown as D1Database;
    const bucket = await mf.getR2Bucket('ARTIFACTS') as unknown as R2Bucket;
    const migrations = new URL('../../../migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, migrations), 'utf8');
      await db.exec(sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join(' '));
    }
    const evidence = new URL('../../../docs/evidence/sac-170-implementation/', import.meta.url);
    const journalText = await readFile(new URL('journal.json', evidence), 'utf8');
    const journal = JSON.parse(journalText);
    const parentTranscript = await readFile(new URL('stdout.jsonl', evidence), 'utf8');
    const now = '2026-09-13T00:00:00Z';
    await db.prepare(`INSERT INTO workflow_definitions
      (definition_id,version,project_id,name,canonical_json,digest,created_at)
      VALUES ('replay',25,'replay-project','Local replay','{}','replay-digest',?)`).bind(now).run();
    await db.prepare(`INSERT INTO project_workflow_policies
      (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,human_gate_state_id,updated_at)
      VALUES ('replay-project','replay',25,'replay-digest','local/replay','In Progress','human-gate',?)`).bind(now).run();
    await db.prepare(`INSERT INTO orchestration_runs
      (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,definition_digest,workflow_instance_id,current_node,status,created_at,updated_at)
      VALUES (?,'replay',1,'replay-project','replay-issue','replay',25,'replay-digest','replay-instance','design_author','active',?,?)`)
      .bind(journal.runId, now, now).run();
    await db.prepare(`INSERT INTO linear_issue_index VALUES
      ('replay-issue','replay-project','LOCAL-170','Captured native review replay','https://example.invalid','local',?)`).bind(now).run();
    await db.prepare(`INSERT INTO artifact_manifests
      (manifest_id,run_id,attempt_id,r2_key,state,created_at)
      VALUES ('replay-manifest',?,?,'replay/manifest','complete',?)`).bind(journal.runId, journal.attemptId, now).run();
    const job = JSON.stringify({ materializedContext: '{}', model: 'gpt-5.6-sol',
      nativeSelfReview: { schema: journal.schema }, transcriptSchema: 'deos-transcript-v1' });
    const jobDigest = await sha256Hex(job);
    await db.prepare(`INSERT INTO agent_attempts
      (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,absolute_deadline,manifest_id,cleanup_state,created_at,updated_at)
      VALUES (?,'local-replay',?,'design_author',?,?,'collecting',?,'replay-manifest','pending',?,?)`)
      .bind(journal.attemptId, journal.runId, job, jobDigest, now, now, now).run();
    const artifact = async (name: string, content: string) => {
      const key = `replay/${name}`;
      await bucket.put(key, content);
      await db.prepare(`INSERT INTO artifacts VALUES ('replay-manifest',?,?,'application/jsonl',?,?,?,'accepted')`)
        .bind(name, key, new TextEncoder().encode(content).length, await sha256Hex(content), now).run();
    };
    await artifact('review-progress.json', journalText);
    await artifact('transcript.jsonl', parentTranscript);
    await artifact('agent-input-manifest.json', await readFile(new URL('codex-grounding.json', evidence), 'utf8'));
    const store = new D1BoundedReviewStore(db, bucket);
    await store.prepare(journal.attemptId, jobDigest, 'replay-manifest', { candidate: journal.checkedCandidate.files });
    const acceptance = { runId: journal.runId, attemptId: journal.attemptId, manifestId: 'replay-manifest',
      inputDigest: journal.inputDigest, candidateFiles: journal.checkedCandidate.files };
    const env = { DB: db, ARTIFACTS: bucket } as Parameters<typeof routePortalRequest>[1];
    const request = (path: string, authenticated = true) => routePortalRequest(new Request(`http://localhost${path}`), env,
      async () => { if (!authenticated) throw new Error('unauthorized'); return { email: 'local-replay@example.invalid' }; });
    return { mf, db, bucket, store, journal, journalText, acceptance, request };
  } catch (error) {
    try { await mf.dispose(); } catch (cleanup) { throw new AggregateError([error, cleanup], 'Replay setup and cleanup failed', { cause: error }); }
    throw error;
  }
}
