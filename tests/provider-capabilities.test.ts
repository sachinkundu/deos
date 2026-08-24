import assert from "node:assert/strict";
import test from "node:test";

import { GitHubCapabilityAdapter } from "../src/github-capability.ts";
import { LinearCapabilityAdapter } from "../src/linear-capability.ts";

const encode = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

test("GitHub adapter reconciles branch, file, and PR partial success by stable marker", async () => {
  let branchExists = false;
  let content: string | null = null;
  let pull: { id: number; number: number; html_url: string; body: string } | null = null;
  let ambiguousFile = true;
  let ambiguousPull = true;
  const calls: string[] = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    calls.push(`${init?.method ?? "GET"} ${path}`);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer installation-token");
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "base-sha" } });
    if (path.includes("/git/ref/heads/deos%2Fattempt-1")) {
      return branchExists ? Response.json({ object: { sha: "branch-sha" } }) : new Response("", { status: 404 });
    }
    if (path.endsWith("/git/refs") && init?.method === "POST") {
      branchExists = true;
      return Response.json({ ref: "refs/heads/deos/attempt-1" });
    }
    if (path.includes("/contents/src/example.ts?")) {
      return content === null ? new Response("", { status: 404 }) : Response.json({ sha: "file-sha", content: encode(content) });
    }
    if (path.endsWith("/contents/src/example.ts") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { content: string };
      content = new TextDecoder().decode(Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
      if (ambiguousFile) {
        ambiguousFile = false;
        throw new Error("file response lost");
      }
      return Response.json({ content: { sha: "file-sha" } });
    }
    if (path.includes("/pulls?state=open")) return Response.json(pull === null ? [] : [pull]);
    if (path.endsWith("/pulls") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { body: string };
      pull = { id: 21, number: 21, html_url: "https://github.com/sachinkundu/deos/pull/21", body: body.body };
      if (ambiguousPull) {
        ambiguousPull = false;
        throw new Error("pull response lost");
      }
      return Response.json(pull);
    }
    if (path.endsWith("/pulls/21") && init?.method === "PATCH") {
      if (pull === null) throw new Error("pull is missing");
      const body = JSON.parse(String(init.body)) as { body: string };
      pull = {
        id: pull.id,
        number: pull.number,
        html_url: pull.html_url,
        body: body.body,
      };
      return Response.json(pull);
    }
    return new Response("unexpected", { status: 500 });
  };
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: request },
  );
  const input = {
    repository: "sachinkundu/deos",
    branch: "deos/attempt-1",
    baseBranch: "main",
    title: "Work product",
    body: "Evidence",
    files: [{ path: "src/example.ts", content: "export const value = 1;\n" }],
  };
  const first = await adapter.publish(input, "operation-1");
  const second = await adapter.publish(input, "operation-1");
  const later = await adapter.publish(input, "operation-2");
  assert.equal(first.reconciled, true);
  assert.equal(second.reconciled, true);
  assert.equal(later.reconciled, true);
  assert.equal(first.pullRequestId, "21");
  assert.equal(later.pullRequestId, "21");
  assert.equal(content, "export const value = 1;\n");
  assert.equal(calls.filter((call) => call.startsWith("PUT ")).length, 1);
  assert.equal(calls.filter((call) => call.startsWith("POST ") && call.endsWith("/pulls")).length, 1);
  assert.equal(calls.filter((call) => call.startsWith("PATCH ") && call.endsWith("/pulls/21")).length, 1);
  const finalPull = pull as { body: string } | null;
  assert.match(finalPull?.body ?? "", /deos-operation:operation-1/);
  assert.match(finalPull?.body ?? "", /deos-operation:operation-2/);
});

test("GitHub planning adapter replaces one scoped manifest on one ready pull request", async () => {
  const branchName = "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa";
  let branchExists = false;
  let headSha = "base-sha";
  let sequence = 0;
  const files = new Map<string, { content: string; sha: string }>();
  let pull: {
    id: number;
    number: number;
    html_url: string;
    state: string;
    draft: boolean;
    merged: boolean;
    merge_commit_sha: null;
    title: string;
    body: string;
    head: { ref: string; sha: string };
    base: { ref: string };
  } | null = null;
  const calls: Array<{ method: string; path: string; body: Record<string, unknown> | null }> = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const path = `${url.pathname}${url.search}`;
    const body = init?.body === undefined ? null : JSON.parse(String(init.body)) as Record<string, unknown>;
    calls.push({ method, path, body });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "base-sha" } });
    if (path.includes("/git/ref/heads/deos%2Fplanning%2Faaaaaaaaaaaaaaaaaaaaaaaa")) {
      return branchExists
        ? Response.json({ object: { sha: headSha } })
        : new Response("", { status: 404 });
    }
    if (path.endsWith("/git/refs") && method === "POST") {
      branchExists = true;
      return Response.json({ ref: `refs/heads/${branchName}` });
    }
    if (path.includes("/git/trees/") && path.endsWith("?recursive=1")) {
      return Response.json({
        tree: [...files].map(([filePath, file]) => ({
          path: filePath,
          type: "blob",
          sha: file.sha,
        })),
      });
    }
    if (path.includes("/contents/") && method === "GET") {
      const encodedPath = path.split("/contents/")[1].split("?")[0];
      const filePath = encodedPath.split("/").map(decodeURIComponent).join("/");
      const file = files.get(filePath);
      return file === undefined
        ? new Response("", { status: 404 })
        : Response.json({ sha: file.sha, content: encode(file.content) });
    }
    if (path.includes("/contents/") && method === "PUT") {
      const encodedPath = path.split("/contents/")[1];
      const filePath = encodedPath.split("/").map(decodeURIComponent).join("/");
      const content = new TextDecoder().decode(
        Uint8Array.from(atob(String(body?.content)), (character) => character.charCodeAt(0)),
      );
      sequence += 1;
      files.set(filePath, { content, sha: `file-${sequence}` });
      headSha = `head-${sequence}`;
      return Response.json({ content: { sha: `file-${sequence}` } });
    }
    if (path.includes("/contents/") && method === "DELETE") {
      const encodedPath = path.split("/contents/")[1];
      const filePath = encodedPath.split("/").map(decodeURIComponent).join("/");
      files.delete(filePath);
      sequence += 1;
      headSha = `head-${sequence}`;
      return Response.json({ commit: { sha: headSha } });
    }
    if (path.includes("/pulls?state=open")) {
      return Response.json(pull === null ? [] : [{ number: pull.number }]);
    }
    if (path.endsWith("/pulls") && method === "POST") {
      assert.equal(body?.draft, false);
      pull = {
        id: 9001,
        number: 54,
        html_url: "https://github.com/sachinkundu/deos/pull/54",
        state: "open",
        draft: false,
        merged: false,
        merge_commit_sha: null,
        title: String(body?.title),
        body: String(body?.body),
        head: { ref: branchName, sha: headSha },
        base: { ref: "main" },
      };
      return Response.json({ number: 54 });
    }
    if (path.endsWith("/pulls/54") && method === "PATCH") {
      if (pull === null) throw new Error("pull missing");
      pull.title = String(body?.title);
      pull.body = String(body?.body);
      return Response.json({ number: 54 });
    }
    if (path.endsWith("/pulls/54") && method === "GET") {
      if (pull === null) throw new Error("pull missing");
      pull.head.sha = headSha;
      return Response.json(pull);
    }
    return new Response(`unexpected ${method} ${path}`, { status: 500 });
  };
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: request },
  );
  const prefix = "openspec/changes/sac-200/";
  const firstFiles = [
    ".openspec.yaml", "proposal.md", "specs/old/spec.md",
  ].map((path) => ({ path: `${prefix}${path}`, content: `${path}\n` }));
  const first = await adapter.publishPlanning({
    repository: "sachinkundu/deos",
    branch: branchName,
    baseBranch: "main",
    change: "sac-200",
    title: "SAC-200: OpenSpec plan",
    body: "first body",
    files: firstFiles,
  }, "operation-1");
  const revisedFiles = firstFiles
    .filter((file) => !file.path.endsWith("specs/old/spec.md"))
    .concat({ path: `${prefix}specs/new/spec.md`, content: "new spec\n" });
  const revised = await adapter.publishPlanning({
    repository: "sachinkundu/deos",
    branch: branchName,
    baseBranch: "main",
    change: "sac-200",
    title: "SAC-200: OpenSpec plan",
    body: "revised body",
    files: revisedFiles,
  }, "operation-2");
  assert.equal(first.pullRequestDatabaseId, "9001");
  assert.equal(first.pullRequestNumber, 54);
  assert.equal(revised.pullRequestNumber, 54);
  assert.equal(revised.branch, branchName);
  assert.equal(files.has(`${prefix}specs/old/spec.md`), false);
  assert.equal(files.get(`${prefix}specs/new/spec.md`)?.content, "new spec\n");
  assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/pulls")).length, 1);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 1);
  assert.equal((pull as { draft?: boolean } | null)?.draft, false);
});

test("GitHub planning merge uses expected head SHA and reconciles a lost response", async () => {
  let merged = false;
  let mergeCalls = 0;
  const pull = () => ({
    id: 9001,
    number: 54,
    html_url: "https://github.com/sachinkundu/deos/pull/54",
    state: merged ? "closed" : "open",
    draft: false,
    merged,
    merge_commit_sha: merged ? "merge-sha" : null,
    head: { ref: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa", sha: "head-sha" },
    base: { ref: "main" },
  });
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    {
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/pulls/54") && (init?.method ?? "GET") === "GET") {
          return Response.json(pull());
        }
        if (path.endsWith("/pulls/54/merge") && init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as { sha?: string };
          assert.equal(body.sha, "head-sha");
          mergeCalls += 1;
          merged = true;
          throw new Error("merge response lost");
        }
        return new Response("unexpected", { status: 500 });
      },
    },
  );
  const receipt = await adapter.mergePlanning({
    repository: "sachinkundu/deos",
    pullRequestNumber: 54,
    pullRequestDatabaseId: "9001",
    baseBranch: "main",
    headBranch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
    expectedHeadSha: "head-sha",
  });
  assert.equal(receipt.mergeCommitSha, "merge-sha");
  assert.equal(receipt.reconciled, true);
  assert.equal(mergeCalls, 1);
});

test("Linear note adapter reconciles an ambiguous create without any state mutation", async () => {
  const comments: Array<{ id: string; body: string }> = [];
  let ambiguous = true;
  const queries: string[] = [];
  const request: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string; variables: { body?: string } };
    queries.push(body.query);
    assert.equal(body.query.includes("issueUpdate"), false);
    if (body.query.includes("query DeosIssueComments")) {
      return Response.json({ data: { issue: { comments: { nodes: comments } } } });
    }
    comments.push({ id: "comment-7", body: body.variables.body ?? "" });
    if (ambiguous) {
      ambiguous = false;
      throw new Error("comment response lost");
    }
    return Response.json({ data: { commentCreate: { success: true, comment: { id: "comment-7" } } } });
  };
  const adapter = new LinearCapabilityAdapter(
    "https://api.linear.test/graphql",
    "linear-access-token",
    { fetch: request },
  );
  const first = await adapter.upsertNote({ issueId: "issue-1", body: "Working note" }, "operation-7");
  const second = await adapter.upsertNote({ issueId: "issue-1", body: "Working note" }, "operation-7");
  assert.deepEqual(first, { commentId: "comment-7", reconciled: true });
  assert.deepEqual(second, { commentId: "comment-7", reconciled: true });
  assert.equal(comments.length, 1);
  assert.equal(queries.some((query) => query.includes("stateId")), false);
});
