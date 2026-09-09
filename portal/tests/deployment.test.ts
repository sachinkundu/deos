import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deploymentMetadata, labelPortalHtml } from "../src/deployment.ts";
import { routePortalRequest } from "../src/worker.ts";

test("staging and production use distinct hosts and Workers with identical shared bindings", () => {
  const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  const staging = config.env.staging;
  assert.equal(config.name, "deos-workflow-portal");
  assert.equal(staging.name, "deos-workflow-portal-staging");
  assert.equal(config.routes[0].pattern, "deos.voxdez.com");
  assert.equal(staging.routes[0].pattern, "deos-staging.voxdez.com");
  assert.equal(staging.vars.PORTAL_SOURCE_BRANCH, "main");
  assert.equal(config.vars.PORTAL_SOURCE_BRANCH, "release");
  for (const key of ["d1_databases", "r2_buckets", "services", "secrets"]) {
    assert.deepEqual(staging[key], config[key]);
  }
});

test("HTML identity comes from the target and handles both portal entry titles", () => {
  for (const site of ["Staging", "Production"]) {
    for (const title of ["DEOS Workflow Portal", "DEOS Workflow Settings"]) {
      const html = labelPortalHtml(`<head><title>${title}</title></head><body></body>`, { PORTAL_SITE: site });
      assert.ok(html.includes(`<title>${title} · ${site}</title>`));
      assert.ok(html.includes(`<meta name="deos-site" content="${site}">`));
    }
  }
  assert.equal(deploymentMetadata({ PORTAL_SITE: '<script>alert(1)</script>' }).site, "Development");
});

test("safe version endpoint exposes only deployment metadata and never reads stores", async () => {
  const env = {
    PORTAL_SITE: "Staging", PORTAL_CANONICAL_HOST: "deos-staging.voxdez.com",
    PORTAL_SOURCE_BRANCH: "main", PORTAL_SOURCE_SHA: "a".repeat(40),
    CF_VERSION_METADATA: { id: "provider-version" },
    ACCESS_TEAM_DOMAIN: "test", ACCESS_AUD: "test", ALLOWED_EMAIL: "test@example.com",
    DB: {} as D1Database, ARTIFACTS: {} as R2Bucket, ASSETS: {} as Fetcher,
  };
  const request = new Request("https://deos.voxdez.com/api/version");
  const denied = await routePortalRequest(request, env, async () => { throw new Error("unauthorized"); });
  assert.equal(denied.status, 200);
  const response = await routePortalRequest(request, env, async () => ({ email: "test@example.com" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), {
    site: "Staging", canonicalHost: "deos-staging.voxdez.com", sourceBranch: "main",
    sourceSha: "a".repeat(40), versionId: "provider-version",
  });
  const post = await routePortalRequest(new Request(request.url, { method: "POST" }), env,
    async () => ({ email: "test@example.com" }));
  assert.equal(post.status, 405);
});
