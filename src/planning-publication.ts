import {
  MAXIMUM_FLESCH_KINCAID_GRADE,
  MINIMUM_FLESCH_READING_EASE,
  proseForReadability,
  readabilityPassed,
  readabilityWords,
  scoreReadability,
} from "../shared/planning-language.mjs";

export { scoreReadability } from "../shared/planning-language.mjs";

export interface PlanningFile {
  path: string;
  content: string;
}

export interface PlanningReviewReply {
  commentId: number;
  body: string;
}

export interface PlanningPublicationRequest {
  version: 1;
  action: "publish_planning_work_product";
  operationKey: string;
  repository: string;
  baseBranch: "main";
  change: string;
  title: string;
  body: string;
  files: readonly PlanningFile[];
  reviewReplies: readonly PlanningReviewReply[];
}

export interface PlanningPublicationContext {
  issueIdentifier: string;
  issueUrl: string;
  issueTitle: string;
  issueDescription: string | null;
}

export interface ValidatedPlanningPublication extends PlanningPublicationRequest {
  files: readonly PlanningFile[];
  manifestDigest: string;
  manifestJson: string;
  reviewNotes: readonly string[];
  readability: {
    fleschReadingEase: number;
    fleschKincaidGrade: number;
  };
  fileReadability: Readonly<Record<string, {
    fleschReadingEase: number;
    fleschKincaidGrade: number;
  }>>;
}

export type PlanningPublicationErrorCategory =
  | "planning_request_invalid"
  | "planning_files_invalid"
  | "planning_body_invalid"
  | "planning_review_replies_invalid"
  | "planning_linear_content_copied"
  | "planning_readability_invalid"
  | "planning_validation_evidence_invalid";

export class PlanningPublicationValidationError extends Error {
  readonly safeCategory: PlanningPublicationErrorCategory;

  constructor(safeCategory: PlanningPublicationErrorCategory) {
    super(safeCategory);
    this.name = "PlanningPublicationValidationError";
    this.safeCategory = safeCategory;
  }
}

const invalid = (safeCategory: PlanningPublicationErrorCategory): never => {
  throw new PlanningPublicationValidationError(safeCategory);
};

const normalize = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const words = readabilityWords;

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const safeChange = (value: string): boolean => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);

const relativePath = (change: string, path: string): string | null => {
  const prefix = `openspec/changes/${change}/`;
  if (!path.startsWith(prefix)) return null;
  const relative = path.slice(prefix.length);
  if (
    relative.includes("..") ||
    relative.startsWith("/") ||
    relative.endsWith("/")
  ) return null;
  if ([".openspec.yaml", "proposal.md"].includes(relative)) {
    return relative;
  }
  return /^specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md$/.test(relative) ? relative : null;
};

const copiedLinearContent = (
  notes: readonly string[],
  context: PlanningPublicationContext,
): boolean => {
  const normalizedNotes = normalize(notes.join(" "));
  const sources = [context.issueTitle, ...(context.issueDescription?.split(/[.!?\n]+/) ?? [])]
    .map(normalize)
    .filter((source) => words(source).length >= 4);
  for (const source of sources) {
    if (normalizedNotes.includes(source)) return true;
    const sourceWords = new Set(words(source));
    const shared = [...sourceWords].filter((word) => normalizedNotes.split(" ").includes(word));
    if (sourceWords.size >= 5 && shared.length / sourceWords.size >= 0.8) return true;
  }
  return false;
};

const parseBody = (
  request: PlanningPublicationRequest,
  context: PlanningPublicationContext,
  specPaths: readonly string[],
): readonly string[] => {
  const lines = request.body.split("\n");
  const expectedPrefix = [
    `Linear: [${context.issueIdentifier}](${context.issueUrl})`,
    `OpenSpec change: ${request.change}`,
    "",
    "## Review notes",
  ];
  if (expectedPrefix.some((line, index) => lines[index] !== line)) {
    invalid("planning_body_invalid");
  }
  const reviewOrderIndex = lines.indexOf("## Review order");
  if (reviewOrderIndex < 6 || lines[reviewOrderIndex - 1] !== "") {
    invalid("planning_body_invalid");
  }
  const notes = lines.slice(4, reviewOrderIndex - 1);
  if (
    notes.length < 1 || notes.length > 3 ||
    notes.some((line) => !line.startsWith("- ") || line.length < 12)
  ) invalid("planning_body_invalid");
  const noteText = notes.map((line) => line.slice(2));
  if (noteText.some((note) => note.split(/[.!?]+/).filter((part) => part.trim()).length !== 1)) {
    invalid("planning_body_invalid");
  }
  const expectedReviewOrder = [
    "## Review order",
    "1. proposal.md",
    `2. Specs: ${specPaths.join(", ")}`,
    "",
    "## Validation",
  ];
  if (expectedReviewOrder.some((line, index) => lines[reviewOrderIndex + index] !== line)) {
    invalid("planning_body_invalid");
  }
  const validation = lines.slice(reviewOrderIndex + expectedReviewOrder.length);
  if (
    validation.length < 1 ||
    validation.some((line) => !line.startsWith("- ") || !line.includes(" — "))
  ) invalid("planning_validation_evidence_invalid");
  return noteText;
};

export const validatePlanningPublication = async (
  request: PlanningPublicationRequest,
  context: PlanningPublicationContext,
): Promise<ValidatedPlanningPublication> => {
  if (
    request.version !== 1 ||
    request.action !== "publish_planning_work_product" ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(request.operationKey) ||
    request.operationKey.length < "planning-publish-x".length ||
    !request.operationKey.startsWith("planning-publish-") ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(request.repository) ||
    request.baseBranch !== "main" ||
    !safeChange(request.change) ||
    request.title !== `${context.issueIdentifier}: OpenSpec plan` ||
    request.files.length < 3 ||
    !Array.isArray(request.reviewReplies)
  ) invalid("planning_request_invalid");

  const reviewCommentIds = new Set<number>();
  for (const reply of request.reviewReplies) {
    if (
      !Number.isSafeInteger(reply.commentId) || reply.commentId <= 0 ||
      reviewCommentIds.has(reply.commentId) ||
      typeof reply.body !== "string" || reply.body.length < 1 ||
      reply.body.trim() !== reply.body || reply.body.includes("<!--") || reply.body.includes("-->")
    ) invalid("planning_review_replies_invalid");
    reviewCommentIds.add(reply.commentId);
  }

  const sortedFiles = [...request.files].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  const relative = sortedFiles.map((file) => {
    if (
      seen.has(file.path) ||
      typeof file.content !== "string"
    ) invalid("planning_files_invalid");
    seen.add(file.path);
    const path = relativePath(request.change, file.path);
    if (path === null) invalid("planning_files_invalid");
    return path as string;
  });
  for (const required of [".openspec.yaml", "proposal.md"]) {
    if (!relative.includes(required)) invalid("planning_files_invalid");
  }
  const specPaths = relative.filter((path) => path.startsWith("specs/")).sort();
  if (specPaths.length === 0) invalid("planning_files_invalid");
  const notes = parseBody(request, context, specPaths);
  if (notes.some((note) => /\b(?:no|without) implementation\b|\bimplementation is (?:absent|not included)\b/i.test(note))) {
    invalid("planning_body_invalid");
  }
  if (copiedLinearContent(notes, context)) {
    invalid("planning_linear_content_copied");
  }
  const readability = scoreReadability(notes.join(" "));
  if (
    readability.fleschReadingEase < MINIMUM_FLESCH_READING_EASE ||
    readability.fleschKincaidGrade > MAXIMUM_FLESCH_KINCAID_GRADE
  ) invalid("planning_readability_invalid");
  const validationLines = request.body.slice(request.body.indexOf("## Validation")).split("\n");
  if (!validationLines.includes(`- openspec validate ${request.change} --strict — passed`)) {
    invalid("planning_validation_evidence_invalid");
  }
  const reviewerFiles = sortedFiles.filter((file) => {
    const relative = relativePath(request.change, file.path);
    return relative === "proposal.md" || relative?.startsWith("specs/") === true;
  });
  const fileReadability: Record<string, ReturnType<typeof scoreReadability>> = {};
  for (const file of reviewerFiles) {
    const prose = proseForReadability(file.content);
    if (words(prose).length === 0) invalid("planning_readability_invalid");
    const score = scoreReadability(prose);
    if (!readabilityPassed(score)) {
      invalid("planning_readability_invalid");
    }
    fileReadability[file.path] = score;
  }
  const manifest = await Promise.all(sortedFiles.map(async (file) => ({
    path: file.path,
    sha256: await sha256Hex(file.content),
    byteSize: new TextEncoder().encode(file.content).byteLength,
  })));
  const manifestJson = JSON.stringify(manifest);
  return Object.freeze({
    ...request,
    files: Object.freeze(sortedFiles),
    manifestDigest: await sha256Hex(manifestJson),
    manifestJson,
    reviewNotes: Object.freeze(notes),
    readability,
    fileReadability: Object.freeze(fileReadability),
  });
};

export const manifestDigestFromFiles = async (
  files: readonly PlanningFile[],
): Promise<string> => {
  const sorted = [...files].sort((left, right) => left.path.localeCompare(right.path));
  const manifest = await Promise.all(sorted.map(async (file) => ({
    path: file.path,
    sha256: await sha256Hex(file.content),
    byteSize: new TextEncoder().encode(file.content).byteLength,
  })));
  return sha256Hex(JSON.stringify(manifest));
};
