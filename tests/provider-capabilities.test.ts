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
  let pull: { id: number; html_url: string; body: string } | null = null;
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
      pull = { id: 21, html_url: "https://github.com/sachinkundu/deos/pull/21", body: body.body };
      if (ambiguousPull) {
        ambiguousPull = false;
        throw new Error("pull response lost");
      }
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
  assert.equal(first.reconciled, true);
  assert.equal(second.reconciled, true);
  assert.equal(first.pullRequestId, "21");
  assert.equal(content, "export const value = 1;\n");
  assert.equal(calls.filter((call) => call.startsWith("PUT ")).length, 1);
  assert.equal(calls.filter((call) => call.startsWith("POST ") && call.endsWith("/pulls")).length, 1);
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
