import { scoreReadability } from "./planning-publication.ts";
import { sha256Hex, type ReviewedSource } from "./trace-review.ts";

export class PlanningCandidateRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanningCandidateRejectedError";
  }
}

export interface CandidateFile {
  path: string;
  content: string;
}

export interface CandidateFileReceipt {
  path: string;
  content: string;
  byteSize: number;
  sha256: string;
}

export interface PlanningCandidate {
  version: 1;
  candidateId: string;
  runId: string;
  round: number;
  sourceAttemptId: string;
  baseCommit: string;
  change: string;
  files: readonly CandidateFileReceipt[];
  reviewReplies: readonly PlanningCandidateReviewReply[];
  candidateDigest: string;
  reviewSetDigest: string;
}

export interface PlanningCandidateReviewReply {
  commentId: number;
  body: string;
}

export interface CandidateValidation {
  version: 1;
  candidateId: string;
  allowedPaths: "passed";
  strictOpenSpec: "passed";
  readability: "passed";
  readabilityByFile: Readonly<Record<string, ReturnType<typeof scoreReadability>>>;
  checkedAt: string;
}

export interface CandidateEvidence {
  candidate: PlanningCandidate;
  validation: CandidateValidation;
  candidateR2Key: string;
  candidateSha256: string;
  validationR2Key: string;
  validationSha256: string;
}

export interface CandidateBuildInput {
  candidateId: string;
  runId: string;
  round: number;
  sourceAttemptId: string;
  baseCommit: string;
  change: string;
  files: readonly CandidateFile[];
  reviewReplies: readonly PlanningCandidateReviewReply[];
  strictOpenSpecCheck: (change: string, files: readonly CandidateFile[]) => Promise<void>;
  checkedAt: string;
}

const safePath = (change: string, path: string): boolean => {
  const root = `openspec/changes/${change}/`;
  if (!path.startsWith(root) || path.includes("..") || path.includes("//")) return false;
  const relative = path.slice(root.length);
  return relative === ".openspec.yaml" || relative === "proposal.md" ||
    /^specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/.test(relative);
};

const proseForReadability = (value: string): string => {
  let inCode = false;
  const lines: string[] = [];
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (
      inCode || trimmed.length === 0 || trimmed.startsWith("#") ||
      trimmed.startsWith("|") || trimmed.startsWith("flowchart ") ||
      trimmed.startsWith("stateDiagram") || trimmed.startsWith("%%")
    ) continue;
    lines.push(trimmed
      .replace(/https?:\/\/\S+/g, "")
      .replace(/`[^`]+`/g, "")
      .replace(/\b[a-f0-9]{16,}\b/gi, "")
      .replace(/\b[A-Z][A-Z0-9]+-[0-9]+\b/g, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, ""));
  }
  return lines.join(" ");
};

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

const writeAndReadBack = async (
  bucket: R2Bucket,
  key: string,
  content: Uint8Array,
  sha256: string,
): Promise<void> => {
  const written = await bucket.put(key, content, {
    onlyIf: { etagDoesNotMatch: "*" },
    sha256,
    httpMetadata: { contentType: "application/json" },
    customMetadata: { policy: "deos-trace-review-v1", sha256 },
  });
  if (written === null) {
    const existing = await bucket.get(key);
    if (existing === null || await sha256Hex(new Uint8Array(await existing.arrayBuffer())) !== sha256) {
      throw new Error("candidate evidence create-only conflict");
    }
  }
  const readBack = await bucket.get(key);
  if (readBack === null || await sha256Hex(new Uint8Array(await readBack.arrayBuffer())) !== sha256) {
    throw new Error("candidate evidence read-back failed");
  }
};

export const buildPlanningCandidate = async (
  input: CandidateBuildInput,
): Promise<{ candidate: PlanningCandidate; validation: CandidateValidation; reviewedSources: readonly ReviewedSource[] }> => {
  if (!/^[a-z0-9][a-z0-9:._-]{7,199}$/.test(input.candidateId)) throw new Error("candidate id is invalid");
  if (!/^[a-z0-9][a-z0-9:._/-]{7,299}$/.test(input.runId)) throw new Error("candidate run is invalid");
  if (!Number.isSafeInteger(input.round) || input.round < 1) throw new Error("candidate round is invalid");
  if (!/^[0-9a-f]{40}$/.test(input.baseCommit)) throw new Error("candidate base commit is invalid");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.change)) throw new Error("candidate change is invalid");
  if (input.files.length < 3 || input.files.length > 64) throw new Error("candidate file count is invalid");
  if (!Array.isArray(input.reviewReplies) || input.reviewReplies.length > 50) {
    throw new Error("candidate review replies are invalid");
  }
  const replyIds = new Set<number>();
  const reviewReplies = input.reviewReplies.map((reply) => {
    if (
      !Number.isSafeInteger(reply.commentId) || reply.commentId <= 0 || replyIds.has(reply.commentId) ||
      typeof reply.body !== "string" || reply.body.trim() !== reply.body ||
      reply.body.length < 1 || reply.body.length > 1_000 || reply.body.includes("<!--")
    ) throw new Error("candidate review reply is invalid");
    replyIds.add(reply.commentId);
    return Object.freeze({ commentId: reply.commentId, body: reply.body });
  });

  const files = [...input.files].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  for (const file of files) {
    if (
      seen.has(file.path) || !safePath(input.change, file.path) ||
      typeof file.content !== "string" || new TextEncoder().encode(file.content).byteLength > 1_000_000
    ) throw new Error("candidate contains an invalid file");
    seen.add(file.path);
  }
  const root = `openspec/changes/${input.change}/`;
  if (!seen.has(`${root}.openspec.yaml`) || !seen.has(`${root}proposal.md`)) {
    throw new Error("candidate is incomplete");
  }
  if (![...seen].some((path) => path.startsWith(`${root}specs/`))) throw new Error("candidate has no delta spec");

  await input.strictOpenSpecCheck(input.change, Object.freeze(files));
  const readabilityByFile: Record<string, ReturnType<typeof scoreReadability>> = {};
  for (const file of files.filter((candidate) => candidate.path.endsWith(".md"))) {
    const prose = proseForReadability(file.content);
    const score = scoreReadability(prose);
    if (score.fleschReadingEase < 70 || score.fleschKincaidGrade > 8) {
      throw new Error(`candidate readability failed for ${file.path}`);
    }
    readabilityByFile[file.path] = score;
  }
  const receipts = await Promise.all(files.map(async (file) => ({
    path: file.path,
    content: file.content,
    byteSize: new TextEncoder().encode(file.content).byteLength,
    sha256: await sha256Hex(file.content),
  })));
  const reviewReceipts = receipts
    .filter((file) => file.path.endsWith("proposal.md") || file.path.includes("/specs/"))
    .map((file) => ({ path: file.path.slice(root.length), sha256: file.sha256 }));
  const candidateDigest = await sha256Hex(JSON.stringify({
    files: receipts.map(({ content: _content, ...file }) => file),
    reviewReplies,
  }));
  const reviewSetDigest = await sha256Hex(JSON.stringify(reviewReceipts));
  const candidate: PlanningCandidate = Object.freeze({
    version: 1,
    candidateId: input.candidateId,
    runId: input.runId,
    round: input.round,
    sourceAttemptId: input.sourceAttemptId,
    baseCommit: input.baseCommit,
    change: input.change,
    files: Object.freeze(receipts),
    reviewReplies: Object.freeze(reviewReplies),
    candidateDigest,
    reviewSetDigest,
  });
  const validation: CandidateValidation = Object.freeze({
    version: 1,
    candidateId: input.candidateId,
    allowedPaths: "passed",
    strictOpenSpec: "passed",
    readability: "passed",
    readabilityByFile: Object.freeze(readabilityByFile),
    checkedAt: input.checkedAt,
  });
  return { candidate, validation, reviewedSources: Object.freeze(reviewReceipts) };
};

export const persistCandidateEvidence = async (
  bucket: R2Bucket,
  input: { candidate: PlanningCandidate; validation: CandidateValidation },
): Promise<CandidateEvidence> => {
  const prefix = `runs/${encodeURIComponent(input.candidate.runId)}/planning-candidates/${input.candidate.candidateId}`;
  const candidateR2Key = `${prefix}/planning-candidate.json`;
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
