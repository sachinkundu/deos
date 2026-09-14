import assert from "node:assert/strict";
import test from "node:test";

import { publishBatchReview } from "../worker/github-api.js";
import { continuationAction, publishContinuation } from "../worker/review-continuation.js";

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

test("permits and receipts every reply before advancing to the review bundle through an injected transport", async () => {
  const headSha = "a".repeat(40);
  const calls = [];
  const providerRequest = async (url, options = {}) => {
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
  }, providerRequest);

  assert.deepEqual(order, [
    "permit:reply:reply-one", "receipt:reply:reply-one",
    "permit:reply:reply-two", "receipt:reply:reply-two",
    "permit:review_bundle", "receipt:review_bundle",
  ]);
  assert.equal(result.replies.length, 2);
  assert.equal(result.review.id, 201);
  assert.equal(calls.filter((call) => call.startsWith("POST ")).length, 3);
});


test("retry action revalidates GitHub identity and calls only the Linear retry RPC", async () => {
  const calls = [];
  const status = { reviewId: "review-1", github: { complete: true }, linear: { status: "not_started" } };
  const providerRequest = async (url) => {
    assert.equal(new URL(url).pathname, "/user");
    calls.push("github:user");
    return json({ id: 42, login: "reviewer" });
  };
  const env = {
    REVIEW_CONTINUATION_SECRET: "s".repeat(32),
    GITHUB_REQUEST: providerRequest,
    DEOS_REVIEW_CONTINUATION: {
      async retryLinear(assertion, body) {
        calls.push("deos:retry-linear");
        assert.equal(assertion.githubUserId, 42);
        assert.equal(assertion.accessAccount, "reviewer@example.com");
        assert.deepEqual(body, { reviewId: "review-1" });
        return status;
      },
    },
  };
  assert.equal(await continuationAction("token", "reviewer@example.com", env, { action: "retry", reviewId: "review-1" }), status);
  assert.deepEqual(calls, ["github:user", "deos:retry-linear"]);
});


test("a clear GitHub rejection is durably classified before the task step can start", async () => {
  const headSha = "a".repeat(40);
  const calls = [];
  const providerRequest = async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || "GET";
    if (path === "/user") return json({ id: 42, login: "reviewer" });
    if (method === "GET" && path.endsWith("/pulls/7")) return json({ number: 7, state: "open", merged: false, head: { sha: headSha }, base: { sha: "b".repeat(40) }, user: { login: "other-author" } });
    if (method === "GET" && path.endsWith("/pulls/7/files")) return json([]);
    if (method === "GET" && path.endsWith("/pulls/7/comments")) return json([]);
    if (method === "POST" && path.endsWith("/pulls/7/reviews")) return json({ message: "Review could not be submitted" }, 422);
    return json({ message: `unexpected ${method} ${path}` }, 500);
  };
  const env = {
    REVIEW_CONTINUATION_SECRET: "s".repeat(32),
    GITHUB_REQUEST: providerRequest,
    DEOS_REVIEW_CONTINUATION: {
      async prepareReview() { calls.push("prepare"); return { github: { complete: false } }; },
      async requestPermit(_assertion, body) { calls.push("permit"); assert.equal(body.step, "github"); return { permitId: "permit-1" }; },
      async failGitHubPart(_assertion, body) {
        calls.push("failed");
        assert.equal(body.outcome, "clearly_rejected");
        assert.equal(body.publicCode, "github_rejected");
        assert.match(body.providerMessage, /Review could not be submitted/);
        return { github: { status: "failed_retryable" }, linear: { status: "not_started" } };
      },
    },
  };
  await assert.rejects(() => publishContinuation("token", "reviewer@example.com", env, {
    reviewId: "01995d63-5e00-7000-8000-000000000009",
    prUrl: "https://github.com/acme/repo/pull/7",
    headSha,
    event: "APPROVE",
    reviewBody: "Ready",
    comments: [],
    continuation: { runId: "run-1", issueId: "issue-1", repository: "acme/repo", pullRequestNumber: 7, gateVisitSequence: 1, accountPolicyVersion: 1 },
  }), /GitHub review publication failed: Review could not be submitted/);
  assert.deepEqual(calls, ["prepare", "permit", "failed"]);
});
