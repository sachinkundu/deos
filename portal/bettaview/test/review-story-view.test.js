import assert from "node:assert/strict";
import test from "node:test";
import {
  focusReviewStory,
  reviewStoryArtifactVisible,
  reviewStoryContentEntries,
  reviewStoryStage,
} from "../src/review-story-view.js";

const attempt = (id, node, extra = {}) => ({
  id: `attempt:${id}`,
  type: "attempt",
  time: `2026-08-28T0${id}:00:00Z`,
  data: { attempt_id: id, node_id: node, artifacts: [], content: {}, ...extra },
});

test("focuses the BettaView story on authored work and semantic review evidence", () => {
  const author = attempt("1", "planning_author", {
    artifacts: [{ name: "author-completion.json" }, { name: "provider-references.json" }],
  });
  const selfReview = attempt("2", "self_discovery", { review: { phase: "self_check", mode: "discovery" } });
  const emptyFailure = attempt("3", "independent_discovery", {
    state: "failed",
    artifacts: [{ name: "failure-summary.json" }],
  });
  const externalReview = attempt("4", "independent_discovery", { review: { phase: "independent", mode: "discovery" } });
  const response = attempt("5", "planning_independent_response", {
    content: { "review-dispositions.json": [{ itemId: "one", status: "no_change" }] },
  });
  const transition = { id: "transition:1", type: "transition", time: "2026-08-28T00:00:00Z", data: {} };
  const provider = { id: "provider:1", type: "provider", time: "2026-08-28T00:00:01Z", data: {} };
  const story = {
    governed: {
      runId: "run:1",
      status: "failed",
      issue: { key: "SAC-139", title: "Calculator", url: "https://linear.example/SAC-139" },
      pullRequest: { recordedHeadSha: "a".repeat(40), url: "https://github.example/pull/5" },
      change: "calculator",
    },
    acceptedTrace: { reviewId: "review:4" },
    phases: [{ stage: "independent" }],
    reviews: [{ review_id: "review:4" }],
    candidates: [{ candidate_id: "candidate:1" }],
    events: [transition, provider, author, selfReview, emptyFailure, externalReview, response],
  };

  const focused = focusReviewStory(story);
  assert.deepEqual(focused.events.map((event) => event.id), [
    "attempt:1",
    "attempt:2",
    "attempt:4",
    "attempt:5",
  ]);
  assert.deepEqual(Object.keys(focused).sort(), ["acceptedTrace", "events", "governed"]);
  assert.deepEqual(focused.governed, {
    issue: { key: "SAC-139", title: "Calculator" },
    pullRequest: { recordedHeadSha: "a".repeat(40) },
    change: "calculator",
  });
  assert.equal(reviewStoryStage(author), "author_work");
  assert.equal(reviewStoryStage(selfReview), "self_review");
  assert.equal(reviewStoryStage(externalReview), "external_review");
  assert.equal(reviewStoryStage(response), "author_response");
  assert.equal(reviewStoryStage(emptyFailure), null);
});

test("keeps review evidence while hiding workflow-provider artifacts", () => {
  assert.equal(reviewStoryArtifactVisible({ name: "raw-review-output.json" }), true);
  assert.equal(reviewStoryArtifactVisible({ name: "provider-references.json" }), false);
  assert.deepEqual(reviewStoryContentEntries({
    data: {
      content: {
        "author-completion.json": { outcome: "passed" },
        "failure-summary.json": { category: "timeout" },
      },
    },
  }), [["author-completion.json", { outcome: "passed" }]]);
});
