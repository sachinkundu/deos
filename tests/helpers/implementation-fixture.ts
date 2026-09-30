import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
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
    return (
      (this.statement().get(...this.boundValues()) as T | undefined) ?? null
    );
  }

  async all<T>(): Promise<{
    results: T[];
    success: true;
    meta: Record<string, never>;
  }> {
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

export class ImplementationTestDatabase {
  readonly sqlite: DatabaseSync;

  constructor(path = ':memory:') {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    if(this.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='workflow_definitions'").get())return;
    for (const filename of readdirSync("migrations")
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      this.sqlite.exec(readFileSync(`migrations/${filename}`, "utf8"));
    }
  }

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(
    statements: readonly SqliteD1Statement[],
  ): Promise<Array<{ success: true; meta: { changes: number } }>> {
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

export class ImplementationTestBucket {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: string | Uint8Array,
    options?: {onlyIf?:{etagDoesNotMatch?:string}}) {
    if (options?.onlyIf?.etagDoesNotMatch === '*' && this.objects.has(key)) return null;
    if (!this.objects.has(key))
      this.objects.set(
        key,
        typeof value === "string"
          ? new TextEncoder().encode(value)
          : new Uint8Array(value),
      );
    return {key};
  }
  async get(key: string) {
    const bytes = this.objects.get(key);
    return bytes
      ? {
          arrayBuffer: async () => new Uint8Array(bytes).buffer,
          text: async () => new TextDecoder().decode(bytes),
        }
      : null;
  }
}
export function seedRun(
  db: ImplementationTestDatabase,
  runId = "run-1",
  issueId = "issue-1",
) {
  db.sqlite
    .prepare(
      `INSERT OR IGNORE INTO workflow_definitions
    (definition_id,version,project_id,name,canonical_json,digest,created_at) VALUES ('implementation',25,'project','implementation','{}',?,'2026-09-14T00:00:00Z')`,
    )
    .run("d".repeat(64));
  db.sqlite
    .prepare(
      `INSERT INTO orchestration_runs
    (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,definition_digest,workflow_instance_id,
    current_node,current_visit_sequence,status,allowed_linear_user_id,human_binding_revision,created_at,updated_at)
    VALUES (?,?,1,'project',?,'implementation',25,?,?,'implementation_review',1,'awaiting_human','human',1,?,?)`,
    )
    .run(
      runId,
      runId,
      issueId,
      "d".repeat(64),
      runId,
      "2026-09-14T00:00:00Z",
      "2026-09-14T00:00:00Z",
    );
}
export function seedAttempt(
  db: ImplementationTestDatabase,
  attemptId: string,
  runId = "run-1",
) {
  db.sqlite
    .prepare(
      `INSERT INTO agent_attempts (attempt_id,sandbox_id,run_id,node_id,job_spec_json,job_spec_digest,state,absolute_deadline,created_at,updated_at,visit_sequence)
  VALUES (?,?,?,'implementation_build','{}',?,'running',?,?,?,1)`,
    )
    .run(
      attemptId,
      `impl-${attemptId}`,
      runId,
      "d".repeat(64),
      "2026-09-15T00:00:00Z",
      "2026-09-14T00:00:00Z",
      "2026-09-14T00:00:00Z",
    );
}
