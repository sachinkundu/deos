const REVIEW_CONTENT = new Set([
  "author-completion.json",
  "normalized-review.json",
  "review-dispositions.json",
  "review-replies.json",
  "result.json",
]);

const REVIEW_ARTIFACTS = new Set([
  ...REVIEW_CONTENT,
  "bettaview-traceability.json",
  "patch.diff",
  "raw-review-output.json",
]);

function artifactNames(event) {
  return new Set((event?.data?.artifacts || []).map((artifact) => artifact.name));
}

export function reviewStoryStage(event) {
  if (event?.type !== "attempt") return null;
  const review = event.data?.review;
  if (review?.phase === "independent") return "external_review";
  if (review) return "self_review";

  const node = String(event.data?.node_id || "");
  const names = artifactNames(event);
  const hasAuthorEvidence = names.has("author-completion.json")
    || names.has("review-dispositions.json")
    || Object.keys(event.data?.content || {}).some((name) => (
      name === "author-completion.json" || name === "review-dispositions.json"
    ));
  if (!hasAuthorEvidence) return null;
  if (node.includes("response") || node.includes("repair")) return "author_response";
  return "author_work";
}

export function focusReviewStory(story) {
  if (!story) return null;
  const governed = story.governed ? {
    issue: {
      key: story.governed.issue?.key,
      title: story.governed.issue?.title,
    },
    pullRequest: {
      recordedHeadSha: story.governed.pullRequest?.recordedHeadSha,
    },
    change: story.governed.change,
  } : null;
  return {
    governed,
    acceptedTrace: story.acceptedTrace,
    events: (story.events || []).filter((event) => reviewStoryStage(event)),
  };
}

export function reviewStoryArtifactVisible(artifact) {
  return REVIEW_ARTIFACTS.has(artifact?.name);
}

export function reviewStoryContentEntries(event) {
  return Object.entries(event?.data?.content || {}).filter(([name]) => REVIEW_CONTENT.has(name));
}
