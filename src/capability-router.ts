import { verifyCapabilityToken } from "./capability-auth.ts";
import type { CapabilityStore } from "./capability-store.ts";
import type {
  GitHubCapabilityAdapter,
  GitHubWorkProductRequest,
} from "./github-capability.ts";
import type { LinearCapabilityAdapter } from "./linear-capability.ts";
import { operationIdentity } from "./orchestration-identity.ts";
import type { LifecycleWriter } from "./lifecycle-telemetry.ts";

interface GitHubCapabilityRequest extends GitHubWorkProductRequest {
  version: 1;
  action: "publish_work_product";
  operationKey: string;
}

interface LinearCapabilityRequest {
  version: 1;
  action: "upsert_working_note" | "attach_artifact_reference";
  operationKey: string;
  issueId: string;
  body: string;
}

export interface CapabilityRouterDependencies {
  store: CapabilityStore;
  github: GitHubCapabilityAdapter;
  linear: LinearCapabilityAdapter;
  signingSecret: string;
  now?: () => Date;
  lifecycle?: LifecycleWriter;
}

const json = (status: number, body: Record<string, unknown>): Response =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const exactKeys = (record: Record<string, unknown>, allowed: readonly string[]): boolean => {
  const set = new Set(allowed);
  return Object.keys(record).every((key) => set.has(key));
};

const nonEmpty = (value: unknown, maximum = 10_000): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum;

const operationKey = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value);

const parseGitHubRequest = (value: unknown): GitHubCapabilityRequest | null => {
  const request = asRecord(value);
  if (
    request === null ||
    !exactKeys(request, [
      "version", "action", "operationKey", "repository", "branch", "baseBranch",
      "title", "body", "files",
    ]) ||
    request.version !== 1 ||
    request.action !== "publish_work_product" ||
    !operationKey(request.operationKey) ||
    !nonEmpty(request.repository, 200) ||
    !nonEmpty(request.branch, 200) ||
    request.baseBranch !== "main" ||
    !nonEmpty(request.title, 256) ||
    typeof request.body !== "string" || request.body.length > 20_000 ||
    !Array.isArray(request.files) ||
    request.files.length < 1 || request.files.length > 20
  ) return null;
  const files: Array<{ path: string; content: string }> = [];
  const paths = new Set<string>();
  for (const value of request.files) {
    const file = asRecord(value);
    if (
      file === null ||
      !exactKeys(file, ["path", "content"]) ||
      !nonEmpty(file.path, 500) ||
      typeof file.content !== "string" || file.content.length > 1_000_000 ||
      file.path.startsWith("/") || file.path.includes("..") ||
      file.path === ".env" || file.path.startsWith(".github/workflows/") ||
      paths.has(file.path)
    ) return null;
    paths.add(file.path);
    files.push({ path: file.path, content: file.content });
  }
  return {
    version: 1,
    action: "publish_work_product",
    operationKey: request.operationKey,
    repository: request.repository,
    branch: request.branch,
    baseBranch: "main",
    title: request.title,
    body: request.body,
    files,
  };
};

const parseLinearRequest = (value: unknown): LinearCapabilityRequest | null => {
  const request = asRecord(value);
  if (
    request === null ||
    !exactKeys(request, ["version", "action", "operationKey", "issueId", "body"]) ||
    request.version !== 1 ||
    !["upsert_working_note", "attach_artifact_reference"].includes(String(request.action)) ||
    !operationKey(request.operationKey) ||
    !nonEmpty(request.issueId, 200) ||
    !nonEmpty(request.body, 20_000)
  ) return null;
  return {
    version: 1,
    action: request.action as LinearCapabilityRequest["action"],
    operationKey: request.operationKey,
    issueId: request.issueId,
    body: request.body,
  };
};

const digest = async (value: unknown): Promise<string> => {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export class CapabilityRouter {
  private readonly dependencies: CapabilityRouterDependencies;
  private readonly now: () => Date;

  constructor(dependencies: CapabilityRouterDependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? (() => new Date());
  }

  async handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    const authorization = request.headers.get("Authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    let claims;
    try {
      claims = await verifyCapabilityToken(token, this.dependencies.signingSecret, this.now().getTime());
    } catch {
      return json(401, { error: "invalid_capability" });
    }
    if (request.headers.get("Deos-Attempt") !== claims.attemptId) {
      return json(403, { error: "attempt_mismatch" });
    }
    const context = await this.dependencies.store.context(claims.attemptId);
    if (
      context === null ||
      context.attemptState !== "running" ||
      context.runId !== claims.runId ||
      context.repository !== claims.repository ||
      context.issueId !== claims.issueId
    ) return json(403, { error: "capability_not_active" });

    let untrusted: unknown;
    try {
      untrusted = await request.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    const path = new URL(request.url).pathname;
    if (path.endsWith("/github")) {
      const input = parseGitHubRequest(untrusted);
      if (
        input === null ||
        input.repository !== claims.repository ||
        input.branch !== `deos/${claims.attemptId}`
      ) return this.denied(claims.runId, claims.attemptId, "github", untrusted);
      return this.github(input, claims.runId, claims.attemptId);
    }
    if (path.endsWith("/linear")) {
      const input = parseLinearRequest(untrusted);
      if (input === null || input.issueId !== claims.issueId) {
        return this.denied(claims.runId, claims.attemptId, "linear", untrusted);
      }
      return this.linear(input, claims.runId, claims.attemptId);
    }
    return json(404, { error: "unknown_capability" });
  }

  private async github(
    input: GitHubCapabilityRequest,
    runId: string,
    attemptId: string,
  ): Promise<Response> {
    const operationId = operationIdentity(
      runId,
      "capability",
      `github:${input.action}:${input.operationKey}`,
      1,
    );
    const operation = await this.dependencies.store.begin({
      operationId,
      runId,
      attemptId,
      capability: "github",
      action: input.action,
      sanitizedTarget: `${input.repository}:${input.branch}`,
      requestDigest: await digest(input),
      now: this.now().toISOString(),
    });
    if (["succeeded", "reconciled", "duplicate"].includes(operation.operation.state)) {
      return json(200, this.receipt(operationId, operation.operation.state, operation.operation.provider_resource_id));
    }
    try {
      const receipt = await this.dependencies.github.publish(input, operationId);
      const state = receipt.reconciled ? "reconciled" : "succeeded";
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state,
        providerResourceId: receipt.pullRequestId,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      this.emitProvider(runId, operationId, state);
      return json(200, this.receipt(operationId, state, receipt.pullRequestId, receipt.pullRequestUrl));
    } catch {
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state: "manual_reconciliation_required",
        providerResourceId: null,
        safeErrorCategory: "github_response_ambiguous",
        now: this.now().toISOString(),
      });
      this.emitProvider(runId, operationId, "failed", "github_response_ambiguous");
      return json(502, this.receipt(operationId, "manual_reconciliation_required", null));
    }
  }

  private async linear(
    input: LinearCapabilityRequest,
    runId: string,
    attemptId: string,
  ): Promise<Response> {
    const operationId = operationIdentity(
      runId,
      "capability",
      `linear:${input.action}:${input.operationKey}`,
      1,
    );
    const operation = await this.dependencies.store.begin({
      operationId,
      runId,
      attemptId,
      capability: "linear",
      action: input.action,
      sanitizedTarget: input.issueId,
      requestDigest: await digest(input),
      now: this.now().toISOString(),
    });
    if (["succeeded", "reconciled", "duplicate"].includes(operation.operation.state)) {
      return json(200, this.receipt(operationId, operation.operation.state, operation.operation.provider_resource_id));
    }
    try {
      const receipt = await this.dependencies.linear.upsertNote(input, operationId);
      const state = receipt.reconciled ? "reconciled" : "succeeded";
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state,
        providerResourceId: receipt.commentId,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      this.emitProvider(runId, operationId, state);
      return json(200, this.receipt(operationId, state, receipt.commentId));
    } catch {
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state: "manual_reconciliation_required",
        providerResourceId: null,
        safeErrorCategory: "linear_response_ambiguous",
        now: this.now().toISOString(),
      });
      this.emitProvider(runId, operationId, "failed", "linear_response_ambiguous");
      return json(502, this.receipt(operationId, "manual_reconciliation_required", null));
    }
  }

  private async denied(
    runId: string,
    attemptId: string,
    capability: string,
    input: unknown,
  ): Promise<Response> {
    const record = asRecord(input);
    const key = operationKey(record?.operationKey) ? record.operationKey : `invalid-${(await digest(input)).slice(0, 16)}`;
    const action = typeof record?.action === "string" ? record.action.slice(0, 80) : "invalid";
    const operationId = operationIdentity(runId, "capability", `${capability}:denied:${key}`, 1);
    const operation = await this.dependencies.store.begin({
      operationId,
      runId,
      attemptId,
      capability,
      action,
      sanitizedTarget: "denied",
      requestDigest: await digest(input),
      now: this.now().toISOString(),
    });
    if (operation.operation.state === "pending") {
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state: "denied",
        providerResourceId: null,
        safeErrorCategory: "capability_denied",
        now: this.now().toISOString(),
      });
    }
    return json(403, this.receipt(operationId, "denied", null));
  }

  private emitProvider(
    runId: string,
    operationId: string,
    outcome: "succeeded" | "reconciled" | "failed",
    safeErrorCategory?: string,
  ): void {
    this.dependencies.lifecycle?.({
      stage: "provider.operation",
      outcome,
      correlationId: runId.split(":run:")[0],
      runId,
      operationId,
      safeErrorCategory,
    });
  }

  private receipt(
    operationId: string,
    state: string,
    providerResourceId: string | null,
    providerUrl?: string,
  ): Record<string, unknown> {
    return {
      version: 1,
      operationId,
      state,
      providerResourceId,
      ...(providerUrl === undefined ? {} : { providerUrl }),
    };
  }
}
