import { github, publishBatchReview } from "./github-api.js";
import { sha256 } from "./github-core.js";

const canonicalJson = (value) => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  throw new Error("invalid_continuation_input");
};

const randomNonce = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hmac = async (secret, value) => {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("review_continuation_unavailable");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export async function serviceAssertion(env, identity, method, body) {
  const unsigned = {
    version: 1,
    keyVersion: 1,
    method,
    bodyDigest: await sha256(canonicalJson(body)),
    accessAccount: identity.accessAccount,
    githubUserId: identity.githubUserId,
    issuedAt: Date.now(),
    nonce: randomNonce(),
  };
  return { ...unsigned, mac: await hmac(env.REVIEW_CONTINUATION_SECRET, canonicalJson(unsigned)) };
}

const identity = async (token, accessAccount, request = fetch) => {
  const viewer = await github(token, "/user", {}, request);
  if (!Number.isSafeInteger(viewer.id) || viewer.id <= 0) throw new Error("github_identity_unavailable");
  return { accessAccount, githubUserId: viewer.id };
};

const continuationItems = (comments, reviewBody = "") => [
  ...comments.map((draft) => ({
    contentItemId: draft.clientSubmissionId,
    kind: draft.kind === "reply" ? "reply" : "inline",
    body: draft.body,
    target: draft.kind === "reply"
      ? { parentCommentId: Number(draft.commentId), path: draft.path }
      : { path: draft.path, startLine: Number(draft.startLine), endLine: Number(draft.endLine) },
  })),
  ...(reviewBody ? [{ contentItemId: "review-body", kind: "review_body", body: reviewBody, target: {} }] : []),
];

const call = async (env, identityProof, method, body) => {
  const assertion = await serviceAssertion(env, identityProof, method, body);
  return env.DEOS_REVIEW_CONTINUATION[method](assertion, body);
};

export async function publishContinuation(token, accessAccount, env, body) {
  const { continuation, comments = [], event = "COMMENT", reviewId, prUrl, headSha } = body;
  if (!continuation || !reviewId || !Array.isArray(comments)) throw new Error("continuation_not_linked");
  const request = env.GITHUB_REQUEST || fetch;
  const identityProof = await identity(token, accessAccount, request);
  const prepare = {
    reviewId,
    supersedesReviewId: body.supersedesReviewId || null,
    runId: continuation.runId,
    issueId: continuation.issueId,
    repository: continuation.repository,
    pullRequestNumber: continuation.pullRequestNumber,
    headSha,
    gateVisitSequence: continuation.gateVisitSequence,
    reviewType: event,
    accountPolicyVersion: continuation.accountPolicyVersion,
    items: continuationItems(comments, body.reviewBody || ""),
  };
  const preparedStatus = await call(env, identityProof, "prepareReview", prepare);
  if (preparedStatus.github.complete) {
    const continuationStatus = await call(env, identityProof, "markGitHubReady", { reviewId, headSha });
    return { review: null, replies: [], published: 0, duplicates: comments.length, assets: [], continuation: continuationStatus };
  }

  let published;
  try {
    published = await publishBatchReview(token, {
      ...body,
      reviewId,
      beforePart: async (part) => call(env, identityProof, "requestPermit", {
        reviewId,
        step: "github",
        scopeId: part.partId,
        requestDigest: await sha256(canonicalJson(part.request)),
      }),
      afterPart: async ({ partId, event: partEvent, permit, record }) => call(env, identityProof, "completeGitHubPart", {
        reviewId,
        partId,
        permitId: permit.permitId,
        recordId: String(record.id),
        url: record.html_url,
        commitSha: record.commit_id,
        githubUserId: record.user.id,
        event: partEvent,
        receiptDigest: await sha256(canonicalJson(record)),
      }),
      partFailed: async ({ partId, permit, cause }) => {
        const status = Number(cause?.status);
        const clearlyRejected = Number.isInteger(status) && status >= 400 && status < 500 && ![408, 425, 429].includes(status);
        return call(env, identityProof, "failGitHubPart", {
          reviewId,
          partId,
          permitId: permit.permitId,
          publicCode: clearlyRejected ? "github_rejected" : "github_host_check_required",
          outcome: clearlyRejected ? "clearly_rejected" : "unclear",
          providerMessage: cause instanceof Error ? cause.message : String(cause),
        });
      },
    }, request);
  } catch (cause) {
    throw new Error(`GitHub review publication failed: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
  }
  const status = await call(env, identityProof, "markGitHubReady", { reviewId, headSha });
  return { ...published, continuation: status };
}

export async function continuationStatus(env, reviewId) {
  return env.DEOS_REVIEW_CONTINUATION.status(reviewId);
}

export async function continuationAction(token, accessAccount, env, body) {
  const identityProof = await identity(token, accessAccount, env.GITHUB_REQUEST || fetch);
  if (body.action === "retry") return call(env, identityProof, "retryLinear", { reviewId: body.reviewId });
  if (body.action === "abandon") return call(env, identityProof, "abandon", { reviewId: body.reviewId });
  throw new Error("continuation_action_not_allowed");
}

export async function connectAccount(token, accessAccount, env, body) {
  const identityProof = await identity(token, accessAccount, env.GITHUB_REQUEST || fetch);
  return call(env, identityProof, "connectAccount", {
    projectId: body.projectId,
    expectedRouteRevision: Number(body.expectedRouteRevision),
    linearUserId: body.linearUserId,
  });
}
