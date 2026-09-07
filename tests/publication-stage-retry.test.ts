import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { D1StageRetryStore } from "../src/publication-stage-retry.ts";
import { AgentStageRetryController } from "../src/stage-retry.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";
import { portalRunRetry, PORTAL_SELECTS } from "../portal/src/model.ts";

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
     workflow_instance_id,current_node,current_visit_sequence,status,terminal_cause,last_transition_id,created_at,updated_at)
    VALUES ('run','correlation',1,'project','issue',?,?,?,'old-workflow','system_action_failed',15,
      'failed','system_action_invariant_failed','failure','now','now')`)
    .run(definition.name,definition.version,definition.digest);
  database.sqlite.exec(`INSERT INTO dispatch_intents
    (run_id,source_delivery_id,workflow_instance_id,state,created_at,updated_at)
    VALUES ('run','delivery','old-workflow','established','now','now');
    INSERT INTO workflow_transitions_v2
    (transition_id,run_id,from_node,to_node,from_visit_sequence,to_visit_sequence,cause_type,cause_reference,occurred_at)
    VALUES ('failure','run','publish_planning_revision','system_action_failed',14,15,'system_action',
      'system:github.publish_planning_candidate:failed','now');`);
  return { database, definition, store: new D1StageRetryStore(database as unknown as D1Database),
    input: { runId: "run",failedAttemptId: "failure",retryNode: "publish_planning_revision" as const,
      requestedBy: "operator@example.com",targetDefinition: definition,now: "later" } };
};

test("publication retry keeps its frozen definition and advances only the failed publication visit", async () => {
  const { database,store,input } = await setup();
  try {
    const first = await store.prepare(input);
    assert.equal(first.retry_node,"publish_planning_revision");
    assert.equal(first.to_visit_sequence,16);
    assert.equal(first.source_definition_digest,first.target_definition_digest);
    assert.notEqual(first.target_workflow_instance_id,"old-workflow");
    assert.equal((await store.prepare(input)).retry_id,first.retry_id);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM publication_stage_retries").get()?.n,1);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM workflow_transitions_v2").get()?.n,2);
    assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM agent_attempts").get()?.n,0);
    const row = database.sqlite.prepare(PORTAL_SELECTS.retryForRun).get("run");
    assert.equal(row?.retry_node,"publish_planning_revision");
    await store.observe({retryId:first.retry_id,state:"established",workflowStatus:"running",safeErrorCategory:null,now:"later"});
    assert.equal((await store.prepare(input)).state,"established");
  } finally { database.close(); }
});

test("publication retry rejects stale, mismatched and nonfailure visits without changing the run", async () => {
  for (const sql of [
    "UPDATE orchestration_runs SET status='canceled'",
    "UPDATE orchestration_runs SET current_visit_sequence=16",
    "UPDATE workflow_transitions_v2 SET cause_reference='system:other:failed'",
    "UPDATE workflow_transitions_v2 SET from_node='publish_design'",
  ]) {
    const {database,store,input} = await setup();
    try {
      database.sqlite.exec(sql);
      await assert.rejects(store.prepare(input),/stage_retry_not_eligible/);
      assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS n FROM publication_stage_retries").get()?.n,0);
      assert.equal(database.sqlite.prepare("SELECT workflow_instance_id FROM orchestration_runs").get()?.workflow_instance_id,"old-workflow");
    } finally {database.close();}
  }
});

test("portal exposes retry for the failed publication even with no failed agent attempt", () => {
  const run = {status:"failed",current_node:"system_action_failed",current_visit_sequence:15,terminal_cause:"system_action_invariant_failed"};
  const transition = {transition_id:"failure",from_node:"publish_planning_revision",to_node:"system_action_failed",
    from_visit_sequence:14,to_visit_sequence:15,cause_reference:"system:github.publish_planning_candidate:failed"};
  assert.deepEqual(portalRunRetry(run,[],[transition],null),{failedAttemptId:"failure",retryNode:"publish_planning_revision"});
  assert.equal(portalRunRetry({...run,status:"active"},[],[transition],null),null);
  assert.equal(portalRunRetry(run,[],[{...transition,from_visit_sequence:12}],null),null);
});


test("authorized publication retry creates one replacement and repeated clicks reuse it", async () => {
  const {database,store,definition} = await setup();
  let creates = 0;
  let instance: { id: string; status: () => Promise<{status:string}> } | undefined;
  const workflows = {
    async get() { if (!instance) throw new Error("instance not found"); return instance; },
    async createBatch(inputs: {id:string;params:unknown}[]) {
      creates += 1;
      assert.deepEqual(inputs[0].params,{runId:"run",sourceDeliveryId:"delivery"});
      instance = {id: inputs[0].id, status: async () => ({status:"running"})};
      return [instance];
    },
  };
  const controller = new AgentStageRetryController(store,workflows as never,"secret",definition);
  const request = (secret="secret") => new Request("https://internal/stage-retries",{
    method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},
    body:JSON.stringify({version:1,runId:"run",failedAttemptId:"failure",retryNode:"publish_planning_revision",requestedBy:"operator@example.com"}),
  });
  try {
    assert.equal((await controller.handle(request("wrong"))).status,401);
    assert.equal(creates,0);
    assert.equal((await controller.handle(request())).status,202);
    assert.equal((await controller.handle(request())).status,200);
    assert.equal(creates,1);
  } finally {database.close();}
});
