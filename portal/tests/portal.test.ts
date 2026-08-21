import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { verifyAccess } from "../src/auth.ts";
import { PORTAL_SELECTS } from "../src/model.ts";
import { validatePresentationManifest } from "../src/manifests.ts";
import { routePortalRequest } from "../src/worker.ts";
import type { LoadedWorkflowDefinition } from "../../src/workflow-definition.ts";

test("Access verification binds signature, issuer, audience, expiry, and exact email", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "portal-test";
  const issuer = "https://deos-test.cloudflareaccess.com";
  const token = await new SignJWT({ email: "sachinkundu@gmail.com" })
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(issuer)
    .setAudience("portal-audience")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(privateKey);
  const keys = createLocalJWKSet({ keys: [jwk] });
  assert.deepEqual(await verifyAccess(token, {
    teamDomain: "deos-test.cloudflareaccess.com",
    audience: "portal-audience",
    allowedEmail: "sachinkundu@gmail.com",
  }, keys), { email: "sachinkundu@gmail.com" });
  await assert.rejects(() => verifyAccess(token, {
    teamDomain: "deos-test.cloudflareaccess.com",
    audience: "wrong-audience",
    allowedEmail: "sachinkundu@gmail.com",
  }, keys));
  await assert.rejects(() => verifyAccess(token, {
    teamDomain: "deos-test.cloudflareaccess.com",
    audience: "portal-audience",
    allowedEmail: "another@example.com",
  }, keys), /forbidden/);
});

test("every portal query belongs to the closed read-only SELECT inventory", () => {
  for (const query of Object.values(PORTAL_SELECTS)) {
    assert.match(query.trim(), /^SELECT\b/i);
    assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/i);
  }
});

test("the current exact workflow digest has complete presentation coverage", async () => {
  const nodeIds = [
    "requirements", "requirements_review", "requirements_approval", "openspec_proposal",
    "openspec_specs", "bdd_review", "ddd_architecture", "ddd_review",
    "architecture_approval", "openspec_tasks", "await_openspec_tasks", "implementation",
    "code_review", "evidence_verification", "openspec_verify", "final_approval",
    "deploy", "sync_and_archive", "done", "canceled", "denied", "agent_blocked",
    "agent_failed", "system_action_failed",
  ];
  const nodes = Object.fromEntries(nodeIds.map((id, index) => [id, {
    id,
    type: "terminal",
    outcome: "succeeded",
    edges: index + 1 < nodeIds.length ? { next: nodeIds[index + 1] } : {},
  }]));
  const definition = {
    digest: "e85de9ed70c046cfe07a1611b1e0a1c2678cd58dbcfe8edc9ea73856bb6b86c3",
    start: "requirements",
    nodes,
  } as unknown as LoadedWorkflowDefinition;
  const manifest = validatePresentationManifest(definition);
  assert.equal(manifest.size, Object.keys(definition.nodes).length);
  for (const node of Object.values(definition.nodes)) {
    assert.ok(manifest.has(node.id));
    for (const target of Object.values(node.edges)) assert.ok(manifest.has(target));
  }
});

test("authentication runs before assets, route methods, or D1", async () => {
  let assetReads = 0;
  const env = {
    DB: {} as D1Database,
    ASSETS: { fetch: async () => { assetReads += 1; return new Response("portal"); } } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
  };
  const denied = await routePortalRequest(new Request("https://deos.example/", { method: "POST" }), env, async () => { throw new Error("unauthorized"); });
  assert.equal(denied.status, 401);
  assert.equal(assetReads, 0);
  const allowed = await routePortalRequest(new Request("https://deos.example/"), env, async () => ({ email: "sachinkundu@gmail.com" }));
  assert.equal(allowed.status, 200);
  assert.equal(await allowed.text(), "portal");
  assert.equal(assetReads, 1);
});
