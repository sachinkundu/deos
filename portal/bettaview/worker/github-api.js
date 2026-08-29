import sanitizeHtml from "sanitize-html";
import {
  approvalRestriction,
  batchReviewPayload,
  changedLinesFromPatch,
  chooseAnchorLine,
  extractMermaidBlocks,
  isRenderableMarkdownFile,
  locateSelectedText,
  marker,
  parsePullRequestUrl,
  pullRequestState,
  readMarker,
  sha256,
} from "./github-core.js";

const API = "https://api.github.com";
const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
  "details", "summary", "input", "picture", "source", "kbd", "mark", "relative-time",
]);
const allowedAttributes = {
  "*": ["class", "id", "dir", "title", "aria-hidden", "aria-label", "role"],
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "width", "height", "loading"],
  input: ["type", "checked", "disabled"],
  code: ["class"],
  pre: ["class", "lang"],
  td: ["align"],
  th: ["align"],
};

function cleanRenderedMarkdown(html) {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

export async function github(token, path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "deos-bettaview",
      ...options.headers,
    },
  });
  const text = await response.text();
  let value = text;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try { value = text ? JSON.parse(text) : null; } catch { value = null; }
  }
  if (!response.ok) {
    const error = new Error(value?.message || `GitHub returned ${response.status}`);
    error.status = response.status;
    error.details = value;
    throw error;
  }
  return value;
}

async function pullContext(token, prUrl) {
  const identity = parsePullRequestUrl(prUrl);
  const { owner, repo, number } = identity;
  const [pr, files] = await Promise.all([
    github(token, `/repos/${owner}/${repo}/pulls/${number}`),
    github(token, `/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`),
  ]);
  return { identity, pr, files };
}

async function markdownFile(token, owner, repo, path, ref) {
  const content = await github(token, `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${ref}`);
  const binary = atob(String(content.content || "").replaceAll("\n", ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function threads(token, owner, repo, number) {
  const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine comments(first:100){nodes{databaseId body createdAt url author{login}}}}}}}}`;
  const data = await github(token, "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables: { owner, repo, number } }),
  });
  return data.data.repository.pullRequest.reviewThreads.nodes.map((thread) => ({
    ...thread,
    comments: thread.comments.nodes.map((comment) => ({ ...comment, metadata: readMarker(comment.body) })),
  }));
}

function proxiedStory(story) {
  if (!story) return null;
  return JSON.parse(JSON.stringify(story).replaceAll(
    '"/api/process-attempts/',
    '"/api/deos/process-attempts/',
  ));
}

function resolveDocumentPath(change, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || relativePath.startsWith("/") || relativePath.split("/").includes("..")) {
    throw new Error("The trace named an invalid document path.");
  }
  return `openspec/changes/${change}/${relativePath}`.replaceAll("//", "/");
}

async function traceabilityReview(story, renderedFiles, liveHead) {
  const trace = story?.acceptedTrace;
  if (!trace?.manifest || trace.unavailable) return null;
  const manifest = trace.manifest;
  if (![2, 3, 4].includes(manifest.version) || !manifest.review || !Array.isArray(manifest.review.documents)) {
    throw new Error("DEOS returned an unsupported trace artifact.");
  }
  const files = new Map(renderedFiles.map((file) => [file.path, file]));
  const documents = await Promise.all(manifest.review.documents.map(async (document) => {
    const path = resolveDocumentPath(manifest.change, document.file);
    const file = files.get(path);
    const actualSha256 = file ? await sha256(file.source) : null;
    return {
      file: document.file,
      path,
      source: file?.source || "",
      expectedSha256: document.sha256,
      actualSha256,
      current: actualSha256 === document.sha256,
    };
  }));
  const current = trace.reviewedHeadSha === liveHead && documents.every((document) => document.current);
  return {
    path: `openspec/changes/${manifest.change}/bettaview-traceability.json`,
    rootPath: `openspec/changes/${manifest.change}`,
    version: manifest.version,
    change: manifest.change,
    status: current ? "current" : "stale",
    manifest,
    documents,
    source: "deos-hash-verified",
    reviewId: trace.reviewId,
    reviewedHeadSha: trace.reviewedHeadSha,
    artifactSha256: trace.sha256,
  };
}

async function deosStory(env, accessToken, identity) {
  const response = await env.DEOS_PORTAL.fetch(new Request(
    `https://deos.internal/api/pull-requests/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}/${identity.number}/review-story`,
    { headers: { "CF-Access-Jwt-Assertion": accessToken, Accept: "application/json" } },
  ));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`DEOS review story returned ${response.status}.`);
  return proxiedStory(await response.json());
}

export async function loadPullRequest(token, prUrl, env, accessToken) {
  const context = await pullContext(token, prUrl);
  const { owner, repo, number } = context.identity;
  const markdownFiles = context.files.filter(isRenderableMarkdownFile);
  const [renderedFiles, reviewThreads, viewer, story] = await Promise.all([
    Promise.all(markdownFiles.map(async (file) => {
      const source = await markdownFile(token, owner, repo, file.filename, context.pr.head.sha);
      const rendered = await github(token, "/markdown", {
        method: "POST",
        body: JSON.stringify({ text: source, mode: "gfm", context: `${owner}/${repo}` }),
      });
      return {
        path: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        source,
        sourceFingerprint: await sha256(source),
        html: cleanRenderedMarkdown(rendered),
        changedLines: [...changedLinesFromPatch(file.patch)],
        mermaidBlocks: extractMermaidBlocks(source),
      };
    })),
    threads(token, owner, repo, number),
    github(token, "/user"),
    deosStory(env, accessToken, context.identity),
  ]);
  const trace = await traceabilityReview(story, renderedFiles, context.pr.head.sha);
  const restriction = approvalRestriction(viewer.login, context.pr.user.login);
  return {
    repository: `${owner}/${repo}`,
    number,
    title: context.pr.title,
    url: context.pr.html_url,
    headSha: context.pr.head.sha,
    baseSha: context.pr.base.sha,
    state: pullRequestState(context.pr),
    draft: context.pr.draft,
    authorLogin: context.pr.user.login,
    viewerLogin: viewer.login,
    reviewCapabilities: { approve: { allowed: !restriction, reason: restriction } },
    files: renderedFiles,
    traceabilityTargets: [],
    traceabilityReviews: trace ? [trace] : [],
    threads: reviewThreads,
    deos: story,
  };
}

function assertHead(pr, expectedHead) {
  if (pr.head.sha !== expectedHead) {
    const error = new Error(`The pull request changed. Refresh before commenting (now ${pr.head.sha.slice(0, 7)}).`);
    error.status = 409;
    throw error;
  }
}

async function assertReviewEventAllowed(token, context, event) {
  if (event !== "APPROVE") return;
  const viewer = await github(token, "/user");
  const restriction = approvalRestriction(viewer.login, context.pr.user.login);
  if (!restriction) return;
  const error = new Error(restriction);
  error.status = 422;
  throw error;
}

async function existingSubmission(token, owner, repo, number, clientSubmissionId) {
  const comments = await github(token, `/repos/${owner}/${repo}/pulls/${number}/comments?per_page=100`);
  return comments.find((comment) => readMarker(comment.body)?.clientSubmissionId === clientSubmissionId);
}

async function ensureAssetBranch(token, owner, repo, baseSha) {
  try {
    await github(token, `/repos/${owner}/${repo}/git/ref/heads/bettaview-annotations`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await github(token, `/repos/${owner}/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({ ref: "refs/heads/bettaview-annotations", sha: baseSha }),
    });
  }
}

async function uploadAnnotation(token, owner, repo, pr, clientSubmissionId, dataUrl) {
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) throw new Error("The annotation capture was not a PNG image.");
  await ensureAssetBranch(token, owner, repo, pr.base.sha);
  const path = `annotations/pr-${pr.number}/${pr.head.sha}/${clientSubmissionId}.png`;
  const result = await github(token, `/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify({
      message: `Store BettaView annotation ${clientSubmissionId}`,
      content: match[1],
      branch: "bettaview-annotations",
    }),
  });
  return {
    imageUrl: `https://raw.githubusercontent.com/${owner}/${repo}/bettaview-annotations/${path}`,
    blobSha: result.content.sha,
    path,
  };
}

async function prepareBatchComment(token, context, draft, sourceCache) {
  const { identity, pr, files } = context;
  if (!draft?.body?.trim()) throw new Error("Every unpublished comment needs text.");
  if (!draft.clientSubmissionId) throw new Error("An unpublished comment is missing its submission identity.");
  const file = files.find((item) => item.filename === draft.path);
  if (!file) throw new Error(`${draft.path || "The selected file"} is not part of this pull request.`);
  let source = sourceCache.get(draft.path);
  if (!source) {
    source = await markdownFile(token, identity.owner, identity.repo, draft.path, pr.head.sha);
    sourceCache.set(draft.path, source);
  }
  if (draft.kind === "text-selection") {
    const range = locateSelectedText(source, draft.selectedText, {
      startLine: Number(draft.startLine),
      endLine: Number(draft.endLine),
    });
    return {
      draft,
      path: draft.path,
      line: chooseAnchorLine(range, changedLinesFromPatch(file.patch)),
      body: draft.body.trim(),
      metadata: {
        kind: "text-selection",
        clientSubmissionId: draft.clientSubmissionId,
        repository: `${identity.owner}/${identity.repo}`,
        pullRequest: identity.number,
        headSha: pr.head.sha,
        path: draft.path,
        sourceFingerprint: await sha256(source),
        startLine: range.startLine,
        endLine: range.endLine,
        selectedText: range.selectedText,
      },
    };
  }
  if (draft.kind === "mermaid-annotation") {
    if (!Array.isArray(draft.geometry) || draft.geometry.length === 0) throw new Error("Every diagram comment needs an arrow or circle.");
    if (!/^data:image\/png;base64,/.test(draft.imageDataUrl || "")) throw new Error("Every diagram comment needs a PNG capture.");
    const currentBlock = extractMermaidBlocks(source).find((candidate) => candidate.id === draft.block?.id);
    if (!currentBlock || currentBlock.fingerprint !== draft.block?.fingerprint) {
      const error = new Error(`The Mermaid diagram in ${draft.path} changed. Refresh before publishing.`);
      error.status = 409;
      throw error;
    }
    return {
      draft,
      path: draft.path,
      line: chooseAnchorLine(currentBlock, changedLinesFromPatch(file.patch)),
      body: draft.body.trim(),
      currentBlock,
      sourceFingerprint: await sha256(source),
    };
  }
  throw new Error(`Unsupported unpublished comment type: ${draft.kind || "unknown"}.`);
}

export async function publishBatchReview(token, body) {
  const { prUrl, headSha, event = "COMMENT", comments } = body;
  if (!Array.isArray(comments) || comments.length === 0) throw new Error("Add at least one comment before publishing.");
  if (comments.length > 50) throw new Error("Publish at most 50 comments in one review.");
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(event)) throw new Error("Unsupported review state.");
  const context = await pullContext(token, prUrl);
  assertHead(context.pr, headSha);
  await assertReviewEventAllowed(token, context, event);
  const ids = comments.map((comment) => comment.clientSubmissionId);
  if (new Set(ids).size !== ids.length) throw new Error("Each unpublished comment must have a unique submission identity.");
  const priorComments = await github(token, `/repos/${context.identity.owner}/${context.identity.repo}/pulls/${context.identity.number}/comments?per_page=100`);
  const priorIds = new Set(priorComments.map((comment) => readMarker(comment.body)?.clientSubmissionId).filter(Boolean));
  const unpublished = comments.filter((comment) => !priorIds.has(comment.clientSubmissionId));
  if (!unpublished.length) return { review: null, published: 0, duplicates: comments.length, assets: [] };

  const replyDrafts = unpublished.filter((draft) => draft.kind === "reply");
  const commentDrafts = unpublished.filter((draft) => draft.kind !== "reply");
  for (const draft of replyDrafts) {
    if (!draft.body?.trim()) throw new Error("Every unpublished reply needs text.");
    if (!priorComments.some((comment) => comment.id === Number(draft.commentId))) {
      throw new Error("A reply target is no longer part of this pull request. Refresh before publishing.");
    }
  }
  const sourceCache = new Map();
  const prepared = [];
  for (const draft of commentDrafts) prepared.push(await prepareBatchComment(token, context, draft, sourceCache));
  const assets = [];
  for (const item of prepared) {
    if (item.draft.kind !== "mermaid-annotation") continue;
    const asset = await uploadAnnotation(token, context.identity.owner, context.identity.repo, context.pr, item.draft.clientSubmissionId, item.draft.imageDataUrl);
    assets.push(asset);
    item.metadata = {
      kind: "mermaid-annotation",
      clientSubmissionId: item.draft.clientSubmissionId,
      repository: `${context.identity.owner}/${context.identity.repo}`,
      pullRequest: context.identity.number,
      headSha,
      path: item.path,
      sourceFingerprint: item.sourceFingerprint,
      diagram: {
        id: item.currentBlock.id,
        fingerprint: item.currentBlock.fingerprint,
        startLine: item.currentBlock.startLine,
        endLine: item.currentBlock.endLine,
      },
      render: item.draft.render,
      geometry: item.draft.geometry,
      imageUrl: asset.imageUrl,
      imageBlobSha: asset.blobSha,
    };
    item.body = `${item.body}\n\n![Annotated Mermaid diagram](${asset.imageUrl})`;
  }
  const reviewComments = prepared.map((item) => ({
    path: item.path,
    line: item.line,
    body: `${item.body}\n\n${marker(item.metadata)}`,
  }));
  let review = null;
  if (reviewComments.length) {
    review = await github(token, `/repos/${context.identity.owner}/${context.identity.repo}/pulls/${context.identity.number}/reviews`, {
      method: "POST",
      body: JSON.stringify(batchReviewPayload(headSha, reviewComments, event)),
    });
  }
  const replies = [];
  for (const draft of replyDrafts) {
    const metadata = { kind: "reply", clientSubmissionId: draft.clientSubmissionId, headSha, path: draft.path };
    replies.push(await github(token, `/repos/${context.identity.owner}/${context.identity.repo}/pulls/${context.identity.number}/comments/${Number(draft.commentId)}/replies`, {
      method: "POST",
      body: JSON.stringify({ body: `${draft.body.trim()}\n\n${marker(metadata)}` }),
    }));
  }
  if (!reviewComments.length && event !== "COMMENT") {
    review = await github(token, `/repos/${context.identity.owner}/${context.identity.repo}/pulls/${context.identity.number}/reviews`, {
      method: "POST",
      body: JSON.stringify({ commit_id: headSha, event, body: "" }),
    });
  }
  return { review, replies, published: reviewComments.length + replies.length, duplicates: comments.length - unpublished.length, assets };
}

export async function publishReply(token, body) {
  if (!body.body?.trim()) throw new Error("Write a reply before submitting.");
  const { owner, repo, number } = parsePullRequestUrl(body.prUrl);
  return {
    comment: await github(token, `/repos/${owner}/${repo}/pulls/${number}/comments/${Number(body.commentId)}/replies`, {
      method: "POST",
      body: JSON.stringify({ body: body.body.trim() }),
    }),
  };
}

export async function publishReviewDecision(token, body) {
  if (!["COMMENT", "APPROVE", "REQUEST_CHANGES"].includes(body.event)) throw new Error("Unsupported review state.");
  const context = await pullContext(token, body.prUrl);
  assertHead(context.pr, body.headSha);
  await assertReviewEventAllowed(token, context, body.event);
  return {
    review: await github(token, `/repos/${context.identity.owner}/${context.identity.repo}/pulls/${context.identity.number}/reviews`, {
      method: "POST",
      body: JSON.stringify({ commit_id: body.headSha, event: body.event, body: body.body || "" }),
    }),
  };
}
