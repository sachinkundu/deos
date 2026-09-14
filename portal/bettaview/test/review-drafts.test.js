import test from "node:test";
import assert from "node:assert/strict";
import { draftStorageKey, newReviewDraft, persistReviewDraft, restoreReviewDraft, uuidv7 } from "../src/review-drafts.js";

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
  assert.notEqual(restoreReviewDraft(local, draft.prUrl, "b".repeat(40)).reviewId, draft.reviewId);
  assert.ok(local.getItem(draftStorageKey(draft.prUrl, draft.headSha)).includes("Keep this"));
});
