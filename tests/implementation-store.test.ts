import assert from "node:assert/strict";
import test from "node:test";
import {
  ImplementationStore,
  type ImplementationInput,
} from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { D1OrchestrationStore } from "../src/orchestration-store.ts";
import { sha256Hex } from '../src/implementation-hash.ts';
import type { ImplementationCandidate } from '../src/implementation-contract.ts';
import {
  ImplementationTestDatabase,
  ImplementationTestBucket,
  seedRun,
  seedAttempt,
} from "./helpers/implementation-fixture.ts";
const now = "2026-09-14T01:00:00Z";

test('successful checkpoint clears current failure code but retains original error evidence',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  try {
    seedRun(db);seedAttempt(db,'recovered');
    const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    const work=await store.allocate(input(),{userId:'human',revision:1},'SAC-172',1);
    await store.beginTry(work,{attempt_id:'recovered',sandbox_id:'impl-recovered',visit_sequence:1},'build');
    await store.error('run-1','recovered','preview',new Error('original relay failure'));
    await store.checkpoint(work,{attemptId:'recovered',testedBaseSha:work.tested_base_sha,
      treeSha:'c'.repeat(40),patchSha:await sha256Hex('patch'),kind:'build',outcome:'completed'} as ImplementationCandidate,'patch');
    const row=db.sqlite.prepare("SELECT status,public_error_code,primary_error_manifest FROM implementation_tries WHERE attempt_id='recovered'").get()!;
    assert.equal(row.status,'completed');assert.equal(row.public_error_code,null);assert.ok(row.primary_error_manifest);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM implementation_effect_errors').get()!.n,1);
    await store.error('run-1','recovered','cleanup',new Error('late cleanup diagnostic'));
    assert.equal(db.sqlite.prepare("SELECT public_error_code FROM implementation_tries WHERE attempt_id='recovered'").get()!.public_error_code,null);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) n FROM implementation_effect_errors').get()!.n,2);
  } finally {db.close();}
});
export const input = (id = "run-1"): ImplementationInput => ({
  version: 1,
  runId: id,
  repository: "owner/repo",
  change: "sample",
  branch: `deos/agent/SAC-172/run-${id === "run-1" ? 1 : 2}`,
  approvedDesignSha: "a".repeat(40),
  testedBaseSha: "b".repeat(40),
  policy: implementationPolicy,
  approvedFiles: [],
  issue: {},
  receipts: {},
  requirements: { kinds: ["showboat"], reasons: [], blockedProviders: [] },
});
test("additive migration, R2 hash checks, fresh tries and cross-run resource rejection", async () => {
  const db = new ImplementationTestDatabase(),
    bucket = new ImplementationTestBucket();
  try {
    seedRun(db);
    seedRun(db, "run-2", "issue-2");
    const store = new ImplementationStore(
      db as unknown as D1Database,
      bucket as unknown as R2Bucket,
    );
    const run = await store.allocate(
      input(),
      { userId: "human", revision: 1 },
      "SAC-172",
      1,
    );
    const second = await store.allocate(
      input("run-2"),
      { userId: "human", revision: 1 },
      "SAC-172",
      2,
    );
    for (const [id, work] of [
      ["a1", run],
      ["a2", run],
      ["b1", second],
    ] as const) {
      seedAttempt(db, id, work.run_id);
      await store.beginTry(
        work,
        { attempt_id: id, sandbox_id: `impl-${id}`, visit_sequence: 1 },
        "build",
      );
    }
    assert.deepEqual(
      db.sqlite
        .prepare(
          "SELECT try_sequence FROM implementation_tries WHERE run_id=? ORDER BY try_sequence",
        )
        .all("run-1")
        .map((r) => r.try_sequence),
      [1, 2],
    );
    const resource = await store.allocateResource(
      "run-1",
      "a1",
      "browser",
      "cloudflare",
    );
    db.sqlite
      .prepare(
        "UPDATE implementation_resources SET status='ready',provider_resource_id='browser-one' WHERE resource_id=?",
      )
      .run(resource.resource_id);
    await store.assertResource(
      "run-1",
      "a1",
      resource.resource_id,
      "browser-one",
    );
    await assert.rejects(
      store.assertResource("run-2", "b1", resource.resource_id, "browser-one"),
      /not ready/,
    );
    await assert.rejects(
      store.assertResource("run-1", "a2", resource.resource_id, "browser-one"),
      /not ready/,
    );
    const object = await store.put("run-1", "proof.txt", "real output");
    bucket.objects.set(object.key, new TextEncoder().encode("changed"));
    await assert.rejects(
      store.readBytes(object.key, object.sha256),
      /hash mismatch/,
    );
  } finally {
    db.close();
  }
});
test("an ambiguous create-only upload reconciles only by reading the exact bytes", async () => {
  const db = new ImplementationTestDatabase();
  const bucket = new ImplementationTestBucket();
  const put = bucket.put.bind(bucket);
  bucket.put = async (key, value) => {
    await put(key, value);
    throw new Error("lost response");
  };
  const store = new ImplementationStore(
    db as unknown as D1Database,
    bucket as unknown as R2Bucket,
  );
  try {
    const proof = await store.put("run", "proof.txt", "actual bytes");
    assert.equal(
      new TextDecoder().decode(await store.readBytes(proof.key, proof.sha256)),
      "actual bytes",
    );
  } finally {
    db.close();
  }
});
test("terminal attempt state repairs stale try summaries without changing attempts, errors or uncertainty", async () => {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket();
  try {
    seedRun(db); seedRun(db, "run-2", "issue-2");
    const store = new ImplementationStore(db as unknown as D1Database, bucket as unknown as R2Bucket);
    const work = await store.allocate(input(), {userId:"human",revision:1}, "SAC-172", 1);
    const other = await store.allocate(input("run-2"), {userId:"human",revision:1}, "SAC-172", 2);
    for (const [id, run, state, status] of [
      ["failed",work,"failed","running"], ["interrupted",work,"interrupted","completed"],
      ["timeout",work,"absolute_timeout","running"], ["active",work,"running","running"],
      ["completed",work,"completed","completed"], ["uncertain",work,"failed","manual_reconciliation_required"],
      ["retry",work,"failed","retry_required"], ["other",other,"failed","running"],
    ] as const) {
      seedAttempt(db, id, run.run_id);
      await store.beginTry(run, {attempt_id:id,sandbox_id:`impl-${id}`,visit_sequence:1}, "build");
      db.sqlite.prepare("UPDATE agent_attempts SET state=?,result_detail='original failure' WHERE attempt_id=?").run(state,id);
      db.sqlite.prepare("UPDATE implementation_tries SET status=?,primary_error_manifest='saved-error',public_error_code='saved-code' WHERE attempt_id=?").run(status,id);
    }
    const attempts = db.sqlite.prepare("SELECT * FROM agent_attempts ORDER BY attempt_id").all();
    await store.reconcileFailedTries("run-1");
    const tries = db.sqlite.prepare("SELECT attempt_id,status,primary_error_manifest,public_error_code,updated_at FROM implementation_tries ORDER BY attempt_id").all();
    assert.deepEqual(Object.fromEntries(tries.map(row => [row.attempt_id,row.status])), {
      active:"running",completed:"completed",failed:"failed",interrupted:"interrupted",other:"running",
      retry:"retry_required",timeout:"absolute_timeout",uncertain:"manual_reconciliation_required",
    });
    assert.ok(tries.every(row => row.primary_error_manifest === "saved-error" && row.public_error_code === "saved-code"));
    assert.deepEqual(db.sqlite.prepare("SELECT * FROM agent_attempts ORDER BY attempt_id").all(), attempts);
    await store.reconcileFailedTries("run-1");
    assert.deepEqual(db.sqlite.prepare("SELECT attempt_id,status,primary_error_manifest,public_error_code,updated_at FROM implementation_tries ORDER BY attempt_id").all(), tries);
  } finally { db.close(); }
});
test("an eligible human event and the graph move commit atomically; replay cannot consume another decision", async () => {
  const db = new ImplementationTestDatabase(),
    bucket = new ImplementationTestBucket();
  try {
    seedRun(db);
    const store = new ImplementationStore(
      db as unknown as D1Database,
      bucket as unknown as R2Bucket,
    );
    await store.allocate(
      input(),
      { userId: "human", revision: 1 },
      "SAC-172",
      1,
    );
    const authority = new D1OrchestrationStore(db as unknown as D1Database);
    db.sqlite
      .prepare(
        `INSERT INTO implementation_gates (run_id,visit_sequence,node_id,expected_event_kind,allowed_linear_user_id,issue_id,human_state_id,opened_at)
 VALUES ('run-1',1,'implementation_review','state','human','issue-1','review',?)`,
      )
      .run(now);
    await authority.insertInboxEvent(
      {
        deliveryId: "event",
        runId: "run-1",
        correlationId: "run-1",
        eventKind: "Issue.update",
        actorId: "impostor",
        actorType: "user",
        providerTime: now,
        fromStateId: "review",
        fromStateName: "Human Review",
        toStateId: "merge",
        toStateName: "Merging",
        payloadDigest: "d".repeat(64),
      },
      now,
    );
    db.sqlite
      .prepare(
        "INSERT INTO implementation_gate_events VALUES ('event','run-1',1,'eligible',?)",
      )
      .run(now);
    const args = {
      runId: "run-1",
      expectedNode: "implementation_review",
      expectedVisitSequence: 1,
      expectedStatus: "awaiting_human" as const,
      nextNode: "implementation_merge_recheck",
      nextStatus: "active" as const,
      gateOriginNode: null,
      transitionId: "transition",
      causeType: "linear_event",
      causeReference: "event",
      actorId: "human",
      actorType: "user",
      providerOperationId: null,
      now,
      implementationGateDecision: {
        deliveryId: "event",
        outcome: "merge_authorized",
      },
    };
    assert.equal((await authority.compareAndSetNode(args)).outcome, "stale");
    assert.equal(
      db.sqlite.prepare("SELECT state FROM implementation_gates").get()?.state,
      "open",
    );
    db.sqlite
      .prepare(
        "UPDATE workflow_event_inbox SET actor_id='human' WHERE delivery_id='event'",
      )
      .run();
    assert.equal(
      (await authority.compareAndSetNode(args)).outcome,
      "committed",
    );
    assert.equal((await authority.compareAndSetNode(args)).outcome, "replayed");
    assert.equal(
      db.sqlite.prepare("SELECT state FROM implementation_gates").get()?.state,
      "merge_authorized",
    );
  } finally {
    db.close();
  }
});
