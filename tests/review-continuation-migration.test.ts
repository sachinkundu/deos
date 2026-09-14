import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrated = (): DatabaseSync => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  for (const name of readdirSync("migrations").filter((value) => /^\d{4}_.+\.sql$/.test(value)).sort()) {
    database.exec(readFileSync(`migrations/${name}`, "utf8"));
  }
  return database;
};

test("review continuation migration is additive and disabled by default", () => {
  const database = migrated();
  const columns = database.prepare("PRAGMA table_info(project_workflow_policies)").all() as { name: string }[];
  assert.ok(columns.some((column) => column.name === "bettaview_continuation_enabled"));
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  assert.ok(tables.some((table) => table.name === "review_intents"));
  assert.ok(tables.some((table) => table.name === "review_continuation_leases"));
  database.close();
});

test("frozen reviewer identity is all-or-none and immutable", () => {
  const database = migrated();
  database.exec("PRAGMA foreign_keys=OFF");
  const insert = database.prepare(`INSERT INTO orchestration_runs
    (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,definition_digest,
     workflow_instance_id,current_node,status,accumulated_data_json,created_at,updated_at,
     frozen_access_account,frozen_github_user_id,frozen_linear_user_id,bettaview_account_policy_version)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  assert.throws(() => insert.run("run:bad","c",1,"p","issue","definition",1,"d","wf","node","active","{}","n","n","a@example.com",null,null,null), /all-or-none/);
  insert.run("run:ok","c2",2,"p","issue","definition",1,"d","wf2","node","active","{}","n","n","a@example.com",42,"linear-user",1);
  assert.throws(() => database.prepare("UPDATE orchestration_runs SET frozen_github_user_id=43 WHERE run_id='run:ok'").run(), /immutable/);
  database.close();
});

