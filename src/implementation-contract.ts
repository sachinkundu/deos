import { sha256Hex } from "./implementation-hash.ts";

export const IMPLEMENTATION_WORKFLOW = "implementation";
export type ProofKind =
  | "browser_image"
  | "showboat"
  | "provider_originated"
  | "synthetic_ingress"
  | "unit_test";
export interface ProofSubject {
  change: string;
  approvedDesignSha: string;
  testedBaseSha: string;
  treeSha: string;
}
export interface ProofRequirement {
  kinds: ProofKind[];
  reasons: string[];
  blockedProviders: string[];
}
export interface ImplementationPolicy {
  uiPaths: string[];
  providerPaths: string[];
  documentationHosts: string[];
  packageHosts: string[];
  safeAdapters: string[];
}
// This snapshot is copied into the immutable job definition, never looked up from a live agent input.
export const implementationPolicy: ImplementationPolicy = {
  uiPaths: [
    "portal/",
    "web/",
    "app/",
    "pages/",
    "components/",
    "src/components/",
    "src/App.",
    "public/",
  ],
  providerPaths: [
    "src/deos/ingress.py",
    "src/deos/worker.py",
    "src/entry.py",
    "src/linear-",
    "src/github-",
    "src/capability-",
  ],
  documentationHosts: [
    "developers.cloudflare.com",
    "docs.github.com",
    "linear.app",
    "developers.openai.com",
    "platform.openai.com",
    "docs.python.org",
    "nodejs.org",
    "www.typescriptlang.org",
    "react.dev",
    "vite.dev",
    "developer.mozilla.org",
    "web.dev",
    "vitest.dev",
    "docs.pytest.org",
    "docs.astral.sh",
    "docs.npmjs.com",
  ],
  packageHosts: ["registry.npmjs.org", "pypi.org", "files.pythonhosted.org"],
  safeAdapters: [],
};
export class ImplementationError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "ImplementationError";
  }
}
export class BaseChangedError extends ImplementationError {
  readonly actualBase: string;
  constructor(actualBase: string) {
    super("base_changed", `Target base changed to ${actualBase}`);
    this.actualBase = actualBase;
  }
}
export const requireSha = (value: string, label = "Git SHA"): string => {
  if (!/^[a-f0-9]{40}$/.test(value))
    throw new ImplementationError(
      "invalid_subject",
      `${label} is invalid: ${value}`,
    );
  return value;
};
export const implementationBranch = (
  identifier: string,
  sequence: number,
): string => {
  if (
    !/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/.test(identifier) ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1
  )
    throw new ImplementationError(
      "invalid_identity",
      "Implementation issue or run sequence is invalid",
    );
  return `deos/agent/${identifier}/run-${sequence}`;
};
export const subjectMatches = (a: ProofSubject, b: ProofSubject): boolean =>
  a.change === b.change &&
  a.approvedDesignSha === b.approvedDesignSha &&
  a.testedBaseSha === b.testedBaseSha &&
  a.treeSha === b.treeSha;

export function proofRequirements(input: {
  approvedText: string;
  paths: readonly string[];
  policy: ImplementationPolicy;
  prior?: ProofRequirement;
}): ProofRequirement {
  const kinds = new Set<ProofKind>(input.prior?.kinds ?? []);
  const reasons = new Set(input.prior?.reasons ?? []);
  const blocked = new Set(input.prior?.blockedProviders ?? []);
  const text = input.approvedText;
  const ui =
    input.paths.some((path) =>
      input.policy.uiPaths.some((prefix) => path.startsWith(prefix)),
    ) ||
    /\b(user interface|web app|web page|frontend|screen|browser image|visual proof|portal)\b/i.test(
      text,
    );
  const provider =
    input.paths.some((path) =>
      input.policy.providerPaths.some((prefix) => path.startsWith(prefix)),
    ) ||
    /\b(webhook|provider integration|provider-originated|provider event|oauth)\b/i.test(
      text,
    );
  if (ui) {
    kinds.add("browser_image");
    reasons.add("Approved behavior or changed paths require a browser image");
  }
  if (provider) {
    kinds.add("provider_originated");
    reasons.add("Provider behavior requires a real safe-resource event");
    if (!input.policy.safeAdapters.length)
      blocked.add("No checked safe provider adapter is configured");
  }
  if (!ui) {
    kinds.add("showboat");
    reasons.add(
      "Nonvisual behavior requires actual command and output evidence",
    );
  }
  return {
    kinds: [...kinds].sort(),
    reasons: [...reasons].sort(),
    blockedProviders: [...blocked].sort(),
  };
}

export interface ImplementationProof extends ProofSubject {
  id: string;
  kind: ProofKind;
  path: string;
  caption: string;
  sha256: string;
  sanitized: boolean;
  providerDeliveryId?: string | null;
}
export interface DocumentationSource {
  url: string;
  title: string;
  claim: string;
  artifactLocator: string;
}
export interface DocumentationAccess {
  access_id: string;
  url: string;
  content_returned: number;
}
export interface TreeFile {
  path: string;
  mode: "100644" | "100755";
  contentBase64: string | null;
  sha: string | null;
}
export interface ImplementationCandidate extends ProofSubject {
  version: 1;
  attemptId: string;
  kind: "tasks" | "build";
  outcome: "completed" | "needs_human";
  files: TreeFile[];
  tasks: string;
  patchSha: string;
  checks: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }[];
  proof: ImplementationProof[];
  sources: DocumentationSource[];
  assumptions: string[];
  question: { blockKey: string; question: string; reason: string } | null;
}
export function validateCandidate(
  candidate: ImplementationCandidate,
  expected: ProofSubject,
  requirements: ProofRequirement,
) {
  if (candidate.version !== 1 || !subjectMatches(candidate, expected))
    throw new ImplementationError(
      "stale_proof",
      "Candidate subject differs from the checked subject",
    );
  candidate.files.forEach((file) =>
    validateImplementationPath(file.path, candidate.change, candidate.kind),
  );
  if (candidate.outcome === "needs_human") {
    if (
      !candidate.question?.question.trim() ||
      !candidate.question.reason.trim() ||
      !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(candidate.question.blockKey)
    )
      throw new ImplementationError(
        "invalid_question",
        "A blocker needs one question, reason, and stable block key",
      );
    return;
  }
  const tasks = candidate.tasks.match(/^\s*- \[[ xX]\] .+$/gm) ?? [];
  if (
    !tasks.length ||
    (candidate.kind === "build" && tasks.some((task) => /\[ \]/.test(task)))
  )
    throw new ImplementationError(
      "tasks_incomplete",
      "Required OpenSpec tasks remain incomplete",
    );
  if (
    !candidate.checks.length ||
    candidate.checks.some((check) => check.exitCode !== 0)
  )
    throw new ImplementationError(
      "checks_incomplete",
      "Required commands did not all pass",
    );
  if (candidate.kind === "tasks") return;
  if (requirements.blockedProviders.length)
    throw new ImplementationError(
      "capability_unavailable",
      requirements.blockedProviders.join("; "),
    );
  for (const kind of requirements.kinds) {
    if (
      !candidate.proof.some(
        (proof) =>
          proof.kind === kind &&
          proof.sanitized &&
          subjectMatches(proof, expected) &&
          (kind !== "provider_originated" || !!proof.providerDeliveryId),
      )
    )
      throw new ImplementationError(
        "proof_incomplete",
        `Current ${kind} proof is required`,
      );
  }
}
export function validateImplementationPath(
  path: string,
  change: string,
  kind: "tasks" | "build",
) {
  if (
    !path ||
    path.startsWith("/") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    path.includes("\\") ||
    /[\x00-\x1f]/.test(path) ||
    /(^|\/)(\.git|\.env(?:\..*)?|\.dev\.vars(?:\..*)?)($|\/)/.test(path)
  )
    throw new ImplementationError(
      "unsafe_path",
      `Unsupported candidate path: ${path}`,
    );
  const root = `openspec/changes/${change}/`;
  if (kind === "tasks" && path !== `${root}tasks.md`)
    throw new ImplementationError(
      "task_scope",
      `Task creation changed ${path}`,
    );
  if (
    kind === "build" &&
    path.startsWith("openspec/") &&
    path !== `${root}tasks.md`
  )
    throw new ImplementationError(
      "approved_input_changed",
      `Implementation changed approved planning: ${path}`,
    );
}
export function validateDocumentation(
  sources: unknown,
  accesses: DocumentationAccess[],
  hosts: string[],
  files: TreeFile[],
) {
  if (!Array.isArray(sources))
    throw new ImplementationError("documentation_citation", "documentation-sources.json must contain an array");
  const used = new Set(
    accesses.filter((a) => a.content_returned === 1).map((a) => a.url),
  );
  const cited = new Set<string>();
  for (const source of sources) {
    const fields = ["url", "title", "claim", "artifactLocator"] as const;
    if (!source || typeof source !== "object" || Array.isArray(source) ||
        fields.some(field => typeof source[field] !== "string" || !source[field].trim()))
      throw new ImplementationError("documentation_citation",
        "Each documentation source requires nonempty url, title, claim and artifactLocator fields (path:line)");
    let url: URL;
    try { url = new URL(source.url); }
    catch (cause) {
      throw new ImplementationError("documentation_citation", `Invalid documentation URL: ${source.url}`, {cause});
    }
    const locator = /^(.*):([1-9][0-9]*)$/.exec(source.artifactLocator);
    if (
      url.protocol !== "https:" ||
      !hosts.includes(url.hostname) ||
      !used.has(source.url) ||
      cited.has(source.url) ||
      !source.title.trim() ||
      !source.claim.trim() ||
      !locator
    )
      throw new ImplementationError(
        "documentation_citation",
        `Unverified documentation citation: ${source.url}`,
      );
    const file = files.find(
      (f) => f.path === locator[1] && f.contentBase64 !== null,
    );
    if (
      !file ||
      !atob(file.contentBase64!)
        .split("\n")
        [Number(locator[2]) - 1]?.includes(source.url)
    )
      throw new ImplementationError(
        "documentation_locator",
        `Citation is absent at ${source.artifactLocator}`,
      );
    cited.add(source.url);
  }
  if ([...used].some((url) => !cited.has(url)))
    throw new ImplementationError(
      "documentation_missing",
      "Opened documentation lacks a checked citation",
    );
}
export const implementationDigest = (value: unknown) =>
  sha256Hex(JSON.stringify(value));
