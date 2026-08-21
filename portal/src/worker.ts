import { verifyAccess } from "./auth.ts";
import { PortalReadStore } from "./model.ts";

interface PortalEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
}

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const json = (status: number, body: Record<string, unknown>): Response => Response.json(body, { status, headers: securityHeaders });

export const routePortalRequest = async (
  request: Request,
  env: PortalEnv,
  authenticate: typeof verifyAccess = verifyAccess,
): Promise<Response> => {
  try {
    await authenticate(request.headers.get("CF-Access-Jwt-Assertion"), {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unauthorized";
    return json(message === "forbidden" ? 403 : 401, { error: message === "authentication unavailable" ? "authentication_unavailable" : "unauthorized" });
  }
  if (!(["GET", "HEAD"].includes(request.method))) return json(405, { error: "method_not_allowed" });
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const store = new PortalReadStore(env.DB);
  try {
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
  } catch {
    return json(503, { error: "portal_data_unavailable" });
  }
};

export default {
  fetch(request: Request, env: PortalEnv): Promise<Response> {
    return routePortalRequest(request, env);
  },
} satisfies ExportedHandler<PortalEnv>;
