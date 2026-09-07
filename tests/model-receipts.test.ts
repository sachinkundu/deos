import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { D1ProviderReceiptVerifier } from "../src/capability-store.ts";

test("abandoned model calls do not invalidate a review, while unfinished external writes still do", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE provider_operations (
    operation_id TEXT, run_id TEXT, attempt_id TEXT, capability TEXT, action TEXT, state TEXT);
    INSERT INTO provider_operations VALUES
      ('abandoned','run','attempt','model','openrouter_responses','pending'),
      ('retry','run','attempt','model','openrouter_responses','succeeded');`);
  const statement = (sql: string, args: any[] = []) => ({
    bind: (...values: any[]) => statement(sql, values),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  const verifier = new D1ProviderReceiptVerifier({ prepare: statement } as unknown as D1Database);
  assert.equal(await verifier.verify("run", "attempt", undefined, true), true);
  assert.equal(await verifier.verify("run", "attempt"), false);
  db.exec("DELETE FROM provider_operations");
  assert.equal(await verifier.verify("run", "attempt", undefined, true), true);
  assert.equal(await verifier.verify("run", "attempt"), false);
  db.exec(`INSERT INTO provider_operations VALUES
    ('write','run','attempt','linear','upsert_working_note','pending'),
    ('abandoned','run','attempt','model','openrouter_responses','pending');`);
  assert.equal(await verifier.verify("run", "attempt", undefined, true), false);
  db.exec("UPDATE provider_operations SET state='succeeded' WHERE operation_id='write'");
  assert.equal(await verifier.verify("run", "attempt", undefined, true), true);
  assert.equal(await verifier.verify("run", "attempt"), false);
  db.close();
});
