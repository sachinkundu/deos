import assert from "node:assert/strict";
import test from "node:test";
import {
  marker,
  parsePullRequestUrl,
  readMarker,
} from "../worker/github-core.js";
import { createBettaViewHandler, routeBettaViewRequest } from "../worker/index.js";

const allowed = async () => ({ email: "sachinkundu@gmail.com" });

test("a test gate header cannot skip the app authentication seam", async () => {
  const response = await routeBettaViewRequest(new Request("https://bettaview.example/", {
    headers: { "X-Deos-Test-Gate": "verified" },
  }), { ...env(), BETTAVIEW_SITE: "Test" }, async () => { throw new Error("missing_access_token"); });
  assert.equal(response.status, 401);
});

test("lease review writes keep the checked identity and use the scoped transport", async () => {
  const calls = [];
  const runtime = { ...env(), BETTAVIEW_SITE: "Test",
    GITHUB_TEST_SESSION: async () => "lease-session",
    GITHUB_REQUEST: async (url) => {
      assert.equal(url, "https://api.github.com/user");
      return Response.json({ id: 42 });
    },
    TEST_REVIEW_CONTINUATION_CALL: async (method, body, identity) => {
      calls.push({ method, body, identity });
      return { reviewId: "review-1", outcome: "continued" };
    },
  };
  const response = await routeBettaViewRequest(new Request(
    "https://bettaview.example/api/review-continuations/action", {
      method: "POST", headers: { "Origin": "https://bettaview.example", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "retry", reviewId: "review-1" }),
    }), runtime, allowed);
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ method: "retryLinear", body: { reviewId: "review-1" },
    identity: { accessAccount: "sachinkundu@gmail.com", githubUserId: 42 } }]);
});

test("lease writes without a scoped review transport remain denied", async () => {
  for (const path of ["/api/review-continuations/publish", "/api/settings/bettaview-account", "/auth/github"]) {
    const response = await routeBettaViewRequest(new Request("https://bettaview.example" + path,
      { method: "POST" }), { ...env(), BETTAVIEW_SITE: "Test" }, allowed);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error, "test_provider_write_requires_trusted_adapter");
  }
});

function env() {
  return {
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "audience",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
    GITHUB_CLIENT_ID: "client-id",
    ASSETS: { fetch: async () => new Response("bettaview") },
    DEOS_PORTAL: { fetch: async () => new Response("not used") },
    GITHUB_SESSIONS: {
      idFromName: (name) => name,
      get: () => ({ fetch: async () => Response.json({ error: "github_authorization_required" }, { status: 401 }) }),
    },
  };
}

test("GitHub authorization fails closed until the client secret is configured", async () => {
  const response = await routeBettaViewRequest(new Request(
    "https://bettaview.example/auth/github",
    { headers: { "CF-Access-Jwt-Assertion": "test" } },
  ), env(), allowed);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "github_authorization_unavailable",
    reason: "missing_github_client_secret",
  });
});

test("GitHub authorization distinguishes a rejected session start", async () => {
  const runtime = env();
  runtime.GITHUB_CLIENT_SECRET = "secret";
  const response = await routeBettaViewRequest(new Request(
    "https://bettaview.example/auth/github",
    { headers: { "CF-Access-Jwt-Assertion": "test" } },
  ), runtime, allowed);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "github_authorization_unavailable",
    reason: "github_session_start_rejected",
    status: 401,
  });
});

test("cloud pull request URLs are canonical and exact", () => {
  assert.deepEqual(parsePullRequestUrl("https://github.com/sachinkundu/deos/pull/65"), {
    owner: "sachinkundu",
    repo: "deos",
    number: 65,
  });
  for (const invalid of [
    "http://github.com/sachinkundu/deos/pull/65",
    "https://example.com/sachinkundu/deos/pull/65",
    "https://github.com/sachinkundu/deos/pull/65/files",
  ]) assert.throws(() => parsePullRequestUrl(invalid));
});

test("cloud review markers retain deduplication identity", () => {
  const metadata = { clientSubmissionId: "submission-1", headSha: "a".repeat(40) };
  assert.deepEqual(readMarker(marker(metadata)), metadata);
});

test("cloud deployment has no trace generation route", async () => {
  const response = await routeBettaViewRequest(new Request("https://bettaview.example/api/traceability/reviews", {
    method: "POST",
    headers: { "CF-Access-Jwt-Assertion": "test" },
  }), env(), allowed);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "cloud_trace_generation_disabled" });
});

test("GitHub authorization is required before a private pull request read", async () => {
  const response = await routeBettaViewRequest(new Request(
    "https://bettaview.example/api/pr?url=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos%2Fpull%2F65",
    { headers: { "CF-Access-Jwt-Assertion": "test" } },
  ), env(), allowed);
  assert.equal(response.status, 401);
  const value = await response.json();
  assert.equal(value.error, "github_authorization_required");
  assert.match(value.loginUrl, /^\/auth\/github\?/);
});

test("lease GitHub session uses its trusted transport without a provider token", async () => {
  const runtime = env();
  let sessionChecks = 0;
  runtime.GITHUB_TEST_SESSION = async () => {
    sessionChecks += 1;
    return "lease-session";
  };
  runtime.GITHUB_REQUEST = async (url, options) => {
    assert.equal(url, "https://api.github.com/user");
    assert.equal(options.headers.Authorization, "Bearer lease-session");
    return Response.json({ login: "reviewer" });
  };
  runtime.GITHUB_SESSIONS = undefined;
  const response = await routeBettaViewRequest(new Request("https://bettaview.example/api/session", {
    headers: { "CF-Access-Jwt-Assertion": "test" },
  }), runtime, allowed);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true, viewerLogin: "reviewer", logoutUrl: "/auth/logout",
  });
  assert.equal(sessionChecks, 1);
});

test("Access denial happens before static assets", async () => {
  let reads = 0;
  const runtime = env();
  runtime.ASSETS.fetch = async () => { reads += 1; return new Response("bettaview"); };
  const response = await routeBettaViewRequest(new Request("https://bettaview.example/"), runtime, async () => {
    throw new Error("unauthorized");
  });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "unauthorized", reason: "missing_access_token" });
  assert.equal(reads, 0);
});

test("Access can validate Cloudflare's authorization cookie when the assertion header is absent", async () => {
  let received = null;
  const response = await routeBettaViewRequest(new Request("https://bettaview.example/", {
    headers: { Cookie: "other=value; CF_Authorization=cookie-token" },
  }), env(), async (token) => {
    received = token;
    return { email: "sachinkundu@gmail.com" };
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "bettaview");
  assert.equal(received, "cookie-token");
});

test("Worker execution context is not mistaken for the Access authenticator", async () => {
  let received = null;
  const worker = createBettaViewHandler(async (token) => {
    received = token;
    return { email: "sachinkundu@gmail.com" };
  });
  const executionContext = { waitUntil() {}, passThroughOnException() {} };
  const response = await worker.fetch(new Request("https://bettaview.example/", {
    headers: { "CF-Access-Jwt-Assertion": "access-token" },
  }), env(), executionContext);

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "bettaview");
  assert.equal(received, "access-token");
});
