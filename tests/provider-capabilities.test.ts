import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubCapabilityAdapter,
  GitHubReviewFeedbackChangedError,
} from "../src/github-capability.ts";
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
    { token: async () => "installation-token", actorLogin: async () => "deos-app[bot]" },
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
  const reviewComments: Array<{
    id: number;
    in_reply_to_id?: number;
    body: string;
    user: { type: string; login: string };
  }> = [];
  let reviewReplySequence = 500;
  let ambiguousReviewReply = true;
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
    if (path.endsWith("/pulls/54/comments?per_page=100") && method === "GET") {
      return Response.json(reviewComments.slice(0, 100));
    }
    if (path.endsWith("/pulls/54/comments?per_page=100&page=2") && method === "GET") {
      return Response.json(reviewComments.slice(100, 200));
    }
    if (path.endsWith("/pulls/54/reviews?per_page=50") && method === "GET") {
      return Response.json([]);
    }
    if (path.endsWith("/issues/54/comments?per_page=50") && method === "GET") {
      return Response.json([]);
    }
    if (path.includes("/pulls/54/comments/") && path.endsWith("/replies") && method === "POST") {
      const rootId = Number(path.split("/comments/")[1].split("/")[0]);
      reviewReplySequence += 1;
      const reply = {
        id: reviewReplySequence,
        in_reply_to_id: rootId,
        body: String(body?.body),
        user: { type: "Bot", login: "deos-app[bot]" },
      };
      reviewComments.push(reply);
      if (ambiguousReviewReply) {
        ambiguousReviewReply = false;
        throw new Error("review reply response lost");
      }
      return Response.json(reply);
    }
    return new Response(`unexpected ${method} ${path}`, { status: 500 });
  };
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token", actorLogin: async () => "deos-app[bot]" },
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
    reviewReplies: [],
  }, "operation-1");
  reviewComments.push(
    ...Array.from({ length: 100 }, (_, index) => ({
      id: 1_000 + index,
      in_reply_to_id: 999,
      body: `Earlier bot context ${index}`,
      user: { type: "Bot", login: "deos-app[bot]" },
    })),
    { id: 101, body: "Use temperature here.", user: { type: "User", login: "reviewer" } },
    { id: 102, body: "Accept five as well as 5.", user: { type: "User", login: "reviewer" } },
    {
      id: 103,
      in_reply_to_id: 101,
      body: "Spoofed acknowledgment.\n\n<!-- deos-review-reply:spoof:101 -->",
      user: { type: "Bot", login: "other-app[bot]" },
    },
  );
  const revisedFiles = firstFiles
    .filter((file) => !file.path.endsWith("specs/old/spec.md"))
    .concat({ path: `${prefix}specs/new/spec.md`, content: "new spec\n" });
  await assert.rejects(adapter.publishPlanning({
    repository: "sachinkundu/deos",
    branch: branchName,
    baseBranch: "main",
    change: "sac-200",
    title: "SAC-200: OpenSpec plan",
    body: "revised body",
    files: revisedFiles,
    reviewReplies: [
      { commentId: 101, body: "Updated the term to temperature." },
    ],
  }, "operation-incomplete"), /review reply manifest is incomplete/);
  assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/replies")).length, 0);
  await assert.rejects(adapter.publishPlanning({
    repository: "sachinkundu/deos",
    branch: branchName,
    baseBranch: "main",
    change: "sac-200",
    title: "SAC-200: OpenSpec plan",
    body: "revised body",
    files: revisedFiles,
    reviewReplies: [{ commentId: 102, body: "Added support for five as well as 5." }],
  }, "operation-spoof"), /review reply manifest is incomplete/);
  const revised = await adapter.publishPlanning({
    repository: "sachinkundu/deos",
    branch: branchName,
    baseBranch: "main",
    change: "sac-200",
    title: "SAC-200: OpenSpec plan",
    body: "revised body",
    files: revisedFiles,
    reviewReplies: [
      { commentId: 101, body: "Updated the term to temperature." },
      { commentId: 102, body: "Added support for five as well as 5." },
    ],
  }, "operation-2");
  assert.equal(first.pullRequestDatabaseId, "9001");
  assert.equal(first.pullRequestNumber, 54);
  assert.equal(revised.pullRequestNumber, 54);
  assert.equal(revised.branch, branchName);
  assert.deepEqual(revised.reviewReplyIds, [501, 502]);
  assert.equal(files.has(`${prefix}specs/old/spec.md`), false);
  assert.equal(files.get(`${prefix}specs/new/spec.md`)?.content, "new spec\n");
  assert.equal(calls.filter((call) => call.method === "POST" && call.path.endsWith("/pulls")).length, 1);
  assert.equal(calls.filter((call) => call.method === "DELETE").length, 1);
  assert.equal((pull as { draft?: boolean } | null)?.draft, false);
  const postedReplies = calls.filter((call) => call.method === "POST" && call.path.endsWith("/replies"));
  assert.equal(postedReplies.length, 2);
  assert.match(String(postedReplies[0].body?.body), /Updated the term to temperature/);
  assert.match(String(postedReplies[0].body?.body), /deos-review-reply:operation-2:101/);
  assert.equal(calls.some((call) => call.path.includes("resolve")), false);
  const feedback = await adapter.readReviewFeedback("sachinkundu/deos", 54);
  assert.deepEqual(feedback.find((entry) => entry.id === 101), {
    kind: "review_comment",
    id: 101,
    body: "Use temperature here.",
    state: undefined,
    path: undefined,
    line: undefined,
    author: "reviewer",
    authorType: "User",
    trustedAcknowledgmentAuthor: false,
    replyToId: null,
    createdAt: undefined,
    updatedAt: undefined,
  });
});

test("GitHub design publication rejects an existing branch with out-of-scope changes", async () => {
  const baseCommit = "a".repeat(40);
  const headCommit = "b".repeat(40);
  let writes = 0;
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/git/ref/heads/deos%2Fdesign%2Fsac-200")) {
        return Response.json({ object: { sha: headCommit } });
      }
      if (path.includes(`/compare/${baseCommit}...${headCommit}`)) {
        return Response.json({
          status: "ahead",
          base_commit: { sha: baseCommit },
          merge_base_commit: { sha: baseCommit },
          files: [
            { filename: "openspec/changes/sac-200/design.md" },
            { filename: "src/unrelated.ts" },
          ],
        });
      }
      if (init?.method === "PUT") writes += 1;
      return new Response("unexpected", { status: 500 });
    } },
  );
  await assert.rejects(adapter.publishDesign({
    repository: "acme/sample",
    branch: "deos/design/sac-200",
    baseBranch: "main",
    baseCommit,
    change: "sac-200",
    title: "SAC-200: OpenSpec design",
    body: "Design only",
    content: "## Design\n",
    reviewReplies: [],
  }, "operation-design"), /design branch contains out-of-scope changes/);
  assert.equal(writes, 0);
});

test("GitHub design publication reconciles an accepted metadata update with a lost response", async () => {
  const baseCommit = "a".repeat(40);
  const headCommit = "b".repeat(40);
  const branch = "deos/design/sac-201";
  const designPath = "openspec/changes/sac-201/design.md";
  const designContent = "## Design\n";
  let title = "Old title";
  let body = "Old body";
  let patchCalls = 0;
  const pull = () => ({
    id: 7001,
    number: 7,
    html_url: "https://github.com/acme/sample/pull/7",
    state: "open",
    draft: false,
    merged: false,
    merge_commit_sha: null,
    title,
    body,
    head: { ref: branch, sha: headCommit },
    base: { ref: "main" },
  });
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input, init) => {
      const url = new URL(String(input));
      const path = `${url.pathname}${url.search}`;
      const method = init?.method ?? "GET";
      if (path.includes("/git/ref/heads/deos%2Fdesign%2Fsac-201")) {
        return Response.json({ object: { sha: headCommit } });
      }
      if (path.includes(`/compare/${baseCommit}...${headCommit}`)) {
        return Response.json({
          status: "ahead",
          base_commit: { sha: baseCommit },
          merge_base_commit: { sha: baseCommit },
          files: [{ filename: designPath }],
        });
      }
      if (path.includes(`/contents/${designPath}`)) {
        return Response.json({ sha: "design-sha", content: encode(designContent) });
      }
      if (path.endsWith("/pulls/7") && method === "PATCH") {
        const payload = JSON.parse(String(init?.body)) as { title: string; body: string };
        title = payload.title;
        body = payload.body;
        patchCalls += 1;
        throw new Error("metadata response lost");
      }
      if (path.endsWith("/pulls/7") && method === "GET") return Response.json(pull());
      if (path.endsWith("/pulls/7/comments?per_page=100")) return Response.json([]);
      return new Response(`unexpected ${method} ${path}`, { status: 500 });
    } },
  );

  const receipt = await adapter.publishDesign({
    repository: "acme/sample",
    branch,
    baseBranch: "main",
    baseCommit,
    change: "sac-201",
    title: "SAC-201: OpenSpec design",
    body: "Reviewed design",
    content: designContent,
    reviewReplies: [],
    expectedPullRequestDatabaseId: "7001",
    expectedPullRequestNumber: 7,
  }, "operation-design");
  assert.equal(receipt.reconciled, true);
  assert.equal(receipt.pullRequestNumber, 7);
  assert.equal(patchCalls, 1);
  assert.equal(title, "SAC-201: OpenSpec design");
  assert.equal(body, "Reviewed design");
});

test("GitHub design publication makes a lost final read reconcilable", async () => {
  const baseCommit = "a".repeat(40);
  const headCommit = "b".repeat(40);
  const branch = "deos/design/sac-201-final-read";
  const designPath = "openspec/changes/sac-201/design.md";
  const designContent = "## Design\n";
  let pullReads = 0;
  let loseFinalRead = true;
  let reviewComments: unknown[] = [];
  const pull = {
    id: 7001,
    number: 7,
    html_url: "https://github.com/acme/sample/pull/7",
    state: "open",
    draft: false,
    merged: false,
    merge_commit_sha: null,
    title: "SAC-201: OpenSpec design",
    body: "Reviewed design",
    head: { ref: branch, sha: headCommit },
    base: { ref: "main" },
  };
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token", actorLogin: async () => "deos[bot]" },
    { fetch: async (input, init) => {
      const url = new URL(String(input));
      const path = `${url.pathname}${url.search}`;
      const method = init?.method ?? "GET";
      if (path.includes("/git/ref/heads/deos%2Fdesign%2Fsac-201-final-read")) {
        return Response.json({ object: { sha: headCommit } });
      }
      if (path.includes(`/compare/${baseCommit}...${headCommit}`)) {
        return Response.json({
          status: "ahead",
          base_commit: { sha: baseCommit },
          merge_base_commit: { sha: baseCommit },
          files: [{ filename: designPath }],
        });
      }
      if (path.includes(`/contents/${designPath}`)) {
        return Response.json({ sha: "design-sha", content: encode(designContent) });
      }
      if (path.endsWith("/pulls/7") && method === "GET") {
        pullReads += 1;
        if (loseFinalRead && pullReads === 3) {
          loseFinalRead = false;
          throw new Error("fetch failed");
        }
        return Response.json(pull);
      }
      if (path.includes("/pulls?state=all&head=")) return Response.json([{ number: 7 }]);
      if (path.endsWith("/pulls/7/comments?per_page=100")) return Response.json(reviewComments);
      return new Response(`unexpected ${method} ${path}`, { status: 500 });
    } },
  );
  const request = {
    repository: "acme/sample",
    branch,
    baseBranch: "main" as const,
    baseCommit,
    change: "sac-201",
    title: "SAC-201: OpenSpec design",
    body: "Reviewed design",
    content: designContent,
    reviewReplies: [],
    expectedPullRequestDatabaseId: "7001",
    expectedPullRequestNumber: 7,
  };

  await assert.rejects(adapter.publishDesign(request, "operation-final-read"), /provider request failed/);
  const receipt = await adapter.publishDesign(request, "operation-final-read");
  assert.equal(receipt.pullRequestNumber, 7);
  assert.equal(receipt.reconciled, true);

  reviewComments = [{
    id: 701,
    in_reply_to_id: null,
    body: "Please cover the retry path.",
    user: { type: "User", login: "reviewer" },
  }];
  const {
    expectedPullRequestDatabaseId: _databaseId,
    expectedPullRequestNumber: _number,
    ...unrecordedRequest
  } = request;
  await assert.rejects(
    adapter.publishDesign(unrecordedRequest, "operation-feedback-changed"),
    (error: unknown) => error instanceof GitHubReviewFeedbackChangedError &&
      error.receipt.pullRequestDatabaseId === "7001" && error.receipt.pullRequestNumber === 7 &&
      error.receipt.headSha === headCommit,
  );
});

test("GitHub design publication discovers its head across bases and rejects a retargeted pull request", async () => {
  const baseCommit = "a".repeat(40);
  const headCommit = "b".repeat(40);
  const branch = "deos/design/sac-202";
  const designPath = "openspec/changes/sac-202/design.md";
  const designContent = "## Design\n";
  let pullWrites = 0;
  let discoveryPath = "";
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input, init) => {
      const url = new URL(String(input));
      const path = `${url.pathname}${url.search}`;
      const method = init?.method ?? "GET";
      if (path.includes("/git/ref/heads/deos%2Fdesign%2Fsac-202")) {
        return Response.json({ object: { sha: headCommit } });
      }
      if (path.includes(`/compare/${baseCommit}...${headCommit}`)) {
        return Response.json({
          status: "ahead",
          base_commit: { sha: baseCommit },
          merge_base_commit: { sha: baseCommit },
          files: [{ filename: designPath }],
        });
      }
      if (path.includes(`/contents/${designPath}`)) {
        return Response.json({ sha: "design-sha", content: encode(designContent) });
      }
      if (path.includes("/pulls?state=all")) {
        discoveryPath = path;
        return Response.json([{ number: 8 }]);
      }
      if (path.endsWith("/pulls/8") && method === "GET") {
        return Response.json({
          id: 8001,
          number: 8,
          html_url: "https://github.com/acme/sample/pull/8",
          state: "closed",
          draft: false,
          merged: false,
          merge_commit_sha: null,
          title: "SAC-202: OpenSpec design",
          body: "Reviewed design",
          head: { ref: branch, sha: headCommit },
          base: { ref: "release" },
        });
      }
      if (path.endsWith("/pulls") || (path.endsWith("/pulls/8") && method === "PATCH")) pullWrites += 1;
      return new Response(`unexpected ${method} ${path}`, { status: 500 });
    } },
  );

  await assert.rejects(adapter.publishDesign({
    repository: "acme/sample",
    branch,
    baseBranch: "main",
    baseCommit,
    change: "sac-202",
    title: "SAC-202: OpenSpec design",
    body: "Reviewed design",
    content: designContent,
    reviewReplies: [],
  }, "operation-design"), /discovered design pull-request identity mismatch/);
  assert.match(discoveryPath, /state=all&head=/);
  assert.doesNotMatch(discoveryPath, /[?&]base=/);
  assert.equal(pullWrites, 0);
});

test("GitHub repository guidance rejects an allowlisted symlink before reading its target", async () => {
  let contentReads = 0;
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/git/trees/")) {
        return Response.json({
          tree: [{ path: "AGENTS.md", type: "blob", mode: "120000" }],
        });
      }
      if (path.includes("/contents/")) contentReads += 1;
      return new Response("unexpected", { status: 500 });
    } },
  );

  await assert.rejects(
    adapter.readRepositoryGuidance("acme/sample", "a".repeat(40)),
    /unsafe file type/,
  );
  assert.equal(contentReads, 0);
});

test("GitHub repository guidance rejects malformed UTF-8", async () => {
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.includes("/git/trees/")) {
        return Response.json({
          tree: [{ path: "AGENTS.md", type: "blob", mode: "100644" }],
        });
      }
      if (path.includes("/contents/AGENTS.md")) {
        return Response.json({ sha: "guidance-sha", content: btoa(String.fromCharCode(0xc3, 0x28)) });
      }
      return new Response("unexpected", { status: 500 });
    } },
  );

  await assert.rejects(
    adapter.readRepositoryGuidance("acme/sample", "a".repeat(40)),
    /not valid UTF-8/,
  );
});

test("GitHub design merge reconciles lost mutation and final-read responses", async () => {
  let merged = false;
  let mergeCalls = 0;
  let loseFinalRead = true;
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
          if (merged && loseFinalRead) {
            loseFinalRead = false;
            throw new Error("fetch failed");
          }
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
  const request = {
    repository: "sachinkundu/deos",
    pullRequestNumber: 54,
    pullRequestDatabaseId: "9001",
    baseBranch: "main" as const,
    headBranch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
    expectedHeadSha: "head-sha",
  };
  await assert.rejects(adapter.mergeDesign(request), /provider request failed/);
  const receipt = await adapter.mergeDesign(request);
  assert.equal(receipt.mergeCommitSha, "merge-sha");
  assert.equal(receipt.reconciled, true);
  assert.equal(mergeCalls, 1);
});

test("GitHub design merge distinguishes a rejection response from a server failure", async () => {
  let mergeCalls = 0;
  let mergeStatus = 409;
  const pull = {
    id: 9001,
    number: 54,
    html_url: "https://github.com/sachinkundu/deos/pull/54",
    state: "open",
    draft: false,
    merged: false,
    merge_commit_sha: null,
    head: { ref: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa", sha: "head-sha" },
    base: { ref: "main" },
  };
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    {
      fetch: async (input, init) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith("/pulls/54") && (init?.method ?? "GET") === "GET") {
          return Response.json(pull);
        }
        if (path.endsWith("/pulls/54/merge") && init?.method === "PUT") {
          mergeCalls += 1;
          return Response.json({ message: "Merge failed" }, { status: mergeStatus });
        }
        return new Response("unexpected", { status: 500 });
      },
    },
  );

  await assert.rejects(adapter.mergeDesign({
    repository: "sachinkundu/deos",
    pullRequestNumber: 54,
    pullRequestDatabaseId: "9001",
    baseBranch: "main",
    headBranch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
    expectedHeadSha: "head-sha",
  }), /merge was rejected/);
  mergeStatus = 500;
  await assert.rejects(adapter.mergeDesign({
    repository: "sachinkundu/deos",
    pullRequestNumber: 54,
    pullRequestDatabaseId: "9001",
    baseBranch: "main",
    headBranch: "deos/planning/aaaaaaaaaaaaaaaaaaaaaaaa",
    expectedHeadSha: "head-sha",
  }), /merge response is ambiguous/);
  assert.equal(mergeCalls, 2);
});

test("GitHub trace review check is exact-head, stable, and read back", async () => {
  const calls: Array<{ method: string; path: string }> = [];
  let created = false;
  const adapter = new GitHubCapabilityAdapter(
    "https://api.github.test",
    { token: async () => "installation-token" },
    { fetch: async (input, init) => {
      const url = new URL(String(input));
      const method = init?.method ?? "GET";
      const path = `${url.pathname}${url.search}`;
      calls.push({ method, path });
      if (path.includes("/commits/head-sha/check-runs")) {
        return Response.json({ check_runs: created ? [{ id: 77, external_id: "review:stable" }] : [] });
      }
      if (path.endsWith("/check-runs") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.equal(body.head_sha, "head-sha");
        assert.equal(body.external_id, "review:stable");
        created = true;
        return Response.json({ id: 77 });
      }
      if (path.endsWith("/check-runs/77") && method === "GET") {
        return Response.json({
          id: 77,
          external_id: "review:stable",
          head_sha: "head-sha",
          details_url: "https://portal.example/review",
          conclusion: "success",
          html_url: "https://github.test/check/77",
        });
      }
      return new Response(`unexpected ${method} ${path}`, { status: 500 });
    } },
  );
  const receipt = await adapter.upsertTraceReviewCheck({
    repository: "sachinkundu/deos",
    headSha: "head-sha",
    externalId: "review:stable",
    detailsUrl: "https://portal.example/review",
    title: "Traceability passed",
    summary: "No open findings.",
    conclusion: "success",
  });
  assert.deepEqual(receipt, {
    checkRunId: "77",
    url: "https://github.test/check/77",
    reconciled: false,
  });
  assert.equal(calls.filter((call) => call.method === "POST").length, 1);
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

test("Linear trace status updates one marked comment in place", async () => {
  const comments: Array<{ id: string; body: string }> = [];
  let creates = 0;
  let updates = 0;
  const adapter = new LinearCapabilityAdapter(
    "https://api.linear.test/graphql",
    "linear-access-token",
    { fetch: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        query: string;
        variables: { body?: string; id?: string };
      };
      if (request.query.includes("query DeosIssueComments")) {
        return Response.json({ data: { issue: { comments: { nodes: comments } } } });
      }
      if (request.query.includes("commentCreate")) {
        creates += 1;
        comments.push({ id: "comment-status", body: request.variables.body ?? "" });
        return Response.json({ data: { commentCreate: { success: true, comment: { id: "comment-status" } } } });
      }
      if (request.query.includes("commentUpdate")) {
        updates += 1;
        assert.equal(request.variables.id, "comment-status");
        comments[0] = { id: "comment-status", body: request.variables.body ?? "" };
        return Response.json({ data: { commentUpdate: { success: true, comment: { id: "comment-status" } } } });
      }
      return new Response("unexpected", { status: 500 });
    } },
  );
  await adapter.upsertStatus({ issueId: "issue-1", markerId: "trace-review:run-1234", body: "Review has findings." });
  await adapter.upsertStatus({ issueId: "issue-1", markerId: "trace-review:run-1234", body: "Review passed." });
  const replay = await adapter.upsertStatus({
    issueId: "issue-1",
    markerId: "trace-review:run-1234",
    body: "Review passed.",
  });
  assert.equal(creates, 1);
  assert.equal(updates, 1);
  assert.equal(comments.length, 1);
  assert.match(comments[0]?.body ?? "", /Review passed/);
  assert.equal(replay.reconciled, true);
});
