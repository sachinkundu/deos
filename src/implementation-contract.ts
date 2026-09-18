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

export interface ImplementationProof extends ProofSubject {
  id: string;
  kind: ProofKind;
  path: string;
  caption: string;
  sha256: string;
  sanitized: boolean;
  providerDeliveryId?: string | null;
  audience?: "review" | "diagnostic";
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
export type ImplementationRecovery = Pick<ImplementationCandidate,
  "version" | "attemptId" | "kind" | "change" | "approvedDesignSha" | "testedBaseSha" | "treeSha" | "files" | "patchSha"
> & { purpose: "recovery-only"; runId: string };

export interface ImplementationCandidate extends ProofSubject {
  version: 1;
  browserRuntime?: string;
  attemptId: string;
  kind: "tasks" | "build";
  outcome: "completed" | "needs_human";
  files: TreeFile[];
  tasks: string;
  summary?: string;
  patchSha: string;
  checks: {
    command: string;
    cwd?: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }[];
  proof: ImplementationProof[];
  sources: DocumentationSource[];
  assumptions: string[];
  question: { blockKey: string; question: string; reason: string } | null;
}
export const implementationDigest = (value: unknown) =>
  sha256Hex(JSON.stringify(value));

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
}
