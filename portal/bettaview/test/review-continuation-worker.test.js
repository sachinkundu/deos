import assert from "node:assert/strict";
import test from "node:test";

import { publishBatchReview } from "../worker/github-api.js";
import { continuationAction, continuationStatus, publishContinuation } from "../worker/review-continuation.js";

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

test("lease continuation uses its trusted call without a signing secret or live RPC", async () => {
  const calls = [];
  const status = { reviewId: "review-1", github: { complete: true } };
  const env = {
    GITHUB_REQUEST: async (url) => {
      assert.equal(url, "https://api.github.com/user");
      return json({ id: 42, login: "reviewer" });
    },
    TEST_REVIEW_CONTINUATION_CALL: async (method, body, identity) => {
      calls.push({ method, body, identity });
      return status;
    },
  };
  assert.equal(await continuationAction("lease-session", "reviewer@example.com", env,
    { action: "retry", reviewId: "review-1" }), status);
  assert.equal(await continuationStatus(env, "review-1"), status);
  assert.deepEqual(calls, [
    { method: "retryLinear", body: { reviewId: "review-1" },
      identity: { accessAccount: "reviewer@example.com", githubUserId: 42 } },
    { method: "status", body: { reviewId: "review-1" }, identity: null },
  ]);
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
      async prepareReview() { calls.push("prepare"); return { outcome:'active',github: { complete: false } }; },
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


for(const listing of ["rate_limited","incomplete"])
test(`lost reply plus ${listing} receipt read records an unclear result with both original errors`, async () => {
  const headSha="a".repeat(40), calls=[], writes=[];
  let replySent=false, sentBody;
  const readError=listing==="rate_limited"?/receipt listing rate limited/:/receipt listing is incomplete/;
  const env={REVIEW_CONTINUATION_SECRET:"s".repeat(32),
    GITHUB_REQUEST:async(url,options={})=>{
      const path=new URL(url).pathname, method=options.method||"GET";
      if(path==="/user")return json({id:42});
      if(method==="GET"&&path.endsWith("/pulls/7"))return json({number:7,state:"open",merged:false,head:{sha:headSha},base:{sha:"b".repeat(40)},user:{login:"other"}});
      if(method==="GET"&&path.endsWith("/files"))return json([]);
      if(method==="GET"&&path.endsWith("/comments")){
        if(!replySent)return json([{id:10,body:"parent"}]);
        if(listing==="rate_limited")return json({message:"receipt listing rate limited"},429);
        return json([{id:11,body:sentBody,user:{id:42},commit_id:headSha,in_reply_to_id:10,path:"README.md"},
          ...Array.from({length:99},(_,index)=>({id:100+index,body:"older comment"}))]);
      }
      if(method==="POST"){
        writes.push(path); assert.ok(path.endsWith("/comments/10/replies")); replySent=true; sentBody=JSON.parse(options.body).body;
        throw new Error("reply response socket closed",{cause:new Error("upstream connection reset")});
      }
      throw new Error(`unexpected ${method} ${path}`);
    },
    DEOS_REVIEW_CONTINUATION:{
      async prepareReview(){calls.push("prepare");return {outcome:"active",github:{complete:false}};},
      async requestPermit(){calls.push("permit");return {permitId:"permit"};},
      async failGitHubPart(_assertion,body){
        calls.push("failed"); assert.equal(body.outcome,"unclear"); assert.equal(body.publicCode,"github_host_check_required");
        assert.match(JSON.stringify(body.providerDetails),/reply response socket closed/);
        assert.match(JSON.stringify(body.providerDetails),/upstream connection reset/);
        assert.match(JSON.stringify(body.providerDetails),readError);
        assert.ok(body.providerDetails.stack); assert.equal(body.providerDetails.errors.length,2);
        return {outcome:"host_check_required",github:{status:"host_check_required"},linear:{status:"not_started"}};
      }
    }};
  await assert.rejects(publishContinuation("token","reviewer@example.com",env,{
    reviewId:"01995d63-5e00-7000-8000-000000000009",prUrl:"https://github.com/acme/repo/pull/7",headSha,event:"COMMENT",
    comments:[{kind:"reply",clientSubmissionId:"reply-one",commentId:10,path:"README.md",body:"Reply once"}],
    continuation:{runId:"run",issueId:"issue",repository:"acme/repo",pullRequestNumber:7,gateVisitSequence:1,accountPolicyVersion:1},
  }),error=>{assert.equal(error.cause.errors.length,2); return /GitHub reply and receipt read failed/.test(error.message);});
  assert.deepEqual(calls,["prepare","permit","failed"]);
  assert.equal(writes.length,1);
});


for (const pageFields of [{pageIdentityMismatch:true},
  {accessAccount:'reviewer@example.com',githubUserId:42}])
test('matching or absent page identity never replaces the checked session',async()=>{
  const calls=[];
  const env={GITHUB_REQUEST:async()=>json({id:42}),
    TEST_REVIEW_CONTINUATION_CALL:async(method,body,identity)=>{
      calls.push(method);
      assert.deepEqual(identity,{accessAccount:'reviewer@example.com',githubUserId:42});
      assert.equal(Object.hasOwn(body,'pageIdentityMismatch'),false);
      assert.equal(Object.hasOwn(body,'accessAccount'),false);
      assert.equal(Object.hasOwn(body,'githubUserId'),false);
      return {outcome:'continued',github:{complete:true}};
    }};
  const result=await publishContinuation('token','reviewer@example.com',env,{
    reviewId:'existing-review',prUrl:'https://github.com/acme/repo/pull/7',headSha:'a'.repeat(40),
    comments:[],event:'COMMENT',...pageFields,
    continuation:{runId:'run',issueId:'issue',repository:'acme/repo',pullRequestNumber:7,
      gateVisitSequence:1,accountPolicyVersion:1},
  });
  assert.equal(result.published,0);
  assert.deepEqual(calls,['prepareReview']);
});
