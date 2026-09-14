import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { D1AgentStageRetryStore } from "../src/stage-retry.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";
class SqliteD1Statement {
  private readonly database: DatabaseSync;
  private readonly sql: string;
  private readonly values: unknown[];

  constructor(database: DatabaseSync, sql: string, values: unknown[] = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async first<T>(): Promise<T | null> {
    return (this.statement().get(...this.boundValues()) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: Record<string, never> }> {
    return {
      results: this.statement().all(...this.boundValues()) as T[],
      success: true,
      meta: {},
    };
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const result = this.statement().run(...this.boundValues());
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  private statement(): StatementSync {
    return this.database.prepare(this.sql);
  }

  private boundValues(): never[] {
    return this.values as never[];
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    for (const filename of readdirSync("migrations").filter((name) => name.endsWith(".sql")).sort()) {
      this.sqlite.exec(readFileSync(`migrations/${filename}`, "utf8"));
    }
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(statements: readonly SqliteD1Statement[]): Promise<Array<{ success: true; meta: { changes: number } }>> {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.sqlite.close();
  }
}


const setup = async () => {
  const database = new SqliteD1Database();
  const definition = await loadWorkflowDefinition(readFileSync("config/workflow.simple-traceability.yaml", "utf8"), {
    prompts: Object.fromEntries(readdirSync("config/prompts").map(name => [`prompts/${name}`,readFileSync(`config/prompts/${name}`,"utf8")])),
    schemas: Object.fromEntries(readdirSync("config/schemas").map(name => [`schemas/${name}`,readFileSync(`config/schemas/${name}`,"utf8")])),
  });
  database.sqlite.prepare(`INSERT INTO workflow_definitions
    (definition_id,version,project_id,name,canonical_json,digest,created_at) VALUES (?,?,?,?,?,?,?)`)
    .run(definition.name,definition.version,"project",definition.name,JSON.stringify(definition),definition.digest,"now");
  database.sqlite.prepare(`INSERT INTO orchestration_runs
    (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,definition_digest,
     workflow_instance_id,current_node,current_visit_sequence,status,last_transition_id,created_at,updated_at)
    VALUES ('run','correlation',1,'project','issue',?,?,?,'old-workflow','review_reconciliation',14,
      'manual_reconciliation_required','failure','now','now')`)
    .run(definition.name,definition.version,definition.digest);
  database.sqlite.exec(`INSERT INTO dispatch_intents
    (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run','delivery','old-workflow','established','now','now');
    INSERT INTO agent_attempts
    (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,absolute_deadline,result_class,cleanup_state,visit_sequence,created_at,updated_at)
    VALUES ('attempt','sandbox','run','design_author','{"boundedReview":"deos-bounded-review-v1"}','digest','failed','now','native_review_failed','destroyed',13,'now','now');
    INSERT INTO bounded_review_recoveries VALUES ('attempt',0,'{"reason":"required review artifact missing: transcript.jsonl"}','digest');
    INSERT INTO workflow_transitions_v2
    (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
    VALUES ('failure','run','design_author','review_reconciliation',13,14,'agent',
      'agent:design_author:manual_reconciliation_required','now');`);
  return { database, store: new D1AgentStageRetryStore(database as unknown as D1Database),
    input: { runId: "run",failedAttemptId: "attempt",retryNode: "design_author" as const,
      requestedBy: "operator",targetDefinition: definition,now: "later" } };
};
test('operator retry restarts an incomplete review once and preserves failed evidence', async () => {
 const {database,store,input} = await setup();
 try {
   const result = await store.prepare(input);
   assert.equal(result.to_visit_sequence,15);
   assert.equal(result.current_node,'design_author');
   assert.equal(result.source_definition_digest,result.target_definition_digest);
   assert.equal((await store.prepare(input)).retry_id,result.retry_id);
   assert.equal(database.sqlite.prepare("SELECT from_node FROM workflow_transitions_v2 WHERE transition_id=?").get(result.transition_id)?.from_node,'review_reconciliation');
   assert.equal(database.sqlite.prepare("SELECT eligible FROM bounded_review_recoveries").get()?.eligible,0);
   assert.equal(database.sqlite.prepare("SELECT state FROM agent_attempts").get()?.state,'failed');
   assert.equal(database.sqlite.prepare("SELECT count(*) AS n FROM agent_stage_retries").get()?.n,1);
 } finally {database.close();}
});
test('review restart rejects stale visits, other failures and unfinished cleanup', async () => {
 for (const sql of [
   "UPDATE orchestration_runs SET status='active'",
   "UPDATE orchestration_runs SET current_visit_sequence=15",
   "UPDATE agent_attempts SET cleanup_state='pending'",
   "UPDATE agent_attempts SET result_class='pass'",
   "UPDATE workflow_transitions_v2 SET cause_reference='agent:other:failed'",
 ]) {
   const {database,store,input} = await setup();
   try {
     database.sqlite.exec(sql);
     await assert.rejects(store.prepare(input),/stage_retry_not_eligible/);
     assert.equal(database.sqlite.prepare("SELECT count(*) AS n FROM agent_stage_retries").get()?.n,0);
   } finally {database.close();}
 }
});
