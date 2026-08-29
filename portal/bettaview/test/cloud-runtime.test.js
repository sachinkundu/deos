import assert from "node:assert/strict";
import test from "node:test";
import {
  marker,
  parsePullRequestUrl,
  readMarker,
} from "../worker/github-core.js";
import { routeBettaViewRequest } from "../worker/index.js";

const allowed = async () => ({ email: "sachinkundu@gmail.com" });

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
  assert.deepEqual(await response.json(), { error: "github_authorization_unavailable" });
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
