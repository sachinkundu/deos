import test from "node:test";
import assert from "node:assert/strict";
import { applyReviewReceiptsToDraft, draftStorageKey, newReviewDraft, persistReviewDraft, restoreReviewDraft, uuidv7 } from "../src/review-drafts.js";

const storage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
};

test("creates sortable UUIDv7 review identities", () => {
  const first = uuidv7(1_000, new Uint8Array(10));
  const second = uuidv7(2_000, new Uint8Array(10));
  assert.match(first, /^[0-9a-f-]{36}$/);
  assert.ok(first < second);
});

test("persists local review and content identities only for the exact head", () => {
  const local = storage();
  const draft = newReviewDraft("https://github.com/acme/repo/pull/1", "a".repeat(40), 1_000);
  draft.items.push({ clientSubmissionId: uuidv7(1_001, new Uint8Array(10)), body: "Keep this" });
  persistReviewDraft(local, draft, 2_000);
  assert.deepEqual(restoreReviewDraft(local, draft.prUrl, draft.headSha), { ...draft, updatedAt: 2_000 });
  const replacement=restoreReviewDraft(local, draft.prUrl, "b".repeat(40));
  assert.notEqual(replacement.reviewId, draft.reviewId);
  assert.equal(replacement.priorReviewId,draft.reviewId);
  assert.deepEqual(replacement.items,draft.items);
  assert.ok(local.getItem(draftStorageKey(draft.prUrl, draft.headSha)).includes("Keep this"));
});

test("reconciled receipts identify only the published notes in the matching review", () => {
  const draft = {...newReviewDraft("https://github.com/acme/repo/pull/1", "a".repeat(40)),
    reviewBody: "Keep the summary", items: [
      {clientSubmissionId: "sent-reply", body: "Sent once"},
      {clientSubmissionId: "pending-note", body: "Still pending"},
      {clientSubmissionId: "new-note", body: "Added later"},
    ]};
  const status = {reviewId: draft.reviewId, parts: [
    {contentItemId: "sent-reply", status: "done", url: "https://github.com/acme/repo/pull/1#discussion_r1"},
    {contentItemId: "pending-note", status: "host_check_required", url: null},
  ]};
  assert.equal(applyReviewReceiptsToDraft(draft, {...status, reviewId: uuidv7()}), draft);
  const next = applyReviewReceiptsToDraft(draft, status);
  assert.equal(next.items[0].alreadyPublishedUrl, status.parts[0].url);
  assert.equal(next.items[1], draft.items[1]);
  assert.equal(next.items[2], draft.items[2]);
  assert.equal(next.reviewBody, draft.reviewBody);
  assert.equal(draft.items[0].alreadyPublishedUrl, undefined);
  assert.equal(applyReviewReceiptsToDraft(next, status), next);
  const local = storage();
  persistReviewDraft(local, next);
  assert.deepEqual(restoreReviewDraft(local, draft.prUrl, draft.headSha).items, next.items);
});
