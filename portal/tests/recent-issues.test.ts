import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { RecentIssuesRepository, applyRecentSnapshot } from "../../src/recent-issues.ts";
import { recentIssuesPersonKey } from "../../src/recent-issues-identity.ts";
import { routePortalRequest } from "../src/worker.ts";

const person = "access:" + "a".repeat(64);
const other = "access:" + "b".repeat(64);
const issue = (n: number) => ({ issueId: `issue-${n}`, identifier: `SAC-${n}`, title: `Issue ${n}` });

test("D1 atomic history isolates people, trims, moves duplicates, and rolls back failed snapshots", async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: "history-test", modules: true, compatibilityDate: "2026-08-26", script: "export default { fetch() { return new Response('ok'); } }", d1Databases: ["DB"] }] }));
  try {
    const db = await mf.getD1Database("DB");
    const migration = await readFile(new URL("../../migrations/0034_portal_recent_issues.sql", import.meta.url), "utf8");
    for (const sql of migration.split(";").filter(sql => sql.trim())) await db.prepare(sql).run();
    const repository = new RecentIssuesRepository(db as unknown as D1Database);
    assert.deepEqual(await repository.list(person), { snapshotVersion: 0, items: [] });
    await repository.record(other, issue(20));
    for (let n = 1; n <= 11; n++) await repository.record(person, issue(n));
    assert.deepEqual((await repository.list(person)).items.map(i => i.identifier), Array.from({ length: 10 }, (_, i) => `SAC-${11-i}`));
    const repeated = await repository.record(person, { ...issue(4), title: "😀".repeat(513) });
    assert.equal(repeated.items.length, 10);
    assert.equal(repeated.items[0].identifier, "SAC-4");
    assert.equal([...repeated.items[0].title].length, 512);
    assert.deepEqual((await repository.list(other)).items, [issue(20)]);
    await Promise.all([repository.record(person, issue(12)), repository.record(person, issue(13))]);
    const before = await repository.list(person);
    // Fail the final SELECT inside the actual D1 batch, after delete/insert/trim.
    const failing = new RecentIssuesRepository({
      prepare: (sql: string) => db.prepare(sql),
      batch: (statements: Parameters<typeof db.batch>[0]) => db.batch([...statements.slice(0, 3), db.prepare("SELECT * FROM missing_snapshot_table")]),
    } as unknown as D1Database);
    await assert.rejects(failing.record(person, issue(99)), /missing_snapshot_table/);
    assert.deepEqual(await repository.list(person), before);
    await assert.rejects(repository.record(person, { ...issue(1), identifier: "x".repeat(65) }), /Invalid recent issue/);
    assert.deepEqual(await repository.list(person), before);
  } finally { await mf.dispose(); }
});

test("verified subject survives email rename while reused email and different issuers stay isolated", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey); jwk.kid = "test";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const token = (sub: string | undefined, email: string, team = "test") => new SignJWT({ sub, email })
    .setProtectedHeader({ alg: "RS256", kid: "test" }).setIssuer(`https://${team}.cloudflareaccess.com`)
    .setAudience("portal").setExpirationTime("2m").sign(privateKey);
  const config = { teamDomain: "test.cloudflareaccess.com", audience: "portal", allowedEmail: "old@example.com" };
  const first = await recentIssuesPersonKey(await token("alice", config.allowedEmail), config, keys);
  const renamed = { ...config, allowedEmail: "new@example.com" };
  assert.equal(await recentIssuesPersonKey(await token("alice", renamed.allowedEmail), renamed, keys), first);
  assert.notEqual(await recentIssuesPersonKey(await token("bob", config.allowedEmail), config, keys), first);
  assert.notEqual(await recentIssuesPersonKey(await token("alice", config.allowedEmail, "second"), { ...config, teamDomain: "second.cloudflareaccess.com" }, keys), first);
  await assert.rejects(recentIssuesPersonKey(await token(undefined, config.allowedEmail), config, keys), /subject/);
  await assert.rejects(recentIssuesPersonKey(await token("alice", config.allowedEmail), { ...config, audience: "other" }, keys));
  await assert.rejects(recentIssuesPersonKey(null, config, keys), /unauthorized/);
});

test("late load and search snapshots cannot replace a newer commit", () => {
  const current = { snapshotVersion: 12, items: [issue(12)] };
  assert.equal(applyRecentSnapshot(current, { snapshotVersion: 0, items: [] }), current);
  assert.equal(applyRecentSnapshot(current, { snapshotVersion: 11, items: [issue(11)] }), current);
  assert.deepEqual(applyRecentSnapshot(current, current), current);
});

test("history API records only exact eligible GET searches, returns explicit errors, and opens stable IDs read-only", async () => {
  let eligible = true;
  let records = 0;
  let unavailable = false;
  const row = { issue_id: "11111111-1111-1111-1111-111111111111", project_id: "project", issue_key: "SAC-1", title: "One", linear_url: "https://linear.app/one", observed_at: "now" };
  const db = { prepare(sql: string) { return { bind(...values: unknown[]) { return {
    async all() { return { results: sql.includes("FROM orchestration_runs") ? [] : [row] }; },
    async first() {
      if (sql.includes("SELECT run_id")) return eligible ? { run_id: "run" } : null;
      if (sql.includes("issue.issue_id = ?")) assert.equal(values[0], row.issue_id);
      return row;
    },
  }; } }; } };
  const env = { DB: db, ACCESS_TEAM_DOMAIN: "test", ACCESS_AUD: "test", ALLOWED_EMAIL: "test", RECENT_ISSUES: {
    async list(assertion: string) { assert.equal(assertion, "verified-token"); if (unavailable) throw new Error("D1 unavailable"); return { snapshotVersion: 2, items: [issue(1)] }; },
    async record(assertion: string, saved: unknown) { records++; assert.equal(assertion, "verified-token"); assert.deepEqual(saved, { issueId: row.issue_id, identifier: row.issue_key, title: row.title }); if (unavailable) throw new Error("D1 unavailable"); return { snapshotVersion: 3, items: [issue(1)] }; },
  } } as unknown as Parameters<typeof routePortalRequest>[1];
  const call = (path: string, method = "GET") => routePortalRequest(new Request(`https://portal.test${path}`, { method, headers: { "CF-Access-Jwt-Assertion": "verified-token" } }), env, async () => ({ email: "test" }));
  assert.equal(((await (await call("/api/issues?query=SAC-1")).json()) as {recentIssues:{state:string}}).recentIssues.state, "updated");
  assert.equal(records, 1);
  eligible = false;
  assert.equal(((await (await call("/api/issues?query=SAC-1")).json()) as {recentIssues:{state:string}}).recentIssues.state, "unchanged");
  await call("/api/issues?query=SAC"); await call("/api/issues?query=SAC-1", "HEAD");
  await call(`/api/issues/${row.issue_id}/runs`);
  assert.equal(records, 1);
  assert.equal((await call("/api/recent-issues")).status, 200);
  unavailable = true; eligible = true;
  const failure = await call("/api/recent-issues");
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { error: { code: "recent_history_unavailable", retryable: true } });
  const search = await call("/api/issues?query=SAC-1");
  assert.equal(search.status, 200);
  assert.equal(((await search.json()) as {recentIssues:{state:string}}).recentIssues.state, "error");
});
