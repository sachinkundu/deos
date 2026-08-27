export const TRACE_REVIEW_STAGES = ["self_check", "independent"] as const;
export const TRACE_REVIEW_MODES = ["discovery", "recheck"] as const;
export const FINDING_RESOLUTIONS = [
  "fixed",
  "partially_fixed",
  "still_present",
  "cannot_verify",
] as const;

export type TraceReviewStage = typeof TRACE_REVIEW_STAGES[number];
export type TraceReviewMode = typeof TRACE_REVIEW_MODES[number];
export type FindingResolution = typeof FINDING_RESOLUTIONS[number];
export type TraceReviewProvider = "codex" | "openrouter";

export interface TraceReviewModel {
  provider: TraceReviewProvider;
  model: string;
  reasoning: string;
}

export interface ReviewedSource {
  path: string;
  sha256: string;
}

export interface FindingRange {
  path: string;
  startLine: number;
  endLine: number;
}

export interface TraceFinding {
  id: string;
  type: "missing_coverage" | "unsupported_requirement" | "over_specified" | "ambiguous";
  message: string;
  capability: string;
  allowedRanges: readonly FindingRange[];
}

export interface FindingRecheck {
  findingId: string;
  status: FindingResolution;
  rationale: string;
  currentEvidence: readonly FindingRange[];
  causalSourceDigest: string | null;
}

export interface TraceDiscoveryResult {
  mode: "discovery";
  findings: readonly TraceFinding[];
  sidecar: Readonly<Record<string, unknown>>;
}

export interface TraceRecheckResult {
  mode: "recheck";
  baselineFindingSetDigest: string;
  resolutions: readonly FindingRecheck[];
  sidecar: Readonly<Record<string, unknown>>;
}

export interface TraceReviewInput {
  stage: TraceReviewStage;
  mode: TraceReviewMode;
  round: number;
  candidateDigest: string;
  reviewedHeadSha: string | null;
  sources: readonly ReviewedSource[];
  baselineFindingSetDigest: string | null;
  author: TraceReviewModel;
  reviewer: TraceReviewModel;
  promptVersion: string;
  promptSha256: string;
  toolVersion: string;
  bundleSha256: string;
}

export interface DerivedReviewOutcome {
  outcome: "pass" | "findings" | "proof_conflict";
  openFindingIds: readonly string[];
  conflictingFindingIds: readonly string[];
}

const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HEAD_SHA = /^[a-f0-9]{40}$/;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

export const sha256Hex = async (value: string | Uint8Array): Promise<string> => {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const assertSafeText = (value: string, label: string, maximum = 4_000): void => {
  if (value.trim() !== value || value.length === 0 || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
};

const assertRange = (range: FindingRange, label: string): void => {
  if (
    !/^openspec\/changes\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:proposal\.md|specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md)$/.test(range.path) ||
    !Number.isSafeInteger(range.startLine) || range.startLine < 1 ||
    !Number.isSafeInteger(range.endLine) || range.endLine < range.startLine
  ) throw new Error(`${label} is invalid`);
};

export const validateReviewedSources = (sources: readonly ReviewedSource[]): readonly ReviewedSource[] => {
  if (sources.length < 2 || sources.length > 64) throw new Error("reviewed source list is invalid");
  const sorted = [...sources].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  for (const source of sorted) {
    if (
      seen.has(source.path) ||
      !/^(?:proposal\.md|specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md)$/.test(source.path) ||
      !SHA256.test(source.sha256)
    ) throw new Error("reviewed source list is invalid");
    seen.add(source.path);
  }
  if (sorted[0]?.path !== "proposal.md") throw new Error("reviewed source list must include proposal.md");
  return Object.freeze(sorted);
};

const validateFinding = (finding: TraceFinding, seen: Set<string>): TraceFinding => {
  if (!SAFE_ID.test(finding.id) || seen.has(finding.id)) throw new Error("finding id is invalid");
  seen.add(finding.id);
  if (!["missing_coverage", "unsupported_requirement", "over_specified", "ambiguous"].includes(finding.type)) {
    throw new Error(`finding ${finding.id} has an invalid type`);
  }
  assertSafeText(finding.message, `finding ${finding.id} message`);
  assertSafeText(finding.capability, `finding ${finding.id} capability`, 240);
  if (finding.allowedRanges.length === 0 || finding.allowedRanges.length > 16) {
    throw new Error(`finding ${finding.id} ranges are invalid`);
  }
  finding.allowedRanges.forEach((range, index) => assertRange(range, `finding ${finding.id} range ${index}`));
  return Object.freeze({ ...finding, allowedRanges: Object.freeze([...finding.allowedRanges]) });
};

export const normalizeFindingSet = (findings: readonly TraceFinding[]): readonly TraceFinding[] => {
  if (findings.length > 100) throw new Error("finding set is too large");
  const seen = new Set<string>();
  return Object.freeze(
    [...findings]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((finding) => validateFinding(finding, seen)),
  );
};

export const findingSetDigest = async (findings: readonly TraceFinding[]): Promise<string> =>
  sha256Hex(JSON.stringify(canonicalize(normalizeFindingSet(findings))));

export const reviewInputId = async (input: TraceReviewInput): Promise<string> => {
  if (!TRACE_REVIEW_STAGES.includes(input.stage) || !TRACE_REVIEW_MODES.includes(input.mode)) {
    throw new Error("review stage or mode is invalid");
  }
  if (!Number.isSafeInteger(input.round) || input.round < 1) throw new Error("review round is invalid");
  if (!SHA256.test(input.candidateDigest)) throw new Error("candidate digest is invalid");
  if (input.reviewedHeadSha !== null && !HEAD_SHA.test(input.reviewedHeadSha)) {
    throw new Error("reviewed head is invalid");
  }
  if (input.stage === "independent" && input.reviewedHeadSha === null) {
    throw new Error("independent review requires a head");
  }
  if (input.mode === "recheck" && !SHA256.test(input.baselineFindingSetDigest ?? "")) {
    throw new Error("recheck requires a baseline finding set");
  }
  if (input.mode === "discovery" && input.baselineFindingSetDigest !== null) {
    throw new Error("discovery cannot name a baseline finding set");
  }
  for (const model of [input.author, input.reviewer]) {
    if (!(["codex", "openrouter"] as const).includes(model.provider)) throw new Error("review model provider is invalid");
    assertSafeText(model.model, "review model", 240);
    assertSafeText(model.reasoning, "review reasoning", 80);
  }
  if (input.stage === "self_check" && JSON.stringify(input.author) !== JSON.stringify(input.reviewer)) {
    throw new Error("self-check model must match the author model");
  }
  if (input.stage === "independent" && input.reviewer.provider !== "openrouter") {
    throw new Error("independent review must use OpenRouter");
  }
  if (input.stage === "independent" && input.reviewer.model === input.author.model) {
    throw new Error("independent model must differ from the author model");
  }
  for (const [label, digest] of [
    ["prompt", input.promptSha256],
    ["bundle", input.bundleSha256],
  ] as const) {
    if (!SHA256.test(digest)) throw new Error(`${label} digest is invalid`);
  }
  assertSafeText(input.promptVersion, "prompt version", 240);
  assertSafeText(input.toolVersion, "tool version", 240);
  const sources = validateReviewedSources(input.sources);
  return sha256Hex(JSON.stringify(canonicalize({ ...input, sources })));
};

export const validateClosedSetRecheck = async (
  baseline: readonly TraceFinding[],
  result: TraceRecheckResult,
): Promise<readonly FindingRecheck[]> => {
  const normalizedBaseline = normalizeFindingSet(baseline);
  const expectedDigest = await findingSetDigest(normalizedBaseline);
  if (result.mode !== "recheck" || result.baselineFindingSetDigest !== expectedDigest) {
    throw new Error("recheck baseline finding set changed");
  }
  if (result.resolutions.length !== normalizedBaseline.length) {
    throw new Error("recheck must rate every baseline finding once");
  }
  const expectedIds = normalizedBaseline.map((finding) => finding.id);
  const sorted = [...result.resolutions].sort((left, right) => left.findingId.localeCompare(right.findingId));
  if (sorted.some((resolution, index) => resolution.findingId !== expectedIds[index])) {
    throw new Error("recheck changed the baseline finding inventory");
  }
  for (const resolution of sorted) {
    if (!FINDING_RESOLUTIONS.includes(resolution.status)) {
      throw new Error(`finding ${resolution.findingId} has an invalid status`);
    }
    assertSafeText(resolution.rationale, `finding ${resolution.findingId} rationale`);
    if (resolution.currentEvidence.length === 0 || resolution.currentEvidence.length > 32) {
      throw new Error(`finding ${resolution.findingId} evidence is invalid`);
    }
    resolution.currentEvidence.forEach((range, index) =>
      assertRange(range, `finding ${resolution.findingId} evidence ${index}`));
    if (resolution.causalSourceDigest !== null && !SHA256.test(resolution.causalSourceDigest)) {
      throw new Error(`finding ${resolution.findingId} causal source digest is invalid`);
    }
  }
  return Object.freeze(sorted.map((resolution) => Object.freeze({
    ...resolution,
    currentEvidence: Object.freeze([...resolution.currentEvidence]),
  })));
};

export const deriveReviewOutcome = (
  resolutions: readonly FindingRecheck[],
  priorFixed: ReadonlySet<string> = new Set<string>(),
): DerivedReviewOutcome => {
  const conflictingFindingIds = resolutions
    .filter((resolution) => priorFixed.has(resolution.findingId) && resolution.status !== "fixed" && resolution.causalSourceDigest === null)
    .map((resolution) => resolution.findingId)
    .sort();
  const openFindingIds = resolutions
    .filter((resolution) => resolution.status !== "fixed")
    .map((resolution) => resolution.findingId)
    .sort();
  return Object.freeze({
    outcome: conflictingFindingIds.length > 0
      ? "proof_conflict"
      : openFindingIds.length === 0 ? "pass" : "findings",
    openFindingIds: Object.freeze(openFindingIds),
    conflictingFindingIds: Object.freeze(conflictingFindingIds),
  });
};

export const canBindReviewToHead = (
  acceptedSources: readonly ReviewedSource[],
  currentSources: readonly ReviewedSource[],
): boolean => JSON.stringify(validateReviewedSources(acceptedSources)) ===
  JSON.stringify(validateReviewedSources(currentSources));

export const nextRepairTurn = (current: number): number => {
  if (!Number.isSafeInteger(current) || current < 0 || current >= 3) {
    throw new Error("shared author-repair limit is exhausted");
  }
  return current + 1;
};
