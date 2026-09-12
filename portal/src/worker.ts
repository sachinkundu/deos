import type { RecentIssuesBinding, RecentIssuesUpdate } from "../../src/recent-issues.ts";
import { errorDetails, errorText } from "../../src/error-details.ts";
import { verifyAccess } from "./auth.ts";
import { deploymentMetadata, labelPortalHtml, type PortalDeploymentEnv } from "./deployment.ts";
import { PortalIssueSearchHistoryStore, PortalReadStore } from "./model.ts";
import {
  TranscriptNotFoundError,
  TranscriptReadStore,
  TranscriptUnavailableError,
  transcriptDto,
} from "./transcript.ts";
import {
  TraceReviewArtifactError,
  TraceReviewNotFoundError,
  TraceReviewReadStore,
} from "./review.ts";
import {
  DesignReviewArtifactError,
  DesignReviewNotFoundError,
  DesignReviewReadStore,
} from "./design-review.ts";
import {
  ReviewStoryArtifactError,
  ReviewStoryNotFoundError,
  ReviewStoryReadStore,
} from "./story.ts";

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: securityHeaders });

type PortalRuntimeEnv = Pick<Env, "DB" | "ARTIFACTS" | "ASSETS"> & PortalDeploymentEnv & {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
  OPENROUTER_SUPPORTED_MODELS?: string;
  ROUTE_ADMIN?: Service;
  RECENT_ISSUES?: RecentIssuesBinding | Service;
  RETRY_ADMIN?: Fetcher;
  STAGE_RETRY_SECRET?: string;
};

interface RouteAdminBinding {
  overview(actorEmail: string): Promise<unknown>;
  createRoute(actorEmail: string, input: unknown): Promise<unknown>;
  saveRepository(actorEmail: string, input: unknown): Promise<unknown>;
  saveWorkflow(actorEmail: string, input: unknown): Promise<unknown>;
  saveReview(actorEmail: string, input: unknown): Promise<unknown>;
  recheck(actorEmail: string, input: unknown): Promise<unknown>;
}

const routeAdmin = (env: PortalRuntimeEnv): RouteAdminBinding => {
  if (env.ROUTE_ADMIN === undefined) throw new Error("route admin binding is unavailable");
  return env.ROUTE_ADMIN as unknown as RouteAdminBinding;
};

const retryRun = async (
  env: PortalRuntimeEnv,
  actorEmail: string,
  input: { runId: string; failedAttemptId: unknown; retryNode: unknown },
): Promise<unknown> => {
  if (env.RETRY_ADMIN === undefined || env.STAGE_RETRY_SECRET === undefined) {
    throw new Error("retry admin binding is unavailable");
  }
  const response = await env.RETRY_ADMIN.fetch(new Request("https://retry-admin.internal/stage-retries", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STAGE_RETRY_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ version: 1, ...input, requestedBy: actorEmail }),
  }));
  const body = await response.json() as {
    error?: string;
    retry?: { retry_id: string; run_id: string; retry_node: string; state: string };
  };
  if (!response.ok || body.retry === undefined) {
    throw new Error(body.error ?? "stage_retry_failed");
  }
  return {
    retryId: body.retry.retry_id,
    runId: body.retry.run_id,
    retryNode: body.retry.retry_node,
    state: body.retry.state,
  };
};

const routeAdminError = (error: unknown): string | null => {
  const value = errorText(error);
  const allowed = new Set([
    "unauthorized_actor", "invalid_input", "provider_unavailable",
    "project_not_available", "repository_not_available", "github_access_not_ready",
    "unsupported_review_model", "route_not_found", "route_exists",
    "stale_repository_revision", "stale_workflow_revision", "stale_review_revision",
    "route_read_back_failed", "invalid_stage_retry", "stage_retry_not_eligible",
    "stage_retry_identity_mismatch", "stage_retry_read_back_failed",
    "stage_retry_observation_read_back_failed", "stage_retry_target_instance_missing",
    "workflow_replacement_not_established", "workflow_replacement_ambiguous",
  ]);
  return allowed.has(value) ? value : null;
};

const exactBody = (body: Record<string, unknown>, keys: readonly string[]): boolean => {
  const allowed = new Set(keys);
  return Object.keys(body).every((key) => allowed.has(key));
};

const routeBody = async (request: Request): Promise<
  | { state: "ready"; value: Record<string, unknown> }
  | { state: "invalid" }
  | { state: "too_large" }
> => {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 4_096) return { state: "too_large" };
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { state: "invalid" };
  }
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? { state: "ready", value: value as Record<string, unknown> }
    : { state: "invalid" };
};

export const routePortalRequest = async (
  request: Request,
  env: PortalRuntimeEnv,
  authenticate: typeof verifyAccess = verifyAccess,
): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname === "/api/version") {
    if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
    return json(200, deploymentMetadata(env));
  }
  let identity: { email: string };
  try {
    identity = await authenticate(request.headers.get("CF-Access-Jwt-Assertion"), {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch (error) {
    const message = errorText(error);
    return json(message === "forbidden" ? 403 : 401, { error: message === "authentication unavailable" ? "authentication_unavailable" : "unauthorized" });
  }
  const detailPage = url.pathname.match(/^\/failure-detail\/([0-9a-f-]{36})$/i);
  if (detailPage !== null && request.method === "GET") {
    const escape = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    let text: string;
    let status = 200;
    try {
      const row = await env.DB.prepare("SELECT detail_r2_key FROM workflow_errors WHERE error_id = ?")
        .bind(detailPage[1]).first<{ detail_r2_key: string }>();
      if (row === null) throw new Error("Original error not found");
      const object = await env.ARTIFACTS.get(row.detail_r2_key);
      if (object === null) throw new Error(`Original error object is missing: ${row.detail_r2_key}`);
      text = JSON.stringify(JSON.parse(await object.text()), null, 2);
    } catch (error) { status = 503; text = errorText(error); }
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>DEOS original error</title><body><h1>Original error</h1><p>Full saved message, stack, causes, and provider details.</p><pre>${escape(text)}</pre></body></html>`, {
      status, headers: { ...securityHeaders, "Content-Type": "text/html; charset=utf-8" },
    });
  }
  if (!url.pathname.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    const assetPath = url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/settings" || url.pathname === "/settings/"
        ? "/settings.html"
        : /^\/runs\/.+\/(?:review|design-review)\/?$/.test(url.pathname)
          ? "/settings.html"
        : url.pathname.startsWith("/assets/")
          ? url.pathname
          : null;
    if (assetPath === null) return json(404, { error: "route_not_found" });
    const assetUrl = new URL(url);
    assetUrl.pathname = assetPath;
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    if (request.method === "GET" && response.ok && headers.get("Content-Type")?.includes("text/html")) {
      headers.delete("Content-Length");
      headers.delete("ETag");
      return new Response(labelPortalHtml(await response.text(), env), { status: response.status, headers });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const store = new PortalReadStore(env.DB);
  try {
    if (url.pathname === "/api/settings/routes") {
      if (request.method === "GET") {
        return json(200, await routeAdmin(env).overview(identity.email));
      }
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      if (Number(request.headers.get("Content-Length") ?? "0") > 4_096) {
        return json(413, { error: "request_too_large" });
      }
      const parsed = await routeBody(request);
      if (parsed.state === "too_large") return json(413, { error: "request_too_large" });
      if (parsed.state === "invalid") return json(400, { error: "invalid_request" });
      if (!exactBody(parsed.value, ["projectId", "repository", "githubInstallationId"])) {
        return json(400, { error: "invalid_request" });
      }
      return json(201, await routeAdmin(env).createRoute(identity.email, parsed.value));
    }
    const routeSettingsMatch = url.pathname.match(
      /^\/api\/settings\/routes\/([A-Za-z0-9][A-Za-z0-9_-]{0,99})\/(repository|workflow|review|recheck)$/,
    );
    if (routeSettingsMatch !== null) {
      const action = routeSettingsMatch[2];
      const expectedMethod = action === "recheck" ? "POST" : "PUT";
      if (request.method !== expectedMethod) return json(405, { error: "method_not_allowed" });
      if (Number(request.headers.get("Content-Length") ?? "0") > 4_096) {
        return json(413, { error: "request_too_large" });
      }
      const parsed = await routeBody(request);
      if (parsed.state === "too_large") return json(413, { error: "request_too_large" });
      if (parsed.state === "invalid") return json(400, { error: "invalid_request" });
      const body = parsed.value;
      const allowed = action === "repository"
        ? ["repository", "githubInstallationId", "expectedRevision"]
        : action === "workflow"
          ? ["dispatchEnabled", "expectedRevision"]
          : action === "review" ? ["model", "expectedRevision"] : [];
      if (!exactBody(body, allowed)) return json(400, { error: "invalid_request" });
      const input = { ...body, projectId: routeSettingsMatch[1] };
      const admin = routeAdmin(env);
      const value = action === "repository"
        ? await admin.saveRepository(identity.email, input)
        : action === "workflow"
          ? await admin.saveWorkflow(identity.email, input)
          : action === "review"
            ? await admin.saveReview(identity.email, input)
            : await admin.recheck(identity.email, { projectId: routeSettingsMatch[1] });
      return json(200, value);
    }
    if ([
      "/api/settings/repository",
      "/api/settings/workflow",
      "/api/settings/independent-review",
    ].includes(url.pathname)) {
      return json(410, { error: "route_settings_required" });
    }
    const retryRunMatch = url.pathname.match(/^\/api\/runs\/(.+)\/retry$/);
    if (retryRunMatch !== null) {
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      if (Number(request.headers.get("Content-Length") ?? "0") > 4_096) {
        return json(413, { error: "request_too_large" });
      }
      const parsed = await routeBody(request);
      if (parsed.state === "too_large") return json(413, { error: "request_too_large" });
      if (parsed.state === "invalid" || !exactBody(parsed.value, ["failedAttemptId", "retryNode"])) {
        return json(400, { error: "invalid_request" });
      }
      return json(202, await retryRun(env, identity.email, {
        runId: decodeURIComponent(retryRunMatch[1]),
        failedAttemptId: parsed.value.failedAttemptId,
        retryNode: parsed.value.retryNode,
      }));
    }
    const issueSearchHistoryMatch = url.pathname.match(/^\/api\/issues\/([A-Z][A-Z0-9]+-[1-9][0-9]*)\/search$/);
    if (issueSearchHistoryMatch !== null) {
      if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
      const recorded = await new PortalIssueSearchHistoryStore(env.DB)
        .record(identity.email, issueSearchHistoryMatch[1], new Date().toISOString());
      return recorded ? json(200, { recorded: true }) : json(404, { error: "issue_not_found" });
    }
    if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    if (url.pathname === "/api/recent-issues") {
      if (request.method !== "GET") return json(405, { error: "method_not_allowed" });
      try {
        if (!env.RECENT_ISSUES) throw new Error("RecentIssues service binding is unavailable");
        return json(200, await (env.RECENT_ISSUES as unknown as RecentIssuesBinding).list(request.headers.get("CF-Access-Jwt-Assertion")));
      } catch (error) {
        console.error(JSON.stringify({ operation: "recent_issues.list", error: errorDetails(error) }));
        return json(503, { error: { code: "recent_history_unavailable", retryable: true } });
      }
    }
    if (url.pathname === "/api/issues") {
      const query = url.searchParams.get("query") ?? "";
      const issues = await store.searchIssues(query);
      let recentIssues: RecentIssuesUpdate = { state: "unchanged" };
      if (request.method === "GET" && issues.some(issue => issue.key === query.trim().toUpperCase())) {
        try {
          const eligible = await store.eligibleRecentIssue(query.trim().toUpperCase());
          if (eligible) {
            if (!env.RECENT_ISSUES) throw new Error("RecentIssues service binding is unavailable");
            recentIssues = { state: "updated", ...await (env.RECENT_ISSUES as unknown as RecentIssuesBinding).record(request.headers.get("CF-Access-Jwt-Assertion"), eligible) };
          }
        } catch (error) {
          console.error(JSON.stringify({ operation: "recent_issues.record", error: errorDetails(error) }));
          recentIssues = { state: "error", code: "recent_history_unavailable" };
        }
      }
      return json(200, { issues, recentIssues });
    }
    if (url.pathname === "/api/workflows/issues") {
      return json(200, { issues: await store.workflowIssues(identity.email) });
    }
    if (url.pathname === "/api/workflows/simple/issues") {
      return json(200, { issues: await store.simpleIssues() });
    }
    const transcriptMatch = url.pathname.match(
      /^\/api\/attempts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/transcript(\.jsonl)?$/i,
    );
    if (transcriptMatch !== null) {
      const transcript = await new TranscriptReadStore(env.DB, env.ARTIFACTS)
        .read(transcriptMatch[1]);
      if (transcriptMatch[2] === ".jsonl") {
        return new Response(request.method === "HEAD" ? null : transcript.bytes, {
          status: 200,
          headers: {
            ...securityHeaders,
            "Content-Disposition": `attachment; filename="${transcript.issueKey}-${transcript.attemptId}-transcript.jsonl"`,
            "Content-Length": String(transcript.byteSize),
            "Content-Type": "application/x-ndjson; charset=utf-8",
          },
        });
      }
      return json(200, transcriptDto(transcript));
    }
    const issueMatch = url.pathname.match(/^\/api\/issues\/([A-Z][A-Z0-9]+-[1-9][0-9]*|[0-9a-f-]{36})\/runs$/i);
    if (issueMatch !== null) {
      const result = await store.runs(issueMatch[1]);
      return result === null ? json(404, { error: "issue_not_found" }) : json(200, result);
    }
    const reviewArtifactMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/artifacts\/([^/]+)$/);
    if (reviewArtifactMatch !== null) {
      const artifact = await new TraceReviewReadStore(env.DB, env.ARTIFACTS).artifact(
        decodeURIComponent(reviewArtifactMatch[1]),
        decodeURIComponent(reviewArtifactMatch[2]),
      );
      return new Response(request.method === "HEAD" ? null : artifact.bytes, {
        status: 200,
        headers: {
          ...securityHeaders,
          "Content-Type": artifact.mediaType,
          "Content-Length": String(artifact.bytes.byteLength),
          "X-Content-SHA256": artifact.sha256,
        },
      });
    }
    const designReviewArtifactMatch = url.pathname.match(/^\/api\/design-reviews\/([^/]+)\/artifacts\/([^/]+)$/);
    if (designReviewArtifactMatch !== null) {
      const artifact = await new DesignReviewReadStore(env.DB, env.ARTIFACTS).artifact(
        decodeURIComponent(designReviewArtifactMatch[1]),
        decodeURIComponent(designReviewArtifactMatch[2]),
      );
      return new Response(request.method === "HEAD" ? null : artifact.bytes, {
        status: 200,
        headers: { ...securityHeaders, "Content-Type": artifact.mediaType,
          "Content-Length": String(artifact.bytes.byteLength), "X-Content-SHA256": artifact.sha256 },
      });
    }
    const designReviewMatch = url.pathname.match(/^\/api\/runs\/(.+)\/design-review$/);
    if (designReviewMatch !== null) {
      const result = await new DesignReviewReadStore(env.DB, env.ARTIFACTS)
        .projection(decodeURIComponent(designReviewMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    const reviewMatch = url.pathname.match(/^\/api\/runs\/(.+)\/review$/);
    if (reviewMatch !== null) {
      const result = await new TraceReviewReadStore(env.DB, env.ARTIFACTS)
        .projection(decodeURIComponent(reviewMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    const processArtifactMatch = url.pathname.match(
      /^\/api\/process-attempts\/([0-9a-f-]{36})\/artifacts\/([^/]+)$/i,
    );
    if (processArtifactMatch !== null) {
      const artifact = await new ReviewStoryReadStore(env.DB, env.ARTIFACTS).artifact(
        processArtifactMatch[1],
        decodeURIComponent(processArtifactMatch[2]),
      );
      return new Response(request.method === "HEAD" ? null : artifact.bytes, {
        status: 200,
        headers: {
          ...securityHeaders,
          "Content-Type": artifact.mediaType,
          "Content-Length": String(artifact.bytes.byteLength),
          "X-Content-SHA256": artifact.sha256,
        },
      });
    }
    const pullRequestStoryMatch = url.pathname.match(
      /^\/api\/pull-requests\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/([1-9][0-9]*)\/review-story$/,
    );
    if (pullRequestStoryMatch !== null) {
      const result = await new ReviewStoryReadStore(env.DB, env.ARTIFACTS).projection(
        `${pullRequestStoryMatch[1]}/${pullRequestStoryMatch[2]}`,
        Number(pullRequestStoryMatch[3]),
      );
      return result === null ? json(404, { error: "governed_pull_request_not_found" }) : json(200, result);
    }
    const errorMatch = url.pathname.match(/^\/api\/diagnostics\/([0-9a-f-]{36})$/i);
    if (errorMatch !== null && request.method === "GET") {
      const row = await env.DB.prepare("SELECT detail_r2_key FROM workflow_errors WHERE error_id = ?")
        .bind(errorMatch[1]).first<{ detail_r2_key: string }>();
      if (row === null) return json(404, { error: "Original error not found" });
      const detail = await env.ARTIFACTS.get(row.detail_r2_key);
      if (detail === null) return json(404, { error: `Original error object is missing: ${row.detail_r2_key}` });
      return json(200, JSON.parse(await detail.text()));
    }
    const runMatch = url.pathname.match(/^\/api\/runs\/(.+)$/);
    if (runMatch !== null) {
      const result = await store.projection(decodeURIComponent(runMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    return json(404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { detail: errorDetails(error), message: errorText(error), error: "invalid_request" });
    if (error instanceof TranscriptNotFoundError) return json(404, { detail: errorDetails(error), message: errorText(error), error: "transcript_not_found" });
    if (error instanceof TranscriptUnavailableError) return json(503, { detail: errorDetails(error), message: errorText(error), error: "transcript_unavailable" });
    if (error instanceof TraceReviewNotFoundError) return json(404, { detail: errorDetails(error), message: errorText(error), error: "review_artifact_not_found" });
    if (error instanceof TraceReviewArtifactError) return json(503, { detail: errorDetails(error), message: errorText(error), error: "review_artifact_unavailable" });
    if (error instanceof DesignReviewNotFoundError) return json(404, { detail: errorDetails(error), message: errorText(error), error: "design_review_artifact_not_found" });
    if (error instanceof DesignReviewArtifactError) return json(503, { detail: errorDetails(error), message: errorText(error), error: "design_review_artifact_unavailable" });
    if (error instanceof ReviewStoryNotFoundError) return json(404, { detail: errorDetails(error), message: errorText(error), error: "process_artifact_not_found" });
    if (error instanceof ReviewStoryArtifactError) return json(503, { detail: errorDetails(error), message: errorText(error), error: "process_artifact_unavailable" });
    const adminError = routeAdminError(error);
    if (adminError !== null) {
      const status = adminError === "invalid_input" || adminError === "unsupported_review_model" ? 400
        : adminError === "invalid_stage_retry" ? 400
        : adminError === "route_not_found" || adminError.endsWith("_not_available") ? 404
        : adminError === "unauthorized_actor" ? 403
        : adminError === "route_exists" || adminError.startsWith("stale_") ||
          adminError === "github_access_not_ready" || adminError === "stage_retry_not_eligible" ||
          adminError === "stage_retry_identity_mismatch" ? 409
        : 503;
      return json(status, { detail: errorDetails(error), message: errorText(error), error: adminError });
    }
    return json(503, { detail: errorDetails(error), message: errorText(error), error: "portal_data_unavailable" });
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return routePortalRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
