import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  continueReviewToLinear,
  classifyLinearMutation,
  classifyMarkerReadBack,
  preservePrimaryFailure,
  projectReviewStatus,
  reviewBoundDigest,
  reviewMarker,
  reviewTarget,
  signServiceAssertion,
  verifyServiceAssertion,
  type D1ReviewContinuationStore,
  type PrepareReviewInput,
  type ReviewIntentRecord,
} from "../src/review-continuation.ts";

const review = (type: PrepareReviewInput["reviewType"] = "COMMENT"): PrepareReviewInput => ({
  reviewId: "019941e8-a800-7000-8000-000000000001",
  runId: "run:1",
  issueId: "issue-1",
  repository: "acme/repo",
  pullRequestNumber: 12,
  headSha: "a".repeat(40),
  gateVisitSequence: 3,
  reviewType: type,
  accountPolicyVersion: 2,
  items: [{ contentItemId: "019941e8-a800-7000-8000-000000000002", kind: "inline", body: "Please clarify", target: { path: "README.md", line: 7 } }],
});

test("canonical review identity is deterministic and binds ordered content", async () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const first = await reviewBoundDigest(review());
  assert.equal(first, await reviewBoundDigest(review()));
  assert.notEqual(first, await reviewBoundDigest({ ...review(), headSha: "b".repeat(40) }));
  assert.notEqual(first, await reviewBoundDigest({ ...review(), items: [{ ...review().items[0], body: "Different" }] }));
});

test("service assertions bind method, digest, trusted identities, time, and nonce", async () => {
  const now = 2_000_000;
  const assertion = await signServiceAssertion({ method: "prepareReview", bodyDigest: "b".repeat(64), accessAccount: "person@example.com", githubUserId: 42, issuedAt: now, nonce: "a".repeat(32) }, "s".repeat(32));
  await verifyServiceAssertion(assertion, "s".repeat(32), { method: "prepareReview", bodyDigest: "b".repeat(64), nowMs: now + 1_000 });
  await assert.rejects(() => verifyServiceAssertion({ ...assertion, githubUserId: 43 }, "s".repeat(32), { method: "prepareReview", bodyDigest: "b".repeat(64), nowMs: now + 1_000 }), /invalid_service_assertion/);
  await assert.rejects(() => verifyServiceAssertion(assertion, "s".repeat(32), { method: "prepareReview", bodyDigest: "b".repeat(64), nowMs: now + 60_001 }), /expired_service_assertion/);
});

test("review choices map only through frozen workflow state identities", () => {
  const states = { inProgressStateId: "state-progress", mergingStateId: "state-merging" };
  assert.deepEqual(reviewTarget("COMMENT", states), { stateId: "state-progress", stateName: "In Progress", edge: "edit" });
  assert.deepEqual(reviewTarget("REQUEST_CHANGES", states), { stateId: "state-progress", stateName: "In Progress", edge: "edit" });
  assert.deepEqual(reviewTarget("APPROVE", states), { stateId: "state-merging", stateName: "Merging", edge: "trusted_merge" });
});

test("Linear HTTP-200 failures and mismatched facts never look successful", () => {
  const expected = { issueId: "issue-1", stateId: "state-1" };
  assert.equal(classifyLinearMutation(200, { errors: [{ message: "Denied" }] }, expected).outcome, "failed");
  assert.equal(classifyLinearMutation(200, { data: { issueUpdate: { success: false } } }, expected).outcome, "failed");
  assert.equal(classifyLinearMutation(200, { data: { issueUpdate: { success: true } } }, expected).outcome, "unclear");
  assert.equal(classifyLinearMutation(200, { data: { issueUpdate: { success: true, issue: { id: "issue-1", state: { id: "wrong" } } } } }, expected).outcome, "unclear");
  assert.equal(classifyLinearMutation(200, { data: { issueUpdate: { success: true, issue: { id: "issue-1", state: { id: "state-1" } } } } }, expected).outcome, "succeeded");
});

test("marker read-back adopts one exact complete match and stops on every ambiguity", async () => {
  const marker = await reviewMarker({ reviewId: review().reviewId, partId: "review_bundle", facts: { head: "a".repeat(40) } });
  const exact = { id: 1, body: marker, head: "a".repeat(40) };
  assert.deepEqual(classifyMarkerReadBack([[exact]], (value) => value.id === 1, () => false, true), { outcome: "adopted", value: exact });
  assert.equal(classifyMarkerReadBack([[]], () => false, () => false, true).outcome, "host_check_required");
  assert.equal(classifyMarkerReadBack([[exact, { ...exact, id: 2 }]], () => true, () => false, true).outcome, "host_check_required");
  assert.equal(classifyMarkerReadBack([[exact]], () => true, () => false, false).outcome, "host_check_required");
  assert.equal(classifyMarkerReadBack([[exact]], () => true, () => true, true).outcome, "host_check_required");
});

test("status keeps completed GitHub visible and exposes only safe server actions", () => {
  const intent: ReviewIntentRecord = {
    review_id: review().reviewId, bound_digest: "c".repeat(64), run_id: "run:1", issue_id: "issue-1",
    repository: "acme/repo", pull_request_number: 12, head_sha: "a".repeat(40), gate_visit_sequence: 3,
    review_type: "APPROVE", account_policy_version: 2, target_state_id: "state-merging", target_state_name: "Merging",
    target_edge: "trusted_merge", github_status: "done", linear_status: "failed_retryable", outcome: "active",
    linear_operation_id: "review:1:linear-state", linear_delivery_deadline: null, review_ready_at: "now", terminal_at: null,
  };
  const status = projectReviewStatus(intent, { code: "linear_graphql_failed", message: "Linear rejected the state change" });
  assert.equal(status.github.complete, true);
  assert.equal(status.linear.complete, false);
  assert.deepEqual(status.actions, ["retry"]);
  assert.equal(status.continued, false);
});

test("diagnostic failure is additional context and does not mask the provider error", () => {
  const wrapped = preservePrimaryFailure(new Error("GitHub denied review"), new Error("D1 diagnostic write failed"));
  assert.equal(wrapped.message, "GitHub denied review");
  assert.ok(wrapped.cause instanceof AggregateError);
});

test("workflow continuation uses the shared production transition after GitHub is durable", async () => {
  const calls: string[] = [];
  let intent: ReviewIntentRecord = {
    review_id: review().reviewId,
    bound_digest: "c".repeat(64),
    run_id: "run:1",
    issue_id: "issue-1",
    repository: "acme/repo",
    pull_request_number: 12,
    head_sha: "a".repeat(40),
    gate_visit_sequence: 3,
    review_type: "COMMENT",
    account_policy_version: 2,
    target_state_id: "state-progress",
    target_state_name: "In Progress",
    target_edge: "edit",
    github_status: "done",
    linear_status: "not_started",
    outcome: "active",
    linear_operation_id: null,
    linear_delivery_deadline: null,
    review_ready_at: "now",
    terminal_at: null,
  };
  const store = {
    find: async () => intent,
    authority: async () => ({ definition_digest: "definition-digest" }),
    allocateLinear: async (_reviewId: string, operationId: string) => {
      calls.push("allocate");
      intent = { ...intent, linear_status: "moving" as const, linear_operation_id: operationId };
      return intent;
    },
    failLinear: async () => { throw new Error("unexpected Linear failure"); },
    awaitLinearDelivery: async () => {
      calls.push("await-delivery");
      intent = { ...intent, linear_status: "awaiting_delivery" as const };
    },
    abandonBeforeLinear: async () => { throw new Error("unexpected abandon"); },
  } as unknown as D1ReviewContinuationStore;

  const result = await continueReviewToLinear(
    store,
    { runId: "run:1", currentVisitSequence: 3, definitionDigest: "definition-digest", status: "awaiting_human" },
    async () => { calls.push("live-head"); return "a".repeat(40); },
    async (issueId, stateId) => {
      calls.push("linear-move");
      assert.equal(issueId, "issue-1");
      assert.equal(stateId, intent.target_state_id);
      return { outcome: "succeeded", issueId, stateId };
    },
    review().reviewId,
  );

  assert.deepEqual(calls, ["live-head", "allocate", "linear-move", "await-delivery"]);
  assert.equal(result.linear_status, "awaiting_delivery");
});
