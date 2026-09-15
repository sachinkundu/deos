import assert from "node:assert/strict";
import test from "node:test";

import { publishBatchReview } from "../worker/github-api.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

test("permits and receipts every reply before advancing to the review bundle", async (context) => {
  const originalFetch = globalThis.fetch;
  const headSha = "a".repeat(40);
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || "GET";
    calls.push(`${method} ${path}`);
    if (method === "GET" && path === "/repos/acme/repo/pulls/7") return json({
      number: 7,
      state: "open",
      merged: false,
      head: { sha: headSha },
      base: { sha: "b".repeat(40) },
      user: { login: "author" },
    });
    if (method === "GET" && path === "/repos/acme/repo/pulls/7/files") return json([]);
    if (method === "GET" && path === "/repos/acme/repo/pulls/7/comments") return json([
      { id: 10, body: "parent one" },
      { id: 20, body: "parent two" },
    ]);
    if (method === "POST" && path.endsWith("/comments/10/replies")) return json({
      id: 101,
      html_url: "https://github.com/acme/repo/pull/7#discussion_r101",
      commit_id: headSha,
      user: { id: 42 },
    }, 201);
    if (method === "POST" && path.endsWith("/comments/20/replies")) return json({
      id: 102,
      html_url: "https://github.com/acme/repo/pull/7#discussion_r102",
      commit_id: headSha,
      user: { id: 42 },
    }, 201);
    if (method === "POST" && path.endsWith("/reviews")) return json({
      id: 201,
      html_url: "https://github.com/acme/repo/pull/7#pullrequestreview-201",
      commit_id: headSha,
      user: { id: 42 },
    });
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const order = [];
  const result = await publishBatchReview("token", {
    prUrl: "https://github.com/acme/repo/pull/7",
    headSha,
    reviewId: "01995d63-5e00-7000-8000-000000000001",
    event: "COMMENT",
    comments: [
      { kind: "reply", clientSubmissionId: "reply-one", commentId: 10, path: "README.md", body: "First" },
      { kind: "reply", clientSubmissionId: "reply-two", commentId: 20, path: "README.md", body: "Second" },
    ],
    beforePart: async ({ partId }) => { order.push(`permit:${partId}`); return { permitId: partId }; },
    afterPart: async ({ partId, permit }) => { order.push(`receipt:${permit.permitId}`); assert.equal(partId, permit.permitId); },
  });

  assert.deepEqual(order, [
    "permit:reply:reply-one", "receipt:reply:reply-one",
    "permit:reply:reply-two", "receipt:reply:reply-two",
    "permit:review_bundle", "receipt:review_bundle",
  ]);
  assert.equal(result.replies.length, 2);
  assert.equal(result.review.id, 201);
  assert.equal(calls.filter((call) => call.startsWith("POST ")).length, 3);
});
