import { verifyCapabilityToken } from "./capability-auth.ts";
import type { CapabilityStore } from "./capability-store.ts";
import type {
  GitHubCapabilityAdapter,
  GitHubWorkProductRequest,
} from "./github-capability.ts";
import type { GitHubGitProxyAdapter, GitUploadPackRequest } from "./github-git-proxy.ts";
import type { LinearCapabilityAdapter } from "./linear-capability.ts";
import { operationIdentity } from "./orchestration-identity.ts";
import type { LifecycleWriter } from "./lifecycle-telemetry.ts";
import type { D1PlanningStore } from "./planning-store.ts";
import {
  PlanningPublicationValidationError,
  validatePlanningPublication,
  type PlanningPublicationRequest,
  type ValidatedPlanningPublication,
} from "./planning-publication.ts";
import {
  OpenRouterReviewError,
  type OpenRouterFailureStage,
  type OpenRouterReviewClient,
} from "./openrouter-review.ts";
import type { ProviderDiagnosticWriter } from "./provider-diagnostics.ts";
import type { OpenRouterResponseStore, OpenRouterStoredResponse } from "./openrouter-response-store.ts";
import traceDiscoverySchema from "../config/schemas/trace-discovery-result-v1.json" with { type: "json" };
import traceRecheckSchema from "../config/schemas/trace-recheck-result-v1.json" with { type: "json" };

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

interface OpenRouterCapabilityRequest {
  version: 1;
  action: "openrouter_trace_review";
  model: string;
  reasoning: string;
  mode: "discovery" | "recheck";
  repairAttempt: number;
  prompt: string;
}

export interface CapabilityRouterDependencies {
  store: CapabilityStore;
  github: GitHubCapabilityAdapter;
  githubForInstallation?: (installationId: string) => GitHubCapabilityAdapter;
  githubGit?: GitHubGitProxyAdapter;
  linear: LinearCapabilityAdapter;
  planningStore?: Pick<D1PlanningStore, "findRunWorkProduct" | "recordPublication">;
  openrouter?: Pick<OpenRouterReviewClient, "review"> &
    Partial<Pick<OpenRouterReviewClient, "proxyResponses">>;
  diagnostics?: ProviderDiagnosticWriter;
  openrouterResponses?: OpenRouterResponseStore;
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

const parsePlanningRequest = (value: unknown): PlanningPublicationRequest | null => {
  const request = asRecord(value);
  if (
    request === null ||
    !exactKeys(request, [
      "version", "action", "operationKey", "repository", "baseBranch", "change",
      "title", "body", "files", "reviewReplies",
    ]) ||
    request.version !== 1 ||
    request.action !== "publish_planning_work_product" ||
    !operationKey(request.operationKey) ||
    !nonEmpty(request.repository, 200) ||
    request.baseBranch !== "main" ||
    !nonEmpty(request.change, 100) ||
    !nonEmpty(request.title, 256) ||
    typeof request.body !== "string" || request.body.length > 20_000 ||
    !Array.isArray(request.files) || request.files.length < 1 || request.files.length > 50 ||
    !Array.isArray(request.reviewReplies) || request.reviewReplies.length > 50
  ) return null;
  const files: Array<{ path: string; content: string }> = [];
  for (const value of request.files) {
    const file = asRecord(value);
    if (
      file === null || !exactKeys(file, ["path", "content"]) ||
      !nonEmpty(file.path, 500) || typeof file.content !== "string" ||
      file.content.length > 1_000_000
    ) return null;
    files.push({ path: file.path, content: file.content });
  }
  const reviewReplies: Array<{ commentId: number; body: string }> = [];
  for (const value of request.reviewReplies) {
    const reply = asRecord(value);
    if (
      reply === null || !exactKeys(reply, ["commentId", "body"]) ||
      !Number.isSafeInteger(reply.commentId) || Number(reply.commentId) <= 0 ||
      !nonEmpty(reply.body, 1_000)
    ) return null;
    reviewReplies.push({ commentId: Number(reply.commentId), body: reply.body });
  }
  return {
    version: 1,
    action: "publish_planning_work_product",
    operationKey: request.operationKey,
    repository: request.repository,
    baseBranch: "main",
    change: request.change,
    title: request.title,
    body: request.body,
    files,
    reviewReplies,
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

const parseOpenRouterRequest = (value: unknown): OpenRouterCapabilityRequest | null => {
  const request = asRecord(value);
  if (
    request === null ||
    !exactKeys(request, [
      "version", "action", "model", "reasoning", "mode", "repairAttempt", "prompt",
    ]) ||
    request.version !== 1 || request.action !== "openrouter_trace_review" ||
    !nonEmpty(request.model, 240) || !nonEmpty(request.reasoning, 80) ||
    !["discovery", "recheck"].includes(String(request.mode)) ||
    request.repairAttempt !== 0 || !nonEmpty(request.prompt, 1_000_000)
  ) return null;
  return {
    version: 1,
    action: "openrouter_trace_review",
    model: request.model,
    reasoning: request.reasoning,
    mode: request.mode as "discovery" | "recheck",
    repairAttempt: Number(request.repairAttempt),
    prompt: request.prompt,
  };
};

const parseOpenRouterResponsesRequest = (
  value: unknown,
  savedModel: string,
): Readonly<Record<string, unknown>> | null => {
  const request = asRecord(value);
  if (
    request === null || request.model !== savedModel ||
    !(typeof request.input === "string" || Array.isArray(request.input)) ||
    (request.stream !== undefined && typeof request.stream !== "boolean") ||
    request.background === true || request.store === true ||
    request.conversation !== undefined || request.plugins !== undefined
  ) return null;
  const encoded = JSON.stringify(request);
  if (
    encoded.length === 0 || encoded.length > 3_000_000 ||
    /\bsk-or-v1-[A-Za-z0-9_-]{12,}\b/.test(encoded) ||
    /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/i.test(encoded)
  ) return null;
  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools) || request.tools.length > 64) return null;
    const forbiddenTools = new Set([
      "file_search", "computer_use", "computer_use_preview",
      "code_interpreter", "image_generation", "mcp", "hosted_mcp",
    ]);
    for (const value of request.tools) {
      const tool = asRecord(value);
      if (
        tool === null || !nonEmpty(tool.type, 100) ||
        tool.type.startsWith("openrouter:") || forbiddenTools.has(tool.type)
      ) return null;
    }
  }
  return Object.freeze({ ...request, model: savedModel, background: false, store: false });
};

const isReceiptRequest = (value: unknown): boolean => {
  const request = asRecord(value);
  return request !== null && exactKeys(request, ["version", "action"]) &&
    request.version === 1 && request.action === "list_openrouter_review_receipts";
};

const digest = async (value: unknown): Promise<string> => {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const openRouterSafeCategory = (stage: OpenRouterFailureStage, status: number | null): string => {
  if (stage === "http") return `openrouter_http_${status ?? "unknown"}`;
  return ({
    transport: "openrouter_transport_error",
    response_body: "openrouter_response_body_too_large",
    response_json: "openrouter_response_json_invalid",
    response_contract: "openrouter_response_contract_invalid",
    structured_content: "openrouter_structured_content_missing",
    structured_json: "openrouter_structured_json_invalid",
  } satisfies Record<Exclude<OpenRouterFailureStage, "http">, string>)[stage];
};

export class CapabilityRouter {
  private readonly dependencies: CapabilityRouterDependencies;
  private readonly now: () => Date;

  constructor(dependencies: CapabilityRouterDependencies) {
    this.dependencies = dependencies;
    this.now = dependencies.now ?? (() => new Date());
  }

  async handle(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const gitKind: GitUploadPackRequest | null =
      request.method === "GET" && path.endsWith("/git/info/refs") &&
          new URL(request.url).searchParams.get("service") === "git-upload-pack"
        ? "advertisement"
        : request.method === "POST" && path.endsWith("/git/git-upload-pack")
          ? "upload_pack"
          : null;
    if (gitKind === null && request.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }
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
      !(gitKind === null
        ? context.attemptState === "running"
        : ["pending", "starting", "running"].includes(context.attemptState)) ||
      context.runId !== claims.runId ||
      context.repository !== claims.repository ||
      context.issueId !== claims.issueId
    ) return json(403, { error: "capability_not_active" });

    if (gitKind !== null) {
      if (
        !claims.actions.includes("github.clone_repository") ||
        context.githubInstallationId === undefined ||
        this.dependencies.githubGit === undefined
      ) return json(403, { error: "repository_checkout_denied" });
      try {
        return await this.dependencies.githubGit.proxy({
          request,
          repository: claims.repository,
          installationId: context.githubInstallationId,
          kind: gitKind,
        });
      } catch {
        return new Response("repository checkout adapter failed\n", {
          status: 502,
          headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }

    let untrusted: unknown;
    try {
      untrusted = await request.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (path.endsWith("/github")) {
      const planningInput = parsePlanningRequest(untrusted);
      if (planningInput !== null) {
        if (
          !claims.actions.includes("github.publish_planning_work_product") ||
          planningInput.repository !== claims.repository ||
          planningInput.change !== claims.changeId ||
          planningInput.operationKey !== `planning-publish-${claims.attemptId}` ||
          claims.planningBranch === null
        ) return this.denied(
          claims.runId,
          claims.attemptId,
          "github",
          untrusted,
          "planning_identity_denied",
        );
        let issue;
        try {
          issue = await this.dependencies.linear.readPublicationContext(claims.issueId);
        } catch {
          return json(502, { error: "planning_context_unavailable" });
        }
        let validated: ValidatedPlanningPublication;
        try {
          validated = await validatePlanningPublication(planningInput, {
            issueIdentifier: issue.identifier,
            issueUrl: issue.url,
            issueTitle: issue.title,
            issueDescription: issue.description,
          });
        } catch (error) {
          return this.denied(
            claims.runId,
            claims.attemptId,
            "github",
            untrusted,
            error instanceof PlanningPublicationValidationError
              ? error.safeCategory
              : "planning_validation_failed",
          );
        }
        return this.planningGithub(
          validated,
          claims.runId,
          claims.attemptId,
          claims.planningBranch,
          context.githubInstallationId,
        );
      }
      if (asRecord(untrusted)?.action === "publish_planning_work_product") {
        return this.denied(
          claims.runId,
          claims.attemptId,
          "github",
          untrusted,
          "planning_request_invalid",
        );
      }
      const input = parseGitHubRequest(untrusted);
      if (
        input === null ||
        !claims.actions.includes("github.publish_work_product") ||
        input.repository !== claims.repository ||
        input.branch !== `deos/${claims.attemptId}`
      ) return this.denied(claims.runId, claims.attemptId, "github", untrusted);
      return this.github(input, claims.runId, claims.attemptId, context.githubInstallationId);
    }
    if (path.endsWith("/linear")) {
      const input = parseLinearRequest(untrusted);
      if (
        input === null ||
        !claims.actions.includes("linear.upsert_working_note") ||
        input.action !== "upsert_working_note" ||
        input.issueId !== claims.issueId
      ) {
        return this.denied(claims.runId, claims.attemptId, "linear", untrusted);
      }
      return this.linear(input, claims.runId, claims.attemptId);
    }
    if (path.endsWith("/model-review")) {
      const input = parseOpenRouterRequest(untrusted);
      if (
        input === null || !claims.actions.includes("model.openrouter_review") ||
        claims.modelProvider !== "openrouter" || input.model !== claims.model ||
        input.reasoning !== claims.reasoning
      ) return this.denied(claims.runId, claims.attemptId, "model", untrusted, "model_identity_denied");
      return this.openRouter(input, claims.runId, claims.attemptId);
    }
    if (path.endsWith("/openrouter/v1/responses")) {
      const input = typeof claims.model === "string"
        ? parseOpenRouterResponsesRequest(untrusted, claims.model)
        : null;
      if (
        input === null || !claims.actions.includes("model.openrouter_review") ||
        claims.modelProvider !== "openrouter"
      ) return this.denied(
        claims.runId,
        claims.attemptId,
        "model",
        untrusted,
        "model_responses_identity_denied",
      );
      return this.openRouterResponses(input, claims.runId, claims.attemptId);
    }
    if (path.endsWith("/model-review/receipts")) {
      if (
        !isReceiptRequest(untrusted) ||
        !claims.actions.includes("model.openrouter_review") ||
        claims.modelProvider !== "openrouter"
      ) return json(403, { error: "model_receipts_denied" });
      return this.openRouterReceipts(claims.attemptId);
    }
    return json(404, { error: "unknown_capability" });
  }

  private async openRouterReceipts(attemptId: string): Promise<Response> {
    const operations = await this.dependencies.store.listAttemptOperations(
      attemptId,
      "openrouter_responses",
    );
    return json(200, {
      version: 1,
      receipts: operations
        .filter((operation) => ["succeeded", "reconciled"].includes(operation.state))
        .map((operation) => ({
          capability: "model",
          operationId: operation.operation_id,
          state: operation.state,
          providerResourceId: operation.provider_resource_id,
        })),
    });
  }

  private async openRouterResponses(
    input: Readonly<Record<string, unknown>>,
    runId: string,
    attemptId: string,
  ): Promise<Response> {
    if (
      this.dependencies.openrouter?.proxyResponses === undefined ||
      this.dependencies.openrouterResponses === undefined
    ) {
      return json(503, { error: "openrouter_adapter_unavailable" });
    }
    const requestDigest = await digest(input);
    const operationId = operationIdentity(
      runId,
      "capability",
      `model:openrouter_responses:${attemptId}:${requestDigest.slice(0, 24)}`,
      1,
    );
    const operation = await this.dependencies.store.begin({
      operationId,
      runId,
      attemptId,
      capability: "model",
      action: "openrouter_responses",
      sanitizedTarget: String(input.model),
      requestDigest,
      now: this.now().toISOString(),
    });
    const replay = await this.dependencies.openrouterResponses.get(operationId);
    if (replay !== null) {
      if (["pending", "manual_reconciliation_required"].includes(operation.operation.state)) {
        await this.dependencies.store.finish({
          operationId,
          expected: operation.operation.state,
          state: "reconciled",
          providerResourceId: replay.providerRequestId,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
      }
      this.emitProvider(runId, operationId, "reconciled");
      return this.openRouterResponse(replay);
    }
    if (operation.operation.state !== "pending" || !operation.created) {
      return json(409, {
        error: "model_response_replay_unavailable",
        operationId,
        state: operation.operation.state,
        diagnosticId: operation.operation.diagnostic_id,
      });
    }
    try {
      const response = await this.dependencies.openrouter.proxyResponses(input);
      await this.dependencies.openrouterResponses.put({
        operationId,
        ...response,
        now: this.now().toISOString(),
      });
      const changed = await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state: "succeeded",
        providerResourceId: response.providerRequestId,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      if (!changed) throw new Error("OpenRouter Responses receipt compare-and-set failed");
      this.emitProvider(runId, operationId, "succeeded");
      return this.openRouterResponse({ operationId, ...response });
    } catch (error) {
      const diagnostic = error instanceof OpenRouterReviewError ? error.diagnostic : null;
      const safeErrorCategory = diagnostic === null
        ? "openrouter_adapter_error"
        : openRouterSafeCategory(diagnostic.stage, diagnostic.httpStatus);
      const now = this.now().toISOString();
      let diagnosticId: string | null = null;
      if (diagnostic !== null && this.dependencies.diagnostics !== undefined) {
        try {
          diagnosticId = await this.dependencies.diagnostics.record({
            operationId,
            runId,
            attemptId,
            provider: "openrouter",
            safeCategory: safeErrorCategory,
            diagnostic,
            now,
          });
        } catch {
          console.error(JSON.stringify({
            message: "openrouter diagnostic write failed",
            runId,
            attemptId,
            operationId,
            safeErrorCategory,
          }));
        }
      }
      const state = diagnostic?.requestMayHaveSucceeded === false
        ? "failed"
        : "manual_reconciliation_required";
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state,
        providerResourceId: null,
        safeErrorCategory,
        diagnosticId,
        now,
      });
      console.error(JSON.stringify({
        message: "openrouter Responses proxy failed",
        runId,
        attemptId,
        operationId,
        diagnosticId,
        safeErrorCategory,
        failureStage: diagnostic?.stage ?? null,
        httpStatus: diagnostic?.httpStatus ?? null,
        providerCode: diagnostic?.providerCode ?? null,
        providerType: diagnostic?.providerType ?? null,
        providerRequestId: diagnostic?.providerRequestId ?? null,
        retryable: diagnostic?.retryable ?? false,
        requestMayHaveSucceeded: diagnostic?.requestMayHaveSucceeded ?? true,
      }));
      this.emitProvider(runId, operationId, "failed", safeErrorCategory);
      return json(502, {
        error: {
          message: `DEOS OpenRouter proxy failed (${safeErrorCategory})`,
          type: "deos_provider_error",
          code: safeErrorCategory,
          diagnostic_id: diagnosticId,
        },
      });
    }
  }

  private openRouterResponse(response: OpenRouterStoredResponse): Response {
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": response.contentType,
        "X-Deos-Operation-Id": response.operationId,
      },
    });
  }

  private async openRouter(
    input: OpenRouterCapabilityRequest,
    runId: string,
    attemptId: string,
  ): Promise<Response> {
    if (this.dependencies.openrouter === undefined) {
      return json(503, { error: "openrouter_adapter_unavailable" });
    }
    const operationId = operationIdentity(
      runId,
      "capability",
      `model:${input.action}:${attemptId}:${input.repairAttempt}`,
      1,
    );
    const operation = await this.dependencies.store.begin({
      operationId,
      runId,
      attemptId,
      capability: "model",
      action: input.action,
      sanitizedTarget: input.model,
      requestDigest: await digest(input),
      now: this.now().toISOString(),
    });
    if (["succeeded", "reconciled", "duplicate"].includes(operation.operation.state)) {
      return json(409, { error: "model_result_requires_durable_recovery", operationId });
    }
    if (operation.operation.state !== "pending") {
      return json(409, this.receipt(operationId, operation.operation.state, operation.operation.provider_resource_id));
    }
    try {
      const response = await this.dependencies.openrouter.review({
        model: input.model,
        reasoning: input.reasoning,
        prompt: input.prompt,
        schemaName: input.mode === "discovery" ? "deos_trace_discovery" : "deos_trace_recheck",
        schema: input.mode === "discovery" ? traceDiscoverySchema : traceRecheckSchema,
      });
      const changed = await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state: "succeeded",
        providerResourceId: response.providerRequestId,
        safeErrorCategory: null,
        now: this.now().toISOString(),
      });
      if (!changed) throw new Error("OpenRouter receipt compare-and-set failed");
      this.emitProvider(runId, operationId, "succeeded");
      return json(200, {
        operationId,
        state: "succeeded",
        providerResourceId: response.providerRequestId,
        result: response.result,
      });
    } catch (error) {
      const diagnostic = error instanceof OpenRouterReviewError ? error.diagnostic : null;
      const safeErrorCategory = diagnostic === null
        ? "openrouter_adapter_error"
        : openRouterSafeCategory(diagnostic.stage, diagnostic.httpStatus);
      const now = this.now().toISOString();
      let diagnosticId: string | null = null;
      if (diagnostic !== null && this.dependencies.diagnostics !== undefined) {
        try {
          diagnosticId = await this.dependencies.diagnostics.record({
            operationId,
            runId,
            attemptId,
            provider: "openrouter",
            safeCategory: safeErrorCategory,
            diagnostic,
            now,
          });
        } catch {
          console.error(JSON.stringify({
            message: "openrouter diagnostic write failed",
            runId,
            attemptId,
            operationId,
            safeErrorCategory,
          }));
        }
      }
      const state = diagnostic?.requestMayHaveSucceeded === false
        ? "failed"
        : "manual_reconciliation_required";
      await this.dependencies.store.finish({
        operationId,
        expected: "pending",
        state,
        providerResourceId: null,
        safeErrorCategory,
        diagnosticId,
        now,
      });
      console.error(JSON.stringify({
        message: "openrouter review failed",
        runId,
        attemptId,
        operationId,
        diagnosticId,
        safeErrorCategory,
        failureStage: diagnostic?.stage ?? null,
        httpStatus: diagnostic?.httpStatus ?? null,
        providerCode: diagnostic?.providerCode ?? null,
        providerType: diagnostic?.providerType ?? null,
        providerRequestId: diagnostic?.providerRequestId ?? null,
        retryable: diagnostic?.retryable ?? false,
        requestMayHaveSucceeded: diagnostic?.requestMayHaveSucceeded ?? true,
      }));
      this.emitProvider(runId, operationId, "failed", safeErrorCategory);
      return json(502, {
        ...this.receipt(operationId, state, null),
        safeErrorCategory,
        diagnosticId,
      });
    }
  }

  private async planningGithub(
    input: ValidatedPlanningPublication,
    runId: string,
    attemptId: string,
    planningBranch: string,
    githubInstallationId: string | undefined,
  ): Promise<Response> {
    const planningStore = this.dependencies.planningStore;
    if (planningStore === undefined) return json(503, { error: "planning_store_unavailable" });
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
      sanitizedTarget: `${input.repository}:${planningBranch}`,
      requestDigest: await digest({ ...input, planningBranch }),
      now: this.now().toISOString(),
    });
    if (!["pending", "succeeded", "reconciled", "manual_reconciliation_required"].includes(operation.operation.state)) {
      return json(409, this.receipt(operationId, operation.operation.state, operation.operation.provider_resource_id));
    }
    try {
      const recorded = await planningStore.findRunWorkProduct(runId);
      if (
        recorded === null || recorded.repository !== input.repository ||
        recorded.remote_branch !== planningBranch || recorded.base_branch !== "main" ||
        recorded.change_id !== input.change
      ) throw new Error("recorded planning work product does not match the capability");
      const receipt = await this.githubAdapter(githubInstallationId).publishPlanning({
        repository: input.repository,
        branch: planningBranch,
        baseBranch: "main",
        change: input.change,
        title: input.title,
        body: input.body,
        files: input.files,
        reviewReplies: input.reviewReplies,
        ...(recorded.pull_request_database_id === null ? {} : {
          expectedPullRequestDatabaseId: recorded.pull_request_database_id,
          expectedPullRequestNumber: recorded.pull_request_number ?? undefined,
        }),
      }, operationId);
      const state = receipt.reconciled || operation.operation.state !== "pending"
        ? "reconciled"
        : "succeeded";
      if (operation.operation.state !== state) {
        const updated = await this.dependencies.store.finish({
          operationId,
          expected: operation.operation.state,
          state,
          providerResourceId: receipt.pullRequestDatabaseId,
          safeErrorCategory: null,
          now: this.now().toISOString(),
        });
        if (!updated) throw new Error("planning provider receipt compare-and-set failed");
      }
      await planningStore.recordPublication({
        runId,
        repository: input.repository,
        remoteBranch: planningBranch,
        changeId: input.change,
        pullRequestDatabaseId: receipt.pullRequestDatabaseId,
        pullRequestNumber: receipt.pullRequestNumber,
        pullRequestUrl: receipt.pullRequestUrl,
        headSha: receipt.headSha,
        planningManifestDigest: input.manifestDigest,
        planningManifestJson: input.manifestJson,
        operationId,
        now: this.now().toISOString(),
      });
      this.emitProvider(runId, operationId, state);
      return json(200, {
        ...this.receipt(
          operationId,
          state,
          receipt.pullRequestDatabaseId,
          receipt.pullRequestUrl,
        ),
        pullRequestNumber: receipt.pullRequestNumber,
        branch: planningBranch,
        headSha: receipt.headSha,
        manifestDigest: input.manifestDigest,
      });
    } catch {
      if (operation.operation.state === "pending") {
        await this.dependencies.store.finish({
          operationId,
          expected: "pending",
          state: "manual_reconciliation_required",
          providerResourceId: null,
          safeErrorCategory: "github_response_ambiguous",
          now: this.now().toISOString(),
        });
      }
      this.emitProvider(runId, operationId, "failed", "github_response_ambiguous");
      return json(502, this.receipt(operationId, "manual_reconciliation_required", null));
    }
  }

  private async github(
    input: GitHubCapabilityRequest,
    runId: string,
    attemptId: string,
    githubInstallationId: string | undefined,
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
      const receipt = await this.githubAdapter(githubInstallationId).publish(input, operationId);
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

  private githubAdapter(installationId: string | undefined): GitHubCapabilityAdapter {
    if (this.dependencies.githubForInstallation === undefined) return this.dependencies.github;
    if (installationId === undefined || !/^[1-9][0-9]{0,19}$/.test(installationId)) {
      throw new Error("frozen GitHub App installation is missing");
    }
    return this.dependencies.githubForInstallation(installationId);
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
    safeErrorCategory = "capability_denied",
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
        safeErrorCategory,
        now: this.now().toISOString(),
      });
    }
    return json(403, {
      ...this.receipt(operationId, "denied", null),
      safeErrorCategory,
    });
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
