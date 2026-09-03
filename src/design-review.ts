export const DESIGN_REVIEW_PHASES = ["self", "independent"] as const;
export const DESIGN_REVIEW_OUTCOMES = ["pass", "concerns"] as const;
export const DESIGN_FINDING_SEVERITIES = ["low", "medium", "high"] as const;
export const DESIGN_FINDING_CATEGORIES = [
  "correctness", "completeness", "consistency", "security", "operability",
] as const;
export const DESIGN_DISPOSITIONS = ["applied", "declined", "no_change"] as const;

export type DesignReviewPhase = typeof DESIGN_REVIEW_PHASES[number];
export type DesignReviewOutcome = typeof DESIGN_REVIEW_OUTCOMES[number];
export type DesignDispositionStatus = typeof DESIGN_DISPOSITIONS[number];

export interface DesignReviewSource { path: string; sha256: string }

export interface DesignReviewInput {
  version: 1;
  runId: string;
  round: number;
  phase: DesignReviewPhase;
  candidateId: string;
  candidateSha256: string;
  approvedPlanManifestSha256: string;
  baseCommit: string;
  guidanceManifestSha256: string;
  sources: readonly DesignReviewSource[];
  modelProvider: "codex" | "openrouter";
  model: string;
  reasoning: string;
  pullRequestDatabaseId: string | null;
  headSha: string | null;
}

export interface DesignFindingRange { path: string; startLine: number; endLine: number }

export interface DesignReviewFinding {
  id: string;
  severity: typeof DESIGN_FINDING_SEVERITIES[number];
  category: typeof DESIGN_FINDING_CATEGORIES[number];
  message: string;
  sourceRanges: readonly DesignFindingRange[];
}

export interface DesignReviewResult {
  version: 1;
  inputSha256: string;
  phase: DesignReviewPhase;
  outcome: DesignReviewOutcome;
  summary: string;
  findings: readonly DesignReviewFinding[];
}

export interface DesignReviewDisposition {
  findingId: string;
  status: DesignDispositionStatus;
  reason: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const HEAD_SHA = /^[a-f0-9]{40}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RUN_ID = /^[A-Za-z0-9:._-]{3,512}$/;
const SOURCE_PATH = /^(?:openspec\/changes\/[a-z0-9]+(?:-[a-z0-9]+)*\/(?:\.openspec\.yaml|proposal\.md|design\.md|specs\/[a-z0-9]+(?:-[a-z0-9]+)*\/spec\.md)|(?:AGENTS|agents)\.md|architecture(?:-[A-Za-z0-9_.-]+)?\.md|docs\/current-architecture\.md)$/;

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, canonicalize(nested)]));
};

export const designReviewSha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const canonicalDesignReviewJson = (value: unknown): string => JSON.stringify(canonicalize(value));

const validText = (value: string, label: string, maximum?: number): void => {
  if (
    value.trim() !== value || value.length === 0 ||
    (maximum !== undefined && value.length > maximum) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  ) throw new Error(`${label} is invalid`);
};

const validateSources = (sources: readonly DesignReviewSource[]): readonly DesignReviewSource[] => {
  if (sources.length < 2) throw new Error("design review sources are invalid");
  const sorted = [...sources].sort((left, right) => left.path.localeCompare(right.path));
  const seen = new Set<string>();
  for (const source of sorted) {
    if (seen.has(source.path) || !SOURCE_PATH.test(source.path) || !SHA256.test(source.sha256)) {
      throw new Error("design review source is invalid");
    }
    seen.add(source.path);
  }
  if (!sorted.some((source) => source.path.endsWith("/design.md"))) {
    throw new Error("design review sources must include design.md");
  }
  return Object.freeze(sorted.map((source) => Object.freeze({ ...source })));
};

export const validateDesignReviewInput = async (
  input: DesignReviewInput,
): Promise<{ input: DesignReviewInput; inputSha256: string; encoded: string }> => {
  if (
    input.version !== 1 || !RUN_ID.test(input.runId) ||
    !Number.isSafeInteger(input.round) || input.round < 1 ||
    !DESIGN_REVIEW_PHASES.includes(input.phase) || !input.candidateId.startsWith("design:") ||
    !SHA256.test(input.candidateSha256) || !SHA256.test(input.approvedPlanManifestSha256) ||
    !HEAD_SHA.test(input.baseCommit) || !SHA256.test(input.guidanceManifestSha256)
  ) throw new Error("design review input identity is invalid");
  validText(input.model, "design review model", 240);
  validText(input.reasoning, "design review reasoning", 80);
  if (input.phase === "self") {
    if (input.modelProvider !== "codex" || input.pullRequestDatabaseId !== null || input.headSha !== null) {
      throw new Error("self design review input is invalid");
    }
  } else if (
    input.modelProvider !== "openrouter" || input.pullRequestDatabaseId === null ||
    input.pullRequestDatabaseId.length > 240 || !HEAD_SHA.test(input.headSha ?? "")
  ) throw new Error("independent design review input is invalid");
  const normalized = Object.freeze({ ...input, sources: validateSources(input.sources) });
  const encoded = canonicalDesignReviewJson(normalized);
  return Object.freeze({ input: normalized, inputSha256: await designReviewSha256(encoded), encoded });
};

export const validateDesignReviewResult = (
  result: DesignReviewResult,
  expected: { inputSha256: string; phase: DesignReviewPhase; sourcePaths: ReadonlySet<string> },
): DesignReviewResult => {
  if (
    result.version !== 1 || result.inputSha256 !== expected.inputSha256 ||
    result.phase !== expected.phase || !DESIGN_REVIEW_OUTCOMES.includes(result.outcome)
  ) throw new Error("design review result identity is invalid");
  validText(result.summary, "design review summary");
  if (!Array.isArray(result.findings)) {
    throw new Error("design review finding inventory is invalid");
  }
  const seen = new Set<string>();
  const findings = [...result.findings].sort((left, right) => left.id.localeCompare(right.id)).map((finding) => {
    if (
      !SAFE_ID.test(finding.id) || seen.has(finding.id) ||
      !DESIGN_FINDING_SEVERITIES.includes(finding.severity) ||
      !DESIGN_FINDING_CATEGORIES.includes(finding.category)
    ) throw new Error("design review finding identity is invalid");
    seen.add(finding.id);
    validText(finding.message, `design review finding ${finding.id}`);
    if (!Array.isArray(finding.sourceRanges) || finding.sourceRanges.length === 0) {
      throw new Error(`design review finding ${finding.id} ranges are invalid`);
    }
    const sourceRanges = finding.sourceRanges.map((range: DesignFindingRange) => {
      if (
        !expected.sourcePaths.has(range.path) || !Number.isSafeInteger(range.startLine) || range.startLine < 1 ||
        !Number.isSafeInteger(range.endLine) || range.endLine < range.startLine
      ) throw new Error(`design review finding ${finding.id} range is invalid`);
      return Object.freeze({ ...range });
    });
    return Object.freeze({ ...finding, sourceRanges: Object.freeze(sourceRanges) });
  });
  if ((result.outcome === "pass") !== (findings.length === 0)) {
    throw new Error("design review outcome does not match its finding inventory");
  }
  return Object.freeze({ ...result, findings: Object.freeze(findings) });
};

export const validateDesignReviewDispositions = (
  findings: readonly Pick<DesignReviewFinding, "id">[],
  dispositions: readonly DesignReviewDisposition[],
): readonly DesignReviewDisposition[] => {
  if (!Array.isArray(dispositions) || dispositions.length !== findings.length) {
    throw new Error("design review disposition inventory is incomplete");
  }
  const expected = [...findings].map((finding) => finding.id).sort();
  const sorted = [...dispositions].sort((left, right) => left.findingId.localeCompare(right.findingId));
  if (sorted.some((disposition, index) => disposition.findingId !== expected[index])) {
    throw new Error("design review disposition inventory changed");
  }
  return Object.freeze(sorted.map((disposition) => {
    if (!DESIGN_DISPOSITIONS.includes(disposition.status)) {
      throw new Error(`design review disposition ${disposition.findingId} is invalid`);
    }
    validText(disposition.reason, `design review disposition ${disposition.findingId}`);
    return Object.freeze({ ...disposition });
  }));
};

export const designReviewGateEligible = (input: {
  selfRequired: boolean;
  selfAccepted: { candidateId: string; outcome: string } | null;
  publishedCandidateId: string;
  independentAccepted: {
    candidateId: string;
    prDatabaseId: string | null;
    headSha: string | null;
    outcome: string;
    findingCount: number;
    dispositionCount: number;
  } | null;
  currentPrDatabaseId: string;
  currentHeadSha: string;
  unresolvedAttempts: number;
}): boolean =>
  (!input.selfRequired || (
    input.selfAccepted !== null && input.selfAccepted.outcome === "pass"
  )) &&
  input.independentAccepted?.candidateId === input.publishedCandidateId &&
  input.independentAccepted.prDatabaseId === input.currentPrDatabaseId &&
  input.independentAccepted.headSha === input.currentHeadSha &&
  ["pass", "concerns"].includes(input.independentAccepted.outcome) &&
  input.independentAccepted.findingCount === input.independentAccepted.dispositionCount &&
  input.unresolvedAttempts === 0;
