import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import test from "node:test";
import { ClaudeReviewStore } from "../src/claude-review-store.ts";
import { validateClaudeTurn, type ClaudeEnrollment } from "../src/claude-review.ts";
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



const enrollment: ClaudeEnrollment = { version: 1, secretVersion: "one", accountBinding: "a".repeat(64),
  tokenHmac: "b".repeat(64), subscription: "pro", paidUsageEnabled: false };
const setup = () => {
  const db = new SqliteD1Database();
  db.sqlite.exec(`INSERT INTO workflow_definitions (definition_id,version,project_id,name,canonical_json,digest,created_at)
    VALUES ('test',1,'project','test','{}','digest','now');
    INSERT INTO orchestration_runs (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,
      definition_version,definition_digest,workflow_instance_id,current_node,status,created_at,updated_at)
    VALUES ('run','correlation',1,'project','issue','test',1,'digest','workflow','review','active','now','now');
    INSERT INTO agent_attempts (attempt_id,sandbox_id,run_id,node_id,visit_sequence,job_spec_json,job_spec_digest,
      state,absolute_deadline,created_at,updated_at)
    VALUES ('attempt','sandbox','run','review',1,'{}','digest','running','later','now','now');`);
  const objects = new Map<string,string>();
  const bucket = { async get(key: string) { const body = objects.get(key); return body === undefined ? null : { async text() { return body; } }; },
    async put(key: string, body: string) { if (!objects.has(key)) objects.set(key,body); } };
  return { db, objects, store: new ClaudeReviewStore(db as unknown as D1Database, bucket as unknown as R2Bucket) };
};
const receipt = () => validateClaudeTurn({ attemptId: "attempt", turn: 0, inputSha256: "c".repeat(64),
  sessionId: "session", enrollment, appliedEfforts: ["high"], events: [
    { type:"system", subtype:"init", model:"claude-opus-5", apiKeySource:"none", claude_code_version:"2.1.268", session_id:"session" },
    { type:"rate_limit_event", rate_limit_info:{status:"allowed",isUsingOverage:false,overageStatus:"rejected",overageDisabledReason:"org_level_disabled"} },
    { type:"result",subtype:"success",is_error:false,terminal_reason:"completed",session_id:"session",result:'{"outcome":"concerns"}',
      modelUsage:{"claude-opus-5":{canonicalModel:"claude-opus-5",provider:"firstParty"}} },
  ] });

test("Claude tool failures retain original SDK causes in D1 and R2 without exposing credentials", async () => {
  const { ClaudeRunner } = await import("../src/claude-runner.ts");
  const { digest } = await import("../src/claude-review.ts");
  const { captureWorkflowErrors } = await import("../src/error-context.ts");
  for (const mode of ["sdk", "exit"] as const) {
    const { db, store } = setup();
    const saved = new Map<string, string>();
    const bucket = { async put(key: string, value: string) { saved.set(key, value); } };
    const credential = 'secret-with-"quotes';
    const job = { modelProvider: "claude", model: "claude-opus-5", reasoning: "high", agentRole: "reviewer",
      permissionProfile: "review_read_only", openspecChange: "sample", reviewKind: "design",
      claudeReviewSources: [{ path: "design.md", sha256: "a".repeat(64) }] };
    const encoded = JSON.stringify(job);
    try {
      db.sqlite.prepare("UPDATE agent_attempts SET job_spec_json=?,job_spec_digest=?,absolute_deadline=? WHERE attempt_id='attempt'")
        .run(encoded, await digest(encoded), new Date(Date.now() + 60_000).toISOString());
      await store.claim({ attemptId: "attempt", runnerId: "runner", jobDigest: await digest(encoded), enrollment });
      await store.started("attempt", "process");
      const original = Object.assign(new Error(`Sandbox transport reset ${credential}`, {
        cause: new Error("socket disconnected"),
      }), { code: "CONNECTION_RESET", credential, capability: "request-capability", signingKey: "signing-secret" });
      const runner = new ClaudeRunner({ db: db as unknown as D1Database, store,
        token: credential, secretVersion: "one", signingKey: "signing-secret",
        sandboxes: { get() { return { async exec() {
          if (mode === "sdk") throw original;
          return { async output() { return { exitCode: 7, truncated: false, timedOut: false,
            stdout: "", stderr: "snapshot hash mismatch", }; } };
        } }; } } as never });
      const claims = { actions: ["model.claude_review"], modelProvider: "claude", model: "claude-opus-5",
        reasoning: "high", attemptId: "attempt" } as never;
      const result = await captureWorkflowErrors(db as unknown as D1Database, bucket as unknown as R2Bucket,
        "run", "/capabilities/claude/tools", () => runner.handle("/claude/tools", { command: "cat design.md" },
          claims, "request-capability", "https://service/capabilities"));
      assert.equal(result.status, 409);
      assert.deepEqual(await result.json(), { error: "review_failure", retryNotBefore: null });
      const row = db.sqlite.prepare("SELECT message,location,detail_r2_key FROM workflow_errors").get()!;
      const raw = saved.get(String(row.detail_r2_key))!;
      const detail = JSON.parse(raw);
      assert.equal(row.location, "src/claude-runner.ts:handle:tools");
      assert.equal((await store.invocation("attempt"))?.state, "failed");
      if (mode === "sdk") {
        assert.equal(row.message, "Sandbox transport reset [REDACTED]");
        assert.equal(detail.cause.message, "socket disconnected");
        assert.equal(detail.code, "CONNECTION_RESET");
        assert.match(detail.stack, /Sandbox transport reset/);
        assert.equal(detail.credential, "[REDACTED]");
        assert.equal(detail.capability, "[REDACTED]");
        assert.equal(detail.signingKey, "[REDACTED]");
      } else {
        assert.equal(detail.exitCode, 7);
        assert.equal(detail.stderr, "snapshot hash mismatch");
        assert.equal(detail.command, "cat design.md");
      }
    } finally { db.close(); }
  }
});

test("only one invocation claim wins, and an interrupted claim cannot be reset", async () => {
  const { db, store } = setup();
  try {
    const input={attemptId:"attempt",runnerId:"runner",jobDigest:"digest",enrollment};
    assert.equal(await store.claim(input),true);
    assert.equal(await store.claim(input),false);
    await store.fail("attempt","review_failure");
    assert.equal(await store.claim(input),false);
    await assert.rejects(store.started("attempt","process"));
  } finally { db.close(); }
});

test("receipt replay preserves input identity and R2 hash; cleanup precedes finish", async () => {
  const { db, store, objects } = setup();
  try {
    await store.claim({attemptId:"attempt",runnerId:"runner",jobDigest:"digest",enrollment});
    await store.started("attempt","process");
    const turn=await store.claimTurn("attempt",0,"c".repeat(64),null);
    await assert.rejects(store.claimTurn("attempt",0,"d".repeat(64),null));
    await assert.rejects(store.claimTurn("attempt",1,"d".repeat(64),"session"));
    await store.saveReceipt(turn,receipt());
    await store.saveReceipt(turn,receipt());
    await assert.rejects(store.finish("attempt"));
    await store.cleanup("attempt","destroyed");
    await store.finish("attempt");
    await store.finish("attempt");
    assert.equal((await store.receipts("attempt"))[0].result.outcome,"concerns");
    objects.set([...objects.keys()][0],"tampered");
    await assert.rejects(store.receipts("attempt"));
  } finally { db.close(); }
});

test("changed receipt, credential binding or failed broker cannot acquire accepted proof", async () => {
  const { db, store } = setup();
  try {
    await store.claim({attemptId:"attempt",runnerId:"runner",jobDigest:"digest",enrollment});
    await store.started("attempt","process");
    const turn=await store.claimTurn("attempt",0,"c".repeat(64),null);
    await assert.rejects(store.saveReceipt(turn,{...receipt(),accountBinding:"d".repeat(64)}));
    await store.saveReceipt(turn,receipt());
    await assert.rejects(store.saveReceipt(turn,{...receipt(),result:{outcome:"pass"}}));
    await store.fail("attempt","plan_limit","2026-09-12T00:00:00.000Z");
    await store.cleanup("attempt","destroyed");
    await assert.rejects(store.finish("attempt"));
    assert.equal((await store.invocation("attempt"))?.retry_not_before,"2026-09-12T00:00:00.000Z");
  } finally { db.close(); }
});

test("trusted runner replay starts one credential-bearing process and tool denial fails the invocation", async () => {
  const { ClaudeRunner } = await import("../src/claude-runner.ts");
  const { digest, tokenHmac } = await import("../src/claude-review.ts");
  const { db, store } = setup();
  const token = "test-enrolled-token";
  const key = "k".repeat(64);
  const job = { modelProvider:"claude",model:"claude-opus-5",reasoning:"high",agentRole:"reviewer",
    permissionProfile:"review_read_only", openspecChange:"sample",reviewKind:"traceability",
    claudeReviewSources:[{path:"openspec/changes/sample/proposal.md",sha256:"a".repeat(64)}],materializedContext:"{}" };
  const encodedJob = JSON.stringify(job);
  db.sqlite.prepare("UPDATE agent_attempts SET job_spec_json=?,job_spec_digest=?,absolute_deadline=? WHERE attempt_id='attempt'")
    .run(encodedJob,await digest(encodedJob),new Date(Date.now()+60_000).toISOString());
  db.sqlite.prepare("UPDATE orchestration_runs SET independent_review_account_binding=? WHERE run_id='run'").run(enrollment.accountBinding);
  db.sqlite.prepare("INSERT INTO claude_review_enrollment VALUES (1,?,?,?,?,?)")
    .run(enrollment.secretVersion,enrollment.accountBinding,await tokenHmac(token,key),"verified","now");
  const files = new Map<string,string>();
  const executions: Array<{ id:string; command:readonly string[]; options:unknown }> = [];
  let releaseStart!: () => void;
  let reachedStart!: () => void;
  const startGate = new Promise<void>(resolve => { releaseStart = resolve; });
  const startReached = new Promise<void>(resolve => { reachedStart = resolve; });
  const sandbox = (id:string) => ({
    async mkdir() {},
    async exists(path:string) { return {exists:files.has(path)}; },
    async readFile(path:string) { return {content:files.get(path)!}; },
    async writeFile(path:string,content:string) { files.set(path,content); },
    async setKeepAlive() {}, async destroy() {},
    async exec(command:readonly string[], options:unknown) {
      executions.push({id,command,options});
      if (command.includes("/deos/bin/claude-trusted-runner.mjs")) { reachedStart(); await startGate; }
      if (command[0]==="mv") { files.set(command[2],files.get(command[1])!); files.delete(command[1]); }
      return { id:"process",async waitForExit(){return {code:0};},
        async output(){return {stdout:"",exitCode:1,truncated:false,timedOut:false};} };
    },
  });
  const runner = new ClaudeRunner({db:db as unknown as D1Database,store,
    sandboxes:{get:sandbox} as never,token,secretVersion:enrollment.secretVersion,signingKey:key});
  const claims = {actions:["model.claude_review"],modelProvider:"claude",model:"claude-opus-5",reasoning:"high",attemptId:"attempt"} as never;
  const body={ordinal:0,prompt:"Review the proposal",schema:{type:"object"},sessionId:null};
  try {
    const winner = runner.handle("/claude/review",body,claims,"capability","https://service/capabilities");
    await startReached;
    assert.equal((await store.invocation("attempt"))?.state, "claimed");
    const duplicate = await runner.handle("/claude/review",body,claims,"capability","https://service/capabilities");
    assert.equal(duplicate.status, 202);
    assert.deepEqual(await duplicate.json(), { state: "starting" });
    const poll = await runner.handle("/claude/status", {ordinal: 0}, claims, "capability", "https://service/capabilities");
    assert.equal(poll.status, 202);
    assert.deepEqual(await poll.json(), {state: "starting"});
    assert.equal((await store.invocation("attempt"))?.state, "claimed");
    releaseStart();
    assert.equal((await winner).status, 202);
    assert.equal((await runner.handle("/claude/review",body,claims,"capability","https://service/capabilities")).status,202);
    assert.equal(executions.filter(e=>e.command.includes("/deos/bin/claude-trusted-runner.mjs")).length,1);
    assert.equal([...files.values()].some(value=>value.includes(token)),false);
    assert.equal((await runner.handle("/claude/tools",{command:"cat .env"},claims,"capability","https://service/capabilities")).status,409);
    assert.equal((await store.invocation("attempt"))?.safe_cause,"review_failure");
    await assert.rejects(runner.proof("attempt"));
    await runner.cleanup("attempt");
    assert.equal((await store.invocation("attempt"))?.cleanup_state,"destroyed");
    assert.equal(executions.filter(e=>e.id==="sandbox").some(e=>JSON.stringify(e.options).includes(token)),false);
  } finally { db.close(); }
});

test("new Claude definition preserves the graph and authors while fixing only external review", async () => {
  const { loadWorkflowDefinition } = await import("../src/workflow-definition.ts");
  const files = { prompts: Object.fromEntries(readdirSync("config/prompts").map(name => [`prompts/${name}`,readFileSync(`config/prompts/${name}`,"utf8")])),
    schemas: Object.fromEntries(readdirSync("config/schemas").map(name => [`schemas/${name}`,readFileSync(`config/schemas/${name}`,"utf8")])) };
  const old = await loadWorkflowDefinition(readFileSync("config/workflow.simple-traceability.yaml","utf8"),files);
  const next = await loadWorkflowDefinition(readFileSync("config/workflow.simple-traceability-claude.yaml","utf8"),files);
  assert.deepEqual(next.nodes,old.nodes);
  for (const [name,job] of Object.entries(old.jobs)) {
    if (job.modelProvider === "openrouter") {
      assert.equal(next.jobs[name].modelProvider,"claude");
      assert.equal(next.jobs[name].model,"claude-opus-5");
      assert.equal(next.jobs[name].reasoning,"high");
      assert.ok(next.jobs[name].requiredOutputs.includes("claude-provider-proof.json"));
      assert.equal(next.jobs[name].prompt,job.prompt);
      assert.deepEqual(next.jobs[name].resultSchema,job.resultSchema);
    } else assert.deepEqual(next.jobs[name],job);
  }
});


test("Claude stage retry waits for trusted cleanup and the recorded plan reset", async () => {
  const { D1AgentStageRetryStore } = await import("../src/stage-retry.ts");
  const { db, store } = setup();
  const reads: string[] = [];
  const traced = { prepare(sql: string) { reads.push(sql); return db.prepare(sql); } };
  const retries = new D1AgentStageRetryStore(traced as unknown as D1Database);
  const input = { runId: "run", failedAttemptId: "attempt", retryNode: "independent_discovery" as const,
    requestedBy: "operator", targetDefinition: { name: "test", version: 1, digest: "digest" } as never,
    now: "2026-09-11T12:00:00.000Z" };
  const reachedWorkflowEligibility = () => reads.some(sql => sql.includes("JOIN dispatch_intents"));
  try {
    await store.claim({attemptId:"attempt",runnerId:"runner",jobDigest:"digest",enrollment});
    await store.fail("attempt", "plan_limit", "2026-09-11T13:00:00.000Z");
    await assert.rejects(retries.prepare(input), /stage_retry_not_eligible/);
    assert.equal(reachedWorkflowEligibility(), false);
    await store.cleanup("attempt", "destroyed");
    await assert.rejects(retries.prepare(input), /stage_retry_not_eligible/);
    assert.equal(reachedWorkflowEligibility(), false);
    // Once the provider reset arrives, normal frozen-run eligibility still applies.
    await assert.rejects(retries.prepare({...input, now:"2026-09-11T13:00:00.000Z"}), /stage_retry_not_eligible/);
    assert.equal(reachedWorkflowEligibility(), true);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM agent_stage_retries").get()?.n, 0);
  } finally { db.close(); }
});


test("Claude completion checkpoint is immutable and bound to the originating job", async () => {
  const { db, store } = setup();
  const collection = { manifestId: "manifest:attempt", result: { reviewOutcome: "pass" } } as never;
  try {
    assert.equal(await store.collection("attempt", "digest"), null);
    await store.saveCollection("attempt", "digest", collection);
    await store.saveCollection("attempt", "digest", collection);
    assert.deepEqual(await store.collection("attempt", "digest"), collection);
    await assert.rejects(store.collection("attempt", "different-job"));
    await assert.rejects(store.saveCollection("attempt", "digest", { ...collection as object, result: {} } as never));
  } finally { db.close(); }
});

test("reused Claude review proof rejects missing or corrupted protected receipts", async () => {
  const { ClaudeRunner } = await import("../src/claude-runner.ts");
  const { db, store, objects } = setup();
  const reuseRows = new Map([
    ["rebound", { attempt_id: null, reused_from_review_id: "original" }],
    ["original", { attempt_id: "attempt", reused_from_review_id: null }],
    ["cycle", { attempt_id: null, reused_from_review_id: "cycle" }],
  ]);
  const proofDb = { prepare(sql: string) {
    if (sql.includes("FROM trace_reviews")) return { bind(id: string) {
      return { async first() { return reuseRows.get(id) ?? null; } };
    } };
    return db.prepare(sql);
  } };
  const runner = new ClaudeRunner({ db: proofDb as unknown as D1Database, store,
    sandboxes: { get() { throw new Error("Reuse must not access a Sandbox"); } } as never,
    token: undefined, secretVersion: undefined, signingKey: "" });
  try {
    await store.claim({ attemptId: "attempt", runnerId: "trusted", jobDigest: "digest", enrollment });
    await store.started("attempt", "process");
    const turn = await store.claimTurn("attempt", 0, "c".repeat(64), null);
    await store.saveReceipt(turn, receipt());
    await store.cleanup("attempt", "destroyed");
    await store.finish("attempt");
    await assert.rejects(runner.proofForReuse("attempt"));
    db.sqlite.exec("UPDATE agent_attempts SET cleanup_state='destroyed' WHERE attempt_id='attempt'");
    await runner.proofForReuse("attempt");
    await runner.proofForReuse(null, "rebound");
    await assert.rejects(runner.proofForReuse(null, "cycle"));
    const [key, body] = [...objects][0];
    objects.set(key, "corrupted");
    await assert.rejects(runner.proofForReuse("attempt"));
    await assert.rejects(runner.proofForReuse(null, "rebound"));
    objects.delete(key);
    await assert.rejects(runner.proofForReuse("attempt"));
    objects.set(key, body);
    await runner.proofForReuse("attempt");
    await assert.rejects(runner.proofForReuse(null, "missing-review"));
  } finally { db.close(); }
});
