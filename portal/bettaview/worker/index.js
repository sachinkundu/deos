import { verifyAccess } from "./access.js";
import { base64url } from "./github-core.js";
import {
  github,
  loadPullRequest,
  publishBatchReview,
  publishReply,
  publishReviewDecision,
} from "./github-api.js";
export { GitHubSession } from "./session.js";

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://raw.githubusercontent.com https://github.com https://user-images.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' https://github.com",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const json = (status, body, extraHeaders = {}) => Response.json(body, {
  status,
  headers: { ...securityHeaders, ...extraHeaders },
});

function sessionId(request) {
  const match = request.headers.get("Cookie")?.match(/(?:^|;\s*)bettaview_session=([A-Za-z0-9_-]{32,128})(?:;|$)/);
  return match?.[1] || null;
}

function newSessionId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

function sessionCookie(id) {
  return `bettaview_session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`;
}

function clearSessionCookie() {
  return "bettaview_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

function accessTokenFromRequest(request) {
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  if (assertion) return assertion;
  const cookie = request.headers.get("Cookie")?.match(/(?:^|;\s*)CF_Authorization=([^;]+)(?:;|$)/i);
  return cookie?.[1] || null;
}

function accessFailureReason(error, token) {
  if (!token) return "missing_access_token";
  if (error?.code === "ERR_JWT_CLAIM_VALIDATION_FAILED") return "invalid_access_claim";
  if (error?.code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") return "invalid_access_signature";
  if (error?.code === "ERR_JWKS_NO_MATCHING_KEY") return "access_key_unavailable";
  return "invalid_access_token";
}

function sessionStub(env, id) {
  return env.GITHUB_SESSIONS.get(env.GITHUB_SESSIONS.idFromName(id));
}

async function userToken(request, env) {
  const id = sessionId(request);
  if (!id) return null;
  const response = await sessionStub(env, id).fetch("https://session/token");
  if (!response.ok) return null;
  return (await response.json()).accessToken;
}

function safeReturnTo(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function githubStart(request, env) {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return json(503, { error: "github_authorization_unavailable" });
  }
  const url = new URL(request.url);
  const id = sessionId(request) || newSessionId();
  const redirectUri = `${url.origin}/auth/github/callback`;
  const response = await sessionStub(env, id).fetch("https://session/start", {
    method: "POST",
    body: JSON.stringify({ returnTo: safeReturnTo(url.searchParams.get("returnTo")), redirectUri }),
  });
  if (!response.ok) return json(503, { error: "github_authorization_unavailable" });
  const { state, challenge } = await response.json();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("allow_signup", "false");
  return new Response(null, {
    status: 302,
    headers: { Location: authorize.toString(), "Set-Cookie": sessionCookie(id), ...securityHeaders },
  });
}

async function githubCallback(request, env) {
  const url = new URL(request.url);
  const id = sessionId(request);
  if (!id || !url.searchParams.get("code") || !url.searchParams.get("state")) {
    return json(400, { error: "invalid_github_callback" });
  }
  const response = await sessionStub(env, id).fetch("https://session/callback", {
    method: "POST",
    body: JSON.stringify({ code: url.searchParams.get("code"), state: url.searchParams.get("state") }),
  });
  const value = await response.json();
  if (!response.ok) return json(response.status, value);
  return new Response(null, { status: 302, headers: { Location: safeReturnTo(value.returnTo), ...securityHeaders } });
}

async function githubLogout(request, env) {
  const id = sessionId(request);
  if (id) await sessionStub(env, id).fetch("https://session/clear", { method: "POST" });
  return new Response(null, {
    status: 302,
    headers: { Location: "/", "Set-Cookie": clearSessionCookie(), ...securityHeaders },
  });
}

async function proxyDeosArtifact(request, env, accessToken, pathname) {
  const target = pathname.replace(/^\/api\/deos/, "/api");
  const response = await env.DEOS_PORTAL.fetch(new Request(`https://deos.internal${target}`, {
    method: request.method,
    headers: { "CF-Access-Jwt-Assertion": accessToken, Accept: request.headers.get("Accept") || "*/*" },
  }));
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function routeBettaViewRequest(request, env, authenticate = verifyAccess) {
  const accessToken = accessTokenFromRequest(request);
  try {
    await authenticate(accessToken, {
      teamDomain: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
      allowedEmail: env.ALLOWED_EMAIL,
    });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "forbidden";
    const reason = forbidden ? "email_not_allowed" : accessFailureReason(error, accessToken);
    console.warn("BettaView Access verification failed", { reason });
    return json(forbidden ? 403 : 401, { error: forbidden ? "forbidden" : "unauthorized", reason });
  }

  const url = new URL(request.url);
  if (url.pathname === "/auth/github") return githubStart(request, env);
  if (url.pathname === "/auth/github/callback") return githubCallback(request, env);
  if (url.pathname === "/auth/logout") return githubLogout(request, env);

  if (url.pathname.startsWith("/api/")) {
    try {
      if (url.pathname === "/api/session" && request.method === "GET") {
        const token = await userToken(request, env);
        if (!token) return json(200, { authenticated: false, loginUrl: `/auth/github?returnTo=${encodeURIComponent(`${url.pathname === "/api/session" ? "/" : url.pathname}${url.search}`)}` });
        const viewer = await github(token, "/user");
        return json(200, { authenticated: true, viewerLogin: viewer.login, logoutUrl: "/auth/logout" });
      }
      if (["GET", "HEAD"].includes(request.method) && url.pathname.startsWith("/api/deos/process-attempts/")) {
        return proxyDeosArtifact(request, env, accessToken, url.pathname);
      }
      if (url.pathname === "/api/traceability/reviews") {
        return json(404, { error: "cloud_trace_generation_disabled" });
      }
      const token = await userToken(request, env);
      if (!token) return json(401, {
        error: "github_authorization_required",
        loginUrl: `/auth/github?returnTo=${encodeURIComponent(`/${url.searchParams.get("url") ? `?pr=${encodeURIComponent(url.searchParams.get("url"))}` : ""}`)}`,
      });
      if (url.pathname === "/api/pr" && request.method === "GET") {
        return json(200, await loadPullRequest(token, url.searchParams.get("url") || "", env, accessToken));
      }
      if (request.method === "POST") {
        if (Number(request.headers.get("Content-Length") || "0") > 16 * 1024 * 1024) {
          return json(413, { error: "request_too_large" });
        }
        const body = await request.json();
        if (url.pathname === "/api/comments/batch") return json(200, await publishBatchReview(token, body));
        if (url.pathname === "/api/comments/reply") return json(200, await publishReply(token, body));
        if (url.pathname === "/api/reviews") return json(200, await publishReviewDecision(token, body));
      }
      return json(404, { error: "route_not_found" });
    } catch (error) {
      const status = Number.isInteger(error?.status) && error.status >= 400 ? error.status : 400;
      return json(status, { error: error instanceof Error ? error.message : "request_failed", details: error?.details });
    }
  }

  if (!["GET", "HEAD"].includes(request.method)) return json(405, { error: "method_not_allowed" });
  const assetPath = url.pathname === "/" ? "/index.html" : url.pathname.startsWith("/assets/") ? url.pathname : null;
  if (!assetPath) return json(404, { error: "route_not_found" });
  const assetUrl = new URL(url);
  assetUrl.pathname = assetPath;
  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default { fetch: routeBettaViewRequest };
