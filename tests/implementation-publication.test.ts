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
test("default transport calls the Workers fetch function without a client receiver", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, undefined, "Workers fetch rejects a client object as its receiver");
    return Response.json({ object: { sha: head } });
  } as typeof fetch;
  try {
    const github = new ImplementationGitHub("https://api.github.com", "owner/repo", { token: async () => "test" });
    assert.equal(await github.ref("main"), head);
  } finally { globalThis.fetch = original; }
});
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
test("implementation feedback includes complete PR discussion, reviews, and inline threads", async () => {
  const review = { id: 1, body: "Check the final tree", state: "CHANGES_REQUESTED" };
  const inline = { id: 2, body: "Preserve the original error", path: "src/example.ts", line: 12 };
  const discussions = Array.from({ length: 101 }, (_, index) => ({
    id: index + 3,
    body: index === 100 ? "Replace the unauthorized screenshot and test the real continuation service" : `Comment ${index}`,
    user: { login: "reviewer" },
    html_url: `https://github.test/owner/repo/pull/137#issuecomment-${index + 3}`,
  }));
  const calls: string[] = [];
  const github = new ImplementationGitHub("https://github.test", "owner/repo", { token: async () => "test" },
    (async (input, init) => {
      assert.equal(init?.method ?? "GET", "GET");
      const url = new URL(String(input));
      const path = url.pathname.replace("/repos/owner/repo", "");
      assert.equal(url.searchParams.get("per_page"), "100");
      const page = Number(url.searchParams.get("page"));
      calls.push(`${path}:${page}`);
      if (path === "/pulls/137/reviews") return Response.json([review]);
      if (path === "/pulls/137/comments") return Response.json([inline]);
      if (path === "/issues/137/comments") return Response.json(discussions.slice((page - 1) * 100, page * 100));
      throw new Error(`Unexpected feedback request ${url}`);
    }) as typeof fetch);
  assert.deepEqual(await github.feedback(137), {
    trust: "untrusted provider data", reviews: [review], comments: [inline], discussionComments: discussions,
  });
  assert.deepEqual(calls, ["/pulls/137/reviews:1", "/pulls/137/comments:1", "/issues/137/comments:1", "/issues/137/comments:2"]);
});
test("a failed PR discussion read cannot become an empty successful feedback snapshot", async () => {
  const failure = new Error("GitHub discussion read disconnected", { cause: new Error("connection reset") });
  const github = new ImplementationGitHub("https://github.test", "owner/repo", { token: async () => "test" },
    (async (input) => {
      if (new URL(String(input)).pathname === "/repos/owner/repo/issues/137/comments") throw failure;
      return Response.json([]);
    }) as typeof fetch);
  await assert.rejects(github.feedback(137), (error: unknown) => error === failure);
});
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
