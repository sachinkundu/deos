import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { ImplementationProviderTest, REVIEW_TEST_ADAPTER, type ReviewTestProfile } from "../src/implementation-provider-test.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { sha256Hex } from "../src/implementation-hash.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";

const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const profile: ReviewTestProfile = { repository: "owner/test-repo", projectId: "test-project", teamId: "test-team", githubUserId: 7,
  states: { review: "review", work: "work", merge: "merge", canceled: "cancel" } };
const subject = { change: "sample", approvedDesignSha: "a".repeat(40), testedBaseSha: "b".repeat(40), treeSha: "c".repeat(40) };
async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket(); seedRun(db);
  db.sqlite.prepare("UPDATE orchestration_runs SET route_repository='owner/real-repo',route_github_installation_id='9'").run();
  const env = { DB: db, ARTIFACTS: bucket, GITHUB_API_URL: "https://github.test", GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: privateKey,
    IMPLEMENTATION_TEST_GITHUB_TOKEN: "user-token", LINEAR_API_URL: "https://linear.test", LINEAR_APP_ACCESS_TOKEN: "app-token",
    LINEAR_APP_ACTOR_ID: "app" } as unknown as Env;
  const store = new ImplementationStore(env.DB, env.ARTIFACTS), provider = new ImplementationProviderTest(env);
  const profileJson = JSON.stringify(profile), digest = await sha256Hex(profileJson), binding = `${REVIEW_TEST_ADAPTER}@${digest}`;
  db.sqlite.prepare("INSERT INTO implementation_test_profiles VALUES (?,?,?,?,?,?)").run("run-1", binding, profileJson, digest, "2026-09-14", "operator");
  const run = await store.allocate({ version: 1, runId: "run-1", repository: "owner/real-repo", change: "sample", branch: "deos/agent/SAC-182/run-1",
    approvedDesignSha: subject.approvedDesignSha, testedBaseSha: subject.testedBaseSha, policy: { ...implementationPolicy, safeAdapters: [binding] },
    approvedFiles: [], issue: {}, receipts: {}, requirements: { kinds: [], reasons: [], blockedProviders: [] } }, { userId: "human", revision: 1 }, "SAC-182", 1);
  for (const attempt of ["one", "two"]) { seedAttempt(db, attempt); await store.beginTry(run, { attempt_id: attempt, sandbox_id: `impl-${attempt}`, visit_sequence: 1 }, "build"); }
  const resource = await store.allocateResource("run-1", "one", "safe_test", REVIEW_TEST_ADAPTER);
  const owned = { profile, branch: "deos/canary/one", head: "d".repeat(40), heads: ["d".repeat(40)], pullNumber: 12,
    pullUrl: "https://github.test/owner/test-repo/pull/12", issueId: "test-issue", issueUrl: "https://linear.test/test-issue" };
  db.sqlite.prepare("UPDATE implementation_resources SET status='ready',provider_resource_id=?,namespace=?,metadata_json=? WHERE resource_id=?")
    .run(owned.issueId, "owner/test-repo:12", JSON.stringify(owned), resource.resource_id);
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  let state = "review", loseMove = false;
  const fetcher: typeof fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/access_tokens")) return Response.json({ token: "installation", expires_at: "2099-01-01T00:00:00Z" });
    if (String(url).endsWith("/user")) return Response.json({ id: 7, login: "tester", type: "User" });
    if (String(url).includes("/reviews")) return Response.json({ id: 99, user: { id: 7 }, commit_id: owned.head, state: "COMMENTED" });
    if (String(url) === "https://linear.test") {
      const vars = body.variables as Record<string, string>;
      if (String(body.query).includes("issueUpdate")) {
        assert.equal(vars.id, owned.issueId); state = vars.state;
        if (loseMove) throw new Error("Linear mutation reply lost");
        return Response.json({ data: { issueUpdate: { success: true, issue: { id: vars.id, state: { id: state } } } } });
      }
      return Response.json({ data: { issue: { id: owned.issueId, state: { id: state } } } });
    }
    throw new Error(`Unexpected provider URL: ${url}`);
  };
  const call = (value: Record<string, unknown>, attempt = "one") => provider.call("run-1", attempt, [binding], {
    action: "safe_test", resourceId: resource.resource_id, subject, ...value,
  });
  return { db, store, provider, resource, owned, binding, calls, fetcher, call, loseMove: () => { loseMove = true; } };
}

test("provider tests reject a different resource, person, repository path or issue before any write", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await assert.rejects(f.call({ operation: "linear.move", operationId: "cross", issueId: "real-issue", stateId: "work" }), /target_denied/);
    await assert.rejects(f.call({ operation: "github.read", path: "/../../other" }), /path_denied/);
    await assert.rejects(f.call({ operation: "github.review", operationId: "head", body: { commit_id: "e".repeat(40), event: "APPROVE" } }), /review_denied/);
    await assert.rejects(f.call({ operation: "linear.read" }, "two"), /resource_mismatch/);
    assert.equal(f.calls.filter(c => c.url.includes("/reviews") || String(c.body.query).includes("issueUpdate")).length, 0);
  } finally { globalThis.fetch = original; f.db.close(); }
});

test("the same provider operation is returned once; an ambiguous mutation never repeats", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    const move = { operation: "linear.move", operationId: "move", issueId: "test-issue", stateId: "work" };
    const response = await f.call(move); assert.deepEqual(await f.call(move), response);
    assert.equal(f.calls.filter(c => String(c.body.query).includes("issueUpdate")).length, 1);
    await assert.rejects(f.call({ ...move, stateId: "merge" }), /identity_mismatch/);
    f.loseMove();
    await assert.rejects(f.call({ ...move, operationId: "lost", stateId: "merge" }), /reply lost/);
    await assert.rejects(f.call({ ...move, operationId: "lost", stateId: "merge" }), /uncertain/);
    assert.equal(f.calls.filter(c => String(c.body.query).includes("issueUpdate")).length, 2);
  } finally { globalThis.fetch = original; f.db.close(); }
});

test("provider proof requires the exact signed actor/state transition and current tested tree", async () => {
  const f = await fixture(), original = globalThis.fetch; globalThis.fetch = f.fetcher;
  try {
    await f.call({ operation: "github.review", operationId: "review", body: { commit_id: f.owned.head, event: "COMMENT", body: "Test note" } });
    await f.call({ operation: "linear.move", operationId: "move", issueId: "test-issue", stateId: "work" });
    const proof = { operation: "proof", githubOperationId: "review", linearOperationId: "move" };
    await assert.rejects(f.call(proof), /signed_delivery_pending/);
    f.db.sqlite.prepare("INSERT INTO deliveries (delivery_id,payload_hash,received_at,classification) VALUES ('delivery',?,'2099-01-01T00:00:00Z','relevant')").run("e".repeat(64));
    f.db.sqlite.prepare("INSERT INTO implementation_test_events VALUES ('delivery',?,'test-issue','wrong','review','work','2099-01-01',?,'2099-01-01T00:00:00Z')")
      .run(f.resource.resource_id, "e".repeat(64));
    await assert.rejects(f.call(proof), /signed_delivery_pending/);
    f.db.sqlite.prepare("UPDATE implementation_test_events SET actor_id='app'").run();
    const evidence = await f.call(proof); assert.equal("providerDeliveryId" in evidence && evidence.providerDeliveryId, "delivery");
    await assert.rejects(f.call({ ...proof, subject: { ...subject, treeSha: "f".repeat(40) } }), /subject_changed/);
  } finally { globalThis.fetch = original; f.db.close(); }
});
