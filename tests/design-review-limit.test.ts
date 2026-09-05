import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { D1DesignReviewStore } from '../src/design-review-store.ts';
import { loadWorkflowDefinition } from '../src/workflow-definition.ts';
import { planStageRetryDefinition } from '../src/stage-retry.ts';
import { evaluateNodeOutcome } from '../src/workflow-evaluator.ts';

class Statement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly args: any[];
  constructor(db: DatabaseSync, sql: string, args: any[] = []) {
    this.db = db; this.sql = sql; this.args = args;
  }
  bind(...args: any[]) { return new Statement(this.db, this.sql, args); }
  async first() { return this.db.prepare(this.sql).get(...this.args) ?? null; }
  async run() { return { meta: { changes: Number(this.db.prepare(this.sql).run(...this.args).changes) } }; }
}
const fixture = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE design_review_rounds(round_id TEXT,run_id TEXT,round_no INTEGER,status TEXT,response_turns INTEGER,updated_at TEXT);
    CREATE TABLE design_candidates(candidate_id TEXT,run_id TEXT,round INTEGER,state TEXT,source_attempt_id TEXT,created_at TEXT);
    CREATE TABLE agent_attempts(attempt_id TEXT,run_id TEXT,node_id TEXT,state TEXT,cleanup_state TEXT);
    CREATE TABLE provider_operations(operation_id TEXT PRIMARY KEY,run_id TEXT,attempt_id TEXT,capability TEXT,action TEXT,
      sanitized_target TEXT,request_digest TEXT,state TEXT,provider_resource_id TEXT,started_at TEXT,updated_at TEXT,completed_at TEXT);
    INSERT INTO design_review_rounds VALUES ('round','run',1,'active',2,'now');`);
  const store = new D1DesignReviewStore({ prepare: (sql: string) => new Statement(db, sql) } as unknown as D1Database);
  const response = (n: number, state = 'completed', cleanup = 'destroyed') => {
    db.prepare('INSERT INTO agent_attempts VALUES (?,?,?,?,?)').run(`a${n}`, 'run', 'design_self_response', state, cleanup);
    db.prepare('INSERT INTO design_candidates VALUES (?,?,?,?,?,?)').run(`design:a${n}`, 'run', 1, 'validated', `a${n}`, String(n));
  };
  return { db, store, response };
};

test('three completed responses exit without manufacturing a passed review; replay keeps one receipt', async () => {
  const { db, store, response } = fixture();
  response(1); response(2);
  assert.equal(await store.finishSelfReviewAtLimit('run', 'now'), false);
  response(3);
  assert.equal(await store.finishSelfReviewAtLimit('run', 'now'), true);
  assert.equal(await store.finishSelfReviewAtLimit('run', 'later'), true);
  const rows = db.prepare('SELECT * FROM provider_operations').all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].action, 'design.self_review_limit');
  assert.equal(rows[0].provider_resource_id, 'design:a3');
  assert.match(String(rows[0].request_digest), /^[a-f0-9]{64}$/);
  db.close();
});

test('running, uncleaned, rejected, or previous-round responses cannot release the loop', async () => {
  for (const change of [
    "UPDATE agent_attempts SET state='running' WHERE attempt_id='a3'",
    "UPDATE agent_attempts SET cleanup_state='pending' WHERE attempt_id='a3'",
    "UPDATE design_candidates SET state='rejected' WHERE source_attempt_id='a3'",
    "UPDATE design_candidates SET round=0 WHERE source_attempt_id='a3'",
  ]) {
    const { db, store, response } = fixture();
    response(1); response(2); response(3); db.exec(change);
    assert.equal(await store.finishSelfReviewAtLimit('run', 'now'), false);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM provider_operations').get()?.n, 0);
    db.close();
  }
});

test('an already-started response remains acceptable when retried at the limit', async () => {
  const { db, store } = fixture();
  assert.equal(await store.incrementResponseTurn('round', 'now', true), 3);
  assert.equal(await store.incrementResponseTurn('round', 'later', true), 3);
  await assert.rejects(store.incrementResponseTurn('missing', 'later', true));
  db.close();
});

test('a limit receipt never replaces independent exact-head review or finding accounting', async () => {
  const { db, store, response } = fixture();
  response(1); response(2); response(3);
  await store.finishSelfReviewAtLimit('run', 'now');
  db.exec(`ALTER TABLE design_review_rounds ADD COLUMN self_required INTEGER DEFAULT 1;
    ALTER TABLE design_review_rounds ADD COLUMN author_model TEXT DEFAULT 'author';
    ALTER TABLE design_review_rounds ADD COLUMN author_reasoning TEXT DEFAULT 'high';
    ALTER TABLE design_review_rounds ADD COLUMN outside_model TEXT DEFAULT 'reviewer';
    ALTER TABLE design_review_rounds ADD COLUMN outside_reasoning TEXT DEFAULT 'high';
    CREATE TABLE design_work_products(run_id TEXT,pull_request_database_id TEXT,head_sha TEXT);
    CREATE TABLE design_review_attempts(review_attempt_id TEXT,round_id TEXT,phase TEXT,accepted INTEGER,
      candidate_id TEXT,pr_database_id TEXT,head_sha TEXT,outcome TEXT,model TEXT,reasoning TEXT,completed_at TEXT);
    CREATE TABLE design_review_findings(review_attempt_id TEXT);
    CREATE TABLE design_review_dispositions(review_attempt_id TEXT);
    INSERT INTO design_work_products VALUES ('run','pr','head');`);
  assert.equal(await store.eligible('run'), false);
  db.exec(`INSERT INTO design_review_attempts VALUES
    ('review','round','independent',1,'design:a3','pr','head','pass','reviewer','high','now');`);
  assert.equal(await store.eligible('run'), true);
  db.exec("UPDATE design_work_products SET head_sha='other'");
  assert.equal(await store.eligible('run'), false);
  db.exec(`UPDATE design_work_products SET head_sha='head';
    UPDATE design_review_attempts SET outcome='concerns';
    INSERT INTO design_review_findings VALUES ('review');`);
  assert.equal(await store.eligible('run'), false);
  db.exec("INSERT INTO design_review_dispositions VALUES ('review')");
  assert.equal(await store.eligible('run'), true);
  db.exec("UPDATE provider_operations SET sanitized_target='other-round'");
  assert.equal(await store.eligible('run'), false);
  db.close();
});

const bundle = {
  prompts: Object.fromEntries(readdirSync('config/prompts').map(name => [`prompts/${name}`, readFileSync(`config/prompts/${name}`, 'utf8')])),
  schemas: Object.fromEntries(readdirSync('config/schemas').map(name => [`schemas/${name}`, readFileSync(`config/schemas/${name}`, 'utf8')])),
};
const yaml = readFileSync('config/workflow.simple-traceability.yaml', 'utf8');
const current = await loadWorkflowDefinition(yaml, bundle);
const old = await loadWorkflowDefinition(yaml.replace('version: 21', 'version: 20')
  .replace('limit_reached: publish_design, ', ''), bundle);
const source = { run_id: 'run', definition_id: old.name, definition_version: old.version,
  definition_digest: old.digest, source_canonical_json: JSON.stringify(old), workflow_instance_id: 'old',
  current_visit_sequence: 28, target_registered: 1, has_published_product: 1, has_validated_candidate: 1,
  has_published_entry: 0, has_failed_exit: 0 };

test('v20 retry upgrades only the limit edge and retains completed planning and human gates', async () => {
  const plan = await planStageRetryDefinition(source, 'design_self_response', current);
  assert.equal(plan.retryKind, 'compatible_tail');
  assert.equal(plan.targetDefinitionVersion, 21);
  assert.equal(plan.sourceDefinitionDigest, old.digest);
  assert.notEqual(plan.targetWorkflowInstanceId, 'old');
  const decision = evaluateNodeOutcome(current, 'design_self_review', {
    kind: 'agent', outcome: 'limit_reached', providerReceiptsPresent: false, providerReceiptsComplete: true,
  });
  assert.equal(decision.kind, 'transition');
  if (decision.kind === 'transition') {
    assert.equal(decision.toNode, 'publish_design');
    assert.match(decision.causeReference, /limit_reached/);
  }
  assert.deepEqual(current.nodes.design_review, old.nodes.design_review);
  for (const broken of [
    { ...current, jobs: { ...current.jobs, design_author: { ...current.jobs.design_author, prompt: 'changed' } } },
    { ...current, nodes: { ...current.nodes, planning_review: { ...current.nodes.planning_review, edges: {} } } },
  ]) await assert.rejects(planStageRetryDefinition(source, 'design_self_response', broken), /stage_retry_not_eligible/);
  await assert.rejects(planStageRetryDefinition({ ...source, target_registered: 0 }, 'design_self_response', current));
});
