import { sha256Hex } from "./trace-review.ts";

export const DESIGN_CANDIDATE_CONTEXT_LIMIT = 32_000;

export class DesignCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DesignCandidateRejectedError";
  }
}

export interface DesignReviewReply {
  commentId: number;
  body: string;
}

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
  if (!Array.isArray(value) || value.length > 50) throw new DesignCandidateRejectedError("design review replies are invalid");
  const seen = new Set<number>();
  return Object.freeze(value.map((reply) => {
    if (
      !Number.isSafeInteger(reply.commentId) || reply.commentId <= 0 || seen.has(reply.commentId) ||
      typeof reply.body !== "string" || reply.body.trim() !== reply.body ||
      reply.body.length < 1 || reply.body.length > 1_000 || reply.body.includes("<!--")
    ) throw new DesignCandidateRejectedError("design review reply is invalid");
    seen.add(reply.commentId);
    return Object.freeze({ commentId: reply.commentId, body: reply.body });
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
  if (new TextEncoder().encode(input.content).byteLength > DESIGN_CANDIDATE_CONTEXT_LIMIT) {
    throw new DesignCandidateRejectedError("design candidate exceeds the revision context limit");
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
  const designDigest = await sha256Hex(input.content);
  const byteSize = new TextEncoder().encode(input.content).byteLength;
  const candidateDigest = await sha256Hex(JSON.stringify({
    baseCommit: input.baseCommit,
    change: input.change,
    path: input.path,
    byteSize,
    designDigest,
    reviewReplies,
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
    candidateDigest,
  };
  if (new TextEncoder().encode(JSON.stringify(candidateValue)).byteLength > DESIGN_CANDIDATE_CONTEXT_LIMIT) {
    throw new DesignCandidateRejectedError("design candidate exceeds the revision context limit");
  }
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
  const prefix = `runs/${encodeURIComponent(input.candidate.runId)}/design-candidates/${input.candidate.candidateId}`;
  const candidateR2Key = `${prefix}/design-candidate.json`;
  const validationR2Key = `${prefix}/candidate-validation.json`;
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
