import assert from "node:assert/strict";
import test from "node:test";
import {
  ImplementationGitHub,
  type ImplementationPull,
} from "../src/implementation-github.ts";
import { ImplementationStore } from "../src/implementation-store.ts";
import {
  implementationPolicy,
  type ImplementationCandidate,
} from "../src/implementation-contract.ts";
import {
  ImplementationTestDatabase,
  ImplementationTestBucket,
  seedRun,
} from "./helpers/implementation-fixture.ts";
const base = "b".repeat(40),
  tree = "c".repeat(40),
  head = "d".repeat(40);
async function fixture() {
  const db = new ImplementationTestDatabase();
  seedRun(db);
  const store = new ImplementationStore(
    db as unknown as D1Database,
    new ImplementationTestBucket() as unknown as R2Bucket,
  );
  const work = await store.allocate(
    {
      version: 1,
      runId: "run-1",
      repository: "owner/repo",
      change: "sample",
      branch: "deos/agent/SAC-172/run-1",
      approvedDesignSha: "a".repeat(40),
      testedBaseSha: base,
      policy: implementationPolicy,
      approvedFiles: [],
      issue: {},
      receipts: {},
      requirements: { kinds: [], reasons: [], blockedProviders: [] },
    },
    { userId: "human", revision: 1 },
    "SAC-172",
    1,
  );
  db.sqlite
    .prepare("UPDATE implementation_runs SET tree_sha=? WHERE run_id=?")
    .run(tree, work.run_id);
  return { db, store, work: { ...work, tree_sha: tree } };
}
test("lost branch and PR replies reconcile the fixed identities; later proof updates the same PR", async () => {
  const f = await fixture();
  let branch: string | null = null,
    creates = 0,
    updates = 0,
    refWrites = 0,
    pull: ImplementationPull | null = null;
  const request = (async (url: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(url)).pathname.replace("/repos/owner/repo", "");
    if (path === "/git/ref/heads/main")
      return Response.json({ object: { sha: base } });
    if (path.startsWith("/compare/")) return Response.json({ status: "ahead" });
    if (path.startsWith("/git/ref/heads/"))
      return branch
        ? Response.json({ object: { sha: branch } })
        : new Response("", { status: 404 });
    if (path === "/git/commits/" + base)
      return Response.json({
        sha: base,
        tree: { sha: "e".repeat(40) },
        parents: [],
      });
    if (path === "/git/commits/" + head)
      return Response.json({
        sha: head,
        tree: { sha: tree },
        parents: [{ sha: base }],
      });
    if (path === "/git/trees") return Response.json({ sha: tree });
    if (path === "/git/commits") return Response.json({ sha: head });
    if (path === "/pulls" && init?.method === "POST") {
      creates++;
      const input = JSON.parse(init.body as string);
      pull = {
        id: 42,
        number: 42,
        html_url: "https://github.test/owner/repo/pull/42",
        body: input.body,
        state: "open",
        merged: false,
        merge_commit_sha: null,
        head: { sha: head, ref: f.work.branch },
        base: { ref: "main", repo: { full_name: "owner/repo" } },
      };
      throw new Error("lost create response");
    }
    if (path === "/pulls") return Response.json(pull ? [pull] : []);
    if (path === "/pulls/42" && init?.method === "PATCH") {
      updates++;
      pull!.body = JSON.parse(init.body as string).body;
      throw new Error("lost update response");
    }
    if (path === "/pulls/42") return Response.json(pull);
    throw new Error(`Unexpected provider call ${path}`);
  }) as typeof fetch;
  const github = new ImplementationGitHub(
    "https://github.test",
    "owner/repo",
    { token: async () => "test" },
    request,
  );
  github.compareAndSwapRef = async (_branch, expected, next) => {
    assert.equal(branch, expected);
    refWrites++;
    branch = next;
    throw new Error("lost branch response");
  };
  try {
    const candidate = {
      treeSha: tree,
      files: [],
    } as unknown as ImplementationCandidate;
    await github.writeBranch(f.store, f.work, candidate);
    await github.writeBranch(
      f.store,
      await f.store.requireRun("run-1"),
      candidate,
    );
    assert.equal(refWrites, 1);
    await github.publish(
      f.store,
      await f.store.requireRun("run-1"),
      "first proof",
      "1".repeat(64),
    );
    await github.publish(
      f.store,
      await f.store.requireRun("run-1"),
      "first proof",
      "1".repeat(64),
    );
    await github.publish(
      f.store,
      await f.store.requireRun("run-1"),
      "updated proof",
      "2".repeat(64),
    );
    assert.equal(creates, 1);
    assert.equal(updates, 1);
    assert.equal((await f.store.requireRun("run-1")).pr_number, 42);
    assert.deepEqual(
      f.db.sqlite
        .prepare(
          "SELECT status FROM implementation_publications ORDER BY publication_sequence",
        )
        .all()
        .map((r) => r.status),
      ["accepted", "accepted"],
    );
    branch = "f".repeat(40);
    await assert.rejects(
      github.writeBranch(f.store, await f.store.requireRun("run-1"), candidate),
      /Unexpected provider call|unrelated head/,
    );
    assert.equal(refWrites, 1);
  } finally {
    f.db.close();
  }
});
