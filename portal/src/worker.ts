import { verifyAccess } from "./auth.ts";
import { PortalReadStore } from "./model.ts";
import { RepositorySettingsError, RepositorySettingsStore } from "./settings.ts";

interface PortalEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
  PROJECT_ID: string;
}

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: securityHeaders });

export const routePortalRequest = async (
  request: Request,
  env: PortalEnv,
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
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const store = new PortalReadStore(env.DB);
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
    if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    if (url.pathname === "/api/issues") {
      return json(200, { issues: await store.searchIssues(url.searchParams.get("query") ?? "") });
    }
    const issueMatch = url.pathname.match(/^\/api\/issues\/([A-Z][A-Z0-9]+-[1-9][0-9]*)\/runs$/);
    if (issueMatch !== null) {
      const result = await store.runs(issueMatch[1]);
      return result === null ? json(404, { error: "issue_not_found" }) : json(200, result);
    }
    const runMatch = url.pathname.match(/^\/api\/runs\/(.+)$/);
    if (runMatch !== null) {
      const result = await store.projection(decodeURIComponent(runMatch[1]));
      return result === null ? json(404, { error: "run_not_found" }) : json(200, result);
    }
    return json(404, { error: "route_not_found" });
  } catch (error) {
    if (error instanceof SyntaxError) return json(400, { error: "invalid_request" });
    if (error instanceof RepositorySettingsError) {
      const status = error.code === "invalid_repository" ? 400
        : error.code === "settings_not_found" ? 404
        : error.code === "active_run" || error.code === "stale_revision" ? 409
        : 503;
      return json(status, { error: error.code });
    }
    return json(503, { error: "portal_data_unavailable" });
  }
};

export default {
  fetch(request: Request, env: PortalEnv): Promise<Response> {
    return routePortalRequest(request, env);
  },
} satisfies ExportedHandler<PortalEnv>;
