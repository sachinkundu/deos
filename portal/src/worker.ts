import { verifyAccess } from "./auth.ts";
import { PortalReadStore } from "./model.ts";
import { RepositorySettingsError, RepositorySettingsStore } from "./settings.ts";
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

type PortalRuntimeEnv = Pick<Env, "DB" | "ARTIFACTS" | "ASSETS"> & {
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
  PROJECT_ID: string;
  OPENROUTER_SUPPORTED_MODELS?: string;
};

const supportedOpenRouterModels = (value: string): readonly string[] => {
  const models = value.split(",").map((model) => model.trim()).filter(Boolean).sort();
  if (
    models.length === 0 || models.length > 50 || new Set(models).size !== models.length ||
    models.some((model) => !/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(model))
  ) throw new Error("supported model configuration is invalid");
  return models;
};

export const routePortalRequest = async (
  request: Request,
  env: PortalRuntimeEnv,
  authenticate: typeof verifyAccess = verifyAccess,
): Promise<Response> => {
  let identity: { email: string };
  try {
    identity = await authenticate(request.headers.get("CF-Access-Jwt-Assertion"), {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unauthorized";
    return json(message === "forbidden" ? 403 : 401, { error: message === "authentication unavailable" ? "authentication_unavailable" : "unauthorized" });
  }
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    const assetPath = url.pathname === "/"
      ? "/index.html"
      : url.pathname === "/settings" || url.pathname === "/settings/"
        ? "/settings.html"
        : /^\/runs\/.+\/review\/?$/.test(url.pathname)
          ? "/index.html"
        : url.pathname.startsWith("/assets/")
          ? url.pathname
          : null;
    if (assetPath === null) return json(404, { error: "route_not_found" });
    const assetUrl = new URL(url);
    assetUrl.pathname = assetPath;
    const response = await env.ASSETS.fetch(new Request(assetUrl, request));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const store = new PortalReadStore(env.DB, env.PROJECT_ID);
  try {
    if (url.pathname === "/api/settings/repository") {
      const settings = new RepositorySettingsStore(env.DB);
      if (request.method === "GET") {
        const value = await settings.read(env.PROJECT_ID);
        return value === null ? json(404, { error: "settings_not_found" }) : json(200, value);
      }
      if (request.method === "PUT") {
        if (Number(request.headers.get("Content-Length") ?? "0") > 2_048) {
          return json(413, { error: "request_too_large" });
        }
        const body = await request.json() as { repository?: unknown; expectedRevision?: unknown };
        if (typeof body.repository !== "string" || !Number.isSafeInteger(body.expectedRevision)) {
          return json(400, { error: "invalid_request" });
        }
        const value = await settings.save({
          projectId: env.PROJECT_ID,
          repository: body.repository,
          expectedRevision: body.expectedRevision as number,
          actorEmail: identity.email,
          now: new Date().toISOString(),
        });
        return json(200, value);
      }
      return json(405, { error: "method_not_allowed" });
    }
    if (url.pathname === "/api/settings/workflow") {
      const settings = new RepositorySettingsStore(env.DB);
      if (request.method !== "PUT") return json(405, { error: "method_not_allowed" });
      if (Number(request.headers.get("Content-Length") ?? "0") > 2_048) {
        return json(413, { error: "request_too_large" });
      }
      const body = await request.json() as {
        dispatchEnabled?: unknown;
        expectedRevision?: unknown;
      };
      if (
        Object.keys(body).some((key) => !["dispatchEnabled", "expectedRevision"].includes(key)) ||
        typeof body.dispatchEnabled !== "boolean" ||
        !Number.isSafeInteger(body.expectedRevision)
      ) return json(400, { error: "invalid_request" });
      const value = await settings.saveWorkflowControls({
        projectId: env.PROJECT_ID,
        dispatchEnabled: body.dispatchEnabled,
        expectedRevision: body.expectedRevision as number,
        actorEmail: identity.email,
        now: new Date().toISOString(),
      });
      return json(200, value);
    }
    if (url.pathname === "/api/settings/independent-review") {
      const settings = new RepositorySettingsStore(env.DB);
      const models = supportedOpenRouterModels(env.OPENROUTER_SUPPORTED_MODELS ?? "");
      if (request.method === "GET") {
        const value = await settings.read(env.PROJECT_ID);
        return value === null
          ? json(404, { error: "settings_not_found" })
          : json(200, { settings: value, models });
      }
      if (request.method !== "PUT") return json(405, { error: "method_not_allowed" });
      if (Number(request.headers.get("Content-Length") ?? "0") > 2_048) {
        return json(413, { error: "request_too_large" });
      }
      const body = await request.json() as { model?: unknown; expectedRevision?: unknown };
      if (
        Object.keys(body).some((key) => !["model", "expectedRevision"].includes(key)) ||
        typeof body.model !== "string" || !Number.isSafeInteger(body.expectedRevision)
      ) return json(400, { error: "invalid_request" });
      const value = await settings.saveIndependentReviewModel({
        projectId: env.PROJECT_ID,
        model: body.model,
        supportedModels: models,
        expectedRevision: body.expectedRevision as number,
        actorEmail: identity.email,
        now: new Date().toISOString(),
      });
      return json(200, { settings: value, models });
    }
    if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    if (url.pathname === "/api/issues") {
      return json(200, { issues: await store.searchIssues(url.searchParams.get("query") ?? "") });
    }
    if (url.pathname === "/api/workflows/simple/issues") {
      return json(200, { issues: await store.simpleIssues() });
    }
    const transcriptMatch = url.pathname.match(
      /^\/api\/attempts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/transcript(\.jsonl)?$/i,
    );
    if (transcriptMatch !== null) {
      const transcript = await new TranscriptReadStore(env.DB, env.ARTIFACTS, env.PROJECT_ID)
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
    const issueMatch = url.pathname.match(/^\/api\/issues\/([A-Z][A-Z0-9]+-[1-9][0-9]*)\/runs$/);
    if (issueMatch !== null) {
      const result = await store.runs(issueMatch[1]);
      return result === null ? json(404, { error: "issue_not_found" }) : json(200, result);
    }
    const reviewArtifactMatch = url.pathname.match(/^\/api\/reviews\/([^/]+)\/artifacts\/([^/]+)$/);
    if (reviewArtifactMatch !== null) {
      const artifact = await new TraceReviewReadStore(env.DB, env.ARTIFACTS, env.PROJECT_ID).artifact(
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
    const reviewMatch = url.pathname.match(/^\/api\/runs\/(.+)\/review$/);
    if (reviewMatch !== null) {
      const result = await new TraceReviewReadStore(env.DB, env.ARTIFACTS, env.PROJECT_ID)
        .projection(decodeURIComponent(reviewMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    const processArtifactMatch = url.pathname.match(
      /^\/api\/process-attempts\/([0-9a-f-]{36})\/artifacts\/([^/]+)$/i,
    );
    if (processArtifactMatch !== null) {
      const artifact = await new ReviewStoryReadStore(env.DB, env.ARTIFACTS, env.PROJECT_ID).artifact(
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
      const result = await new ReviewStoryReadStore(env.DB, env.ARTIFACTS, env.PROJECT_ID).projection(
        `${pullRequestStoryMatch[1]}/${pullRequestStoryMatch[2]}`,
        Number(pullRequestStoryMatch[3]),
      );
      return result === null ? json(404, { error: "governed_pull_request_not_found" }) : json(200, result);
    }
    const runMatch = url.pathname.match(/^\/api\/runs\/(.+)$/);
    if (runMatch !== null) {
      const result = await store.projection(decodeURIComponent(runMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    return json(404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "invalid_request" });
    if (error instanceof TranscriptNotFoundError) return json(404, { error: "transcript_not_found" });
    if (error instanceof TranscriptUnavailableError) return json(503, { error: "transcript_unavailable" });
    if (error instanceof TraceReviewNotFoundError) return json(404, { error: "review_artifact_not_found" });
    if (error instanceof TraceReviewArtifactError) return json(503, { error: "review_artifact_unavailable" });
    if (error instanceof ReviewStoryNotFoundError) return json(404, { error: "process_artifact_not_found" });
    if (error instanceof ReviewStoryArtifactError) return json(503, { error: "process_artifact_unavailable" });
    if (error instanceof RepositorySettingsError) {
      const status = error.code === "invalid_repository" ? 400
        : error.code === "settings_not_found" ? 404
        : error.code === "invalid_independent_review_model" ? 400
        : error.code === "active_run" || error.code === "stale_revision" ||
          error.code === "stale_workflow_revision" ||
          error.code === "stale_independent_review_revision" ? 409
        : 503;
      return json(status, { error: error.code });
    }
    return json(503, { error: "portal_data_unavailable" });
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return routePortalRequest(request, env);
  },
} satisfies ExportedHandler<Env>;
