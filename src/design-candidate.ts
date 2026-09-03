import { sha256Hex } from "./trace-review.ts";

export class DesignCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignCandidateRejectedError";
  }
}

export interface DesignReviewReply {
  commentId: number;
  body: string;
  latestHumanCommentId: number;
  latestHumanCommentUpdatedAt: string;
}

export interface DesignReviewReplyDraft {
  commentId: number;
  body: string;
}

interface DesignReviewFeedbackSnapshotEntry {
  kind?: unknown;
  id?: unknown;
  authorType?: unknown;
  replyToId?: unknown;
  updatedAt?: unknown;
}

export const bindDesignReviewReplies = (
  replies: readonly DesignReviewReplyDraft[],
  feedback: readonly DesignReviewFeedbackSnapshotEntry[],
): readonly DesignReviewReply[] => {
  if (!Array.isArray(replies) || !Array.isArray(feedback)) {
    throw new DesignCandidateRejectedError("trusted design review replies are invalid");
  }
  const comments = feedback.filter((entry) =>
    entry.kind === "review_comment" && Number.isSafeInteger(entry.id)
  );
  return Object.freeze(replies.map((reply) => {
    const root = comments.find((entry) =>
      entry.id === reply.commentId && entry.replyToId === null && entry.authorType === "User"
    );
    if (root === undefined) {
      throw new DesignCandidateRejectedError("trusted design review replies are invalid");
    }
    const humanComments = comments
      .filter((entry) =>
        entry.authorType === "User" &&
        (entry.id === reply.commentId || entry.replyToId === reply.commentId)
      );
    const latestHumanCommentId = Math.max(...humanComments.map((entry) => Number(entry.id)));
    const latestHumanComment = humanComments.find((entry) => entry.id === latestHumanCommentId);
    if (typeof latestHumanComment?.updatedAt !== "string") {
      throw new DesignCandidateRejectedError("trusted design review replies are invalid");
    }
    return Object.freeze({
      ...reply,
      latestHumanCommentId,
      latestHumanCommentUpdatedAt: latestHumanComment.updatedAt,
    });
  }));
};

export interface DesignCandidate {
  version: 1;
  candidateId: string;
  runId: string;
  round: number;
  sourceAttemptId: string;
  baseCommit: string;
  change: string;
  path: string;
  content: string;
  byteSize: number;
  designDigest: string;
  reviewReplies: readonly DesignReviewReply[];
  reviewDispositions: readonly {
    findingId: string;
    status: "applied" | "declined" | "no_change";
    reason: string;
  }[];
  reviewContextId: string | null;
  candidateDigest: string;
}

export interface DesignCandidateValidation {
  version: 1;
  candidateId: string;
  allowedPaths: "passed";
  strictOpenSpec: "passed";
  whitespace: "passed";
  requiredSections: "passed";
  checkedAt: string;
}

export interface DesignCandidateEvidence {
  candidate: DesignCandidate;
  validation: DesignCandidateValidation;
  candidateR2Key: string;
  candidateSha256: string;
  validationR2Key: string;
  validationSha256: string;
}

export const designCandidateEvidenceKeys = (runId: string, candidateId: string): {
  candidateR2Key: string;
  validationR2Key: string;
} => {
  const prefix = `runs/${encodeURIComponent(runId)}/design-candidates/${candidateId}`;
  return {
    candidateR2Key: `${prefix}/design-candidate.json`,
    validationR2Key: `${prefix}/candidate-validation.json`,
  };
};

export const recoverDesignCandidateCheckedAt = async (
  bucket: R2Bucket,
  runId: string,
  candidateId: string,
): Promise<string | null> => {
  const { validationR2Key } = designCandidateEvidenceKeys(runId, candidateId);
  const object = await bucket.get(validationR2Key);
  if (object === null) return null;
  const text = await object.text();
  if (new TextEncoder().encode(text).byteLength > 4_096) {
    throw new Error("design candidate validation evidence is invalid");
  }
  let validation: Partial<DesignCandidateValidation>;
  try {
    validation = JSON.parse(text) as Partial<DesignCandidateValidation>;
  } catch {
    throw new Error("design candidate validation evidence is invalid");
  }
  if (
    validation.version !== 1 || validation.candidateId !== candidateId ||
    validation.allowedPaths !== "passed" || validation.strictOpenSpec !== "passed" ||
    validation.whitespace !== "passed" || validation.requiredSections !== "passed" ||
    typeof validation.checkedAt !== "string" ||
    new Date(validation.checkedAt).toISOString() !== validation.checkedAt
  ) throw new Error("design candidate validation evidence is invalid");
  return validation.checkedAt;
};

export interface StoredDesignCandidateIdentity {
  candidate_id: string;
  run_id: string;
  round: number;
  source_attempt_id: string;
  base_commit: string;
  change_id: string;
  design_digest: string;
  candidate_digest: string;
  state: string;
  created_at: string;
  accepted_at: string | null;
}

export const isStoredDesignCandidateReplay = (
  stored: StoredDesignCandidateIdentity,
  candidate: DesignCandidate,
): boolean => stored.candidate_id === candidate.candidateId && stored.run_id === candidate.runId &&
  stored.round === candidate.round && stored.source_attempt_id === candidate.sourceAttemptId &&
  stored.base_commit === candidate.baseCommit && stored.change_id === candidate.change &&
  stored.design_digest === candidate.designDigest && stored.candidate_digest === candidate.candidateDigest &&
  stored.state === "validated" && stored.accepted_at !== null;

const requiredSections = ["component diagram", "event flow", "minimal data model", "failure modes"];

const checkedReplies = (value: readonly DesignReviewReply[]): readonly DesignReviewReply[] => {
  if (!Array.isArray(value)) throw new DesignCandidateRejectedError("design review replies are invalid");
  const seen = new Set<number>();
  return Object.freeze(value.map((reply) => {
    if (
      !Number.isSafeInteger(reply.commentId) || reply.commentId <= 0 || seen.has(reply.commentId) ||
      !Number.isSafeInteger(reply.latestHumanCommentId) || reply.latestHumanCommentId < reply.commentId ||
      typeof reply.latestHumanCommentUpdatedAt !== "string" ||
      Number.isNaN(Date.parse(reply.latestHumanCommentUpdatedAt)) ||
      typeof reply.body !== "string" || reply.body.trim() !== reply.body ||
      reply.body.length < 1 || reply.body.includes("<!--")
    ) throw new DesignCandidateRejectedError("design review reply is invalid");
    seen.add(reply.commentId);
    return Object.freeze({
      commentId: reply.commentId,
      body: reply.body,
      latestHumanCommentId: reply.latestHumanCommentId,
      latestHumanCommentUpdatedAt: reply.latestHumanCommentUpdatedAt,
    });
  }));
};

const checkedDispositions = (value: readonly {
  findingId: string;
  status: "applied" | "declined" | "no_change";
  reason: string;
}[]): readonly {
  findingId: string;
  status: "applied" | "declined" | "no_change";
  reason: string;
}[] => {
  if (!Array.isArray(value)) {
    throw new DesignCandidateRejectedError("design review dispositions are invalid");
  }
  const seen = new Set<string>();
  return Object.freeze([...value].sort((left, right) => left.findingId.localeCompare(right.findingId)).map((item) => {
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.findingId) || seen.has(item.findingId) ||
      !["applied", "declined", "no_change"].includes(item.status) ||
      typeof item.reason !== "string" || item.reason.trim() !== item.reason ||
      item.reason.length < 1
    ) throw new DesignCandidateRejectedError("design review disposition is invalid");
    seen.add(item.findingId);
    return Object.freeze({ ...item });
  }));
};

export const buildDesignCandidate = async (input: {
  candidateId: string;
  runId: string;
  round: number;
  sourceAttemptId: string;
  baseCommit: string;
  change: string;
  path: string;
  content: string;
  reviewReplies: readonly DesignReviewReply[];
  reviewDispositions?: readonly {
    findingId: string;
    status: "applied" | "declined" | "no_change";
    reason: string;
  }[];
  reviewContextId?: string | null;
  strictOpenSpecCheck: () => Promise<void>;
  checkedAt: string;
}): Promise<{ candidate: DesignCandidate; validation: DesignCandidateValidation }> => {
  const expectedPath = `openspec/changes/${input.change}/design.md`;
  if (!/^[a-z0-9][a-z0-9:._-]{7,199}$/.test(input.candidateId) ||
    !/^[a-z0-9][a-z0-9:._/-]{7,299}$/.test(input.runId) ||
    !Number.isSafeInteger(input.round) || input.round < 1 ||
    !/^[0-9a-f]{40}$/.test(input.baseCommit) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.change) || input.path !== expectedPath ||
    typeof input.content !== "string" || input.content.trim().length === 0) {
    throw new DesignCandidateRejectedError("design candidate identity is invalid");
  }
  if (!input.content.endsWith("\n") || input.content.split("\n").some((line) => /[ \t]+$/.test(line))) {
    throw new DesignCandidateRejectedError("design candidate has whitespace errors");
  }
  const headings = input.content.toLowerCase();
  if (requiredSections.some((section) => !headings.includes(`## ${section}`))) {
    throw new DesignCandidateRejectedError("design candidate is missing a required section");
  }
  await input.strictOpenSpecCheck();
  const reviewReplies = checkedReplies(input.reviewReplies);
  const reviewDispositions = checkedDispositions(input.reviewDispositions ?? []);
  const reviewContextId = input.reviewContextId ?? null;
  if (reviewContextId !== null && !/^design-review:[A-Za-z0-9:._-]{3,512}$/.test(reviewContextId)) {
    throw new DesignCandidateRejectedError("design review context identity is invalid");
  }
  const designDigest = await sha256Hex(input.content);
  const byteSize = new TextEncoder().encode(input.content).byteLength;
  const candidateDigest = await sha256Hex(JSON.stringify({
    baseCommit: input.baseCommit,
    change: input.change,
    path: input.path,
    byteSize,
    designDigest,
    reviewReplies,
    reviewDispositions,
    reviewContextId,
  }));
  const candidateValue: DesignCandidate = {
    version: 1,
    candidateId: input.candidateId,
    runId: input.runId,
    round: input.round,
    sourceAttemptId: input.sourceAttemptId,
    baseCommit: input.baseCommit,
    change: input.change,
    path: input.path,
    content: input.content,
    byteSize,
    designDigest,
    reviewReplies,
    reviewDispositions,
    reviewContextId,
    candidateDigest,
  };
  const candidate: DesignCandidate = Object.freeze(candidateValue);
  return {
    candidate,
    validation: Object.freeze({
      version: 1,
      candidateId: input.candidateId,
      allowedPaths: "passed",
      strictOpenSpec: "passed",
      whitespace: "passed",
      requiredSections: "passed",
      checkedAt: input.checkedAt,
    }),
  };
};

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const writeAndReadBack = async (bucket: R2Bucket, key: string, bytes: Uint8Array, digest: string): Promise<void> => {
  const written = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    sha256: digest,
    httpMetadata: { contentType: "application/json" },
    customMetadata: { policy: "deos-design-candidate-v1", sha256: digest },
  });
  if (written === null) {
    const existing = await bucket.get(key);
    if (existing === null || await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== digest) {
      throw new Error("design candidate evidence create-only conflict");
    }
  }
  const readBack = await bucket.get(key);
  if (readBack === null || await sha256Hex(new Uint8Array(await readBack.arrayBuffer())) !== digest) {
    throw new Error("design candidate evidence read-back failed");
  }
};

export const persistDesignCandidateEvidence = async (
  bucket: R2Bucket,
  input: { candidate: DesignCandidate; validation: DesignCandidateValidation },
): Promise<DesignCandidateEvidence> => {
  const { candidateR2Key, validationR2Key } = designCandidateEvidenceKeys(
    input.candidate.runId,
    input.candidate.candidateId,
  );
  const candidateBytes = encode(input.candidate);
  const validationBytes = encode(input.validation);
  const candidateSha256 = await sha256Hex(candidateBytes);
  const validationSha256 = await sha256Hex(validationBytes);
  await writeAndReadBack(bucket, candidateR2Key, candidateBytes, candidateSha256);
  await writeAndReadBack(bucket, validationR2Key, validationBytes, validationSha256);
  return Object.freeze({
    ...input,
    candidateR2Key,
    candidateSha256,
    validationR2Key,
    validationSha256,
  });
};
