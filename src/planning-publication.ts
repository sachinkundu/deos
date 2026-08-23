export interface PlanningFile {
  path: string;
  content: string;
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
}

const normalize = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim()
  .replace(/\s+/g, " ");

const words = (value: string): string[] => normalize(value).split(" ").filter(Boolean);

const syllables = (word: string): number => {
  const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized.length <= 3) return 1;
  const withoutSilentE = normalized.replace(/(?:[^l]e|ed|es)$/, "");
  const groups = withoutSilentE.match(/[aeiouy]+/g)?.length ?? 1;
  return Math.max(1, groups);
};

export const scoreReadability = (value: string): {
  fleschReadingEase: number;
  fleschKincaidGrade: number;
} => {
  const tokens = words(value);
  const sentenceCount = Math.max(1, value.split(/[.!?]+/).filter((part) => part.trim().length > 0).length);
  const syllableCount = tokens.reduce((total, token) => total + syllables(token), 0);
  const perSentence = tokens.length / sentenceCount;
  const perWord = syllableCount / Math.max(1, tokens.length);
  return {
    fleschReadingEase: Number((206.835 - 1.015 * perSentence - 84.6 * perWord).toFixed(2)),
    fleschKincaidGrade: Number((0.39 * perSentence + 11.8 * perWord - 15.59).toFixed(2)),
  };
};

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
  if ([".openspec.yaml", "proposal.md", "design.md", "tasks.md"].includes(relative)) {
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
    throw new Error("planning pull-request body header is invalid");
  }
  const reviewOrderIndex = lines.indexOf("## Review order");
  if (reviewOrderIndex < 6 || lines[reviewOrderIndex - 1] !== "") {
    throw new Error("planning pull-request review notes are invalid");
  }
  const notes = lines.slice(4, reviewOrderIndex - 1);
  if (
    notes.length < 1 || notes.length > 3 ||
    notes.some((line) => !line.startsWith("- ") || line.length < 12 || line.length > 260)
  ) throw new Error("planning pull-request review notes are invalid");
  const noteText = notes.map((line) => line.slice(2));
  if (noteText.some((note) => note.split(/[.!?]+/).filter((part) => part.trim()).length !== 1)) {
    throw new Error("planning pull-request review notes must be single sentences");
  }
  const expectedReviewOrder = [
    "## Review order",
    "1. proposal.md",
    `2. Specs: ${specPaths.join(", ")}`,
    "3. design.md",
    "4. tasks.md",
    "",
    "## Validation",
  ];
  if (expectedReviewOrder.some((line, index) => lines[reviewOrderIndex + index] !== line)) {
    throw new Error("planning pull-request review order is invalid");
  }
  const validation = lines.slice(reviewOrderIndex + expectedReviewOrder.length);
  if (
    validation.length < 1 ||
    validation.some((line) => !line.startsWith("- ") || !line.includes(" — ") || line.length > 500)
  ) throw new Error("planning pull-request validation list is invalid");
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
    request.body.length > 20_000 ||
    request.files.length < 5 || request.files.length > 50
  ) throw new Error("planning publication request is invalid");

  const sortedFiles = [...request.files].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  const relative = sortedFiles.map((file) => {
    if (
      seen.has(file.path) ||
      file.content.length > 1_000_000 ||
      typeof file.content !== "string"
    ) throw new Error("planning publication files are invalid");
    seen.add(file.path);
    const path = relativePath(request.change, file.path);
    if (path === null) throw new Error("planning publication path is forbidden");
    return path;
  });
  for (const required of [".openspec.yaml", "proposal.md", "design.md", "tasks.md"]) {
    if (!relative.includes(required)) throw new Error(`planning publication is missing ${required}`);
  }
  const specPaths = relative.filter((path) => path.startsWith("specs/")).sort();
  if (specPaths.length === 0) throw new Error("planning publication requires a delta specification");
  const notes = parseBody(request, context, specPaths);
  if (notes.some((note) => /\b(?:no|without) implementation\b|\bimplementation is (?:absent|not included)\b/i.test(note))) {
    throw new Error("planning pull-request notes contain an implementation-status statement");
  }
  if (copiedLinearContent(notes, context)) {
    throw new Error("planning pull-request notes repeat Linear content");
  }
  const readability = scoreReadability(notes.join(" "));
  if (
    readability.fleschReadingEase < 65 ||
    readability.fleschReadingEase > 80 ||
    readability.fleschKincaidGrade > 8
  ) throw new Error("planning pull-request review notes are outside readability limits");
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
