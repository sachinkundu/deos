import assert from "node:assert/strict";
import test from "node:test";

import { GitHubAppCatalog } from "../src/github-capability.ts";
import { LinearCapabilityAdapter } from "../src/linear-capability.ts";

const privateKeyPem = async (): Promise<string> => {
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: Uint8Array.of(1, 0, 1),
    hash: "SHA-256",
  }, true, ["sign", "verify"]) as CryptoKeyPair;
  const exported = await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer;
  const bytes = new Uint8Array(exported);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
};

test("GitHub App catalog pages safe installations and repositories without crossing tokens", async () => {
  const calls: Array<{ path: string; authorization: string }> = [];
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const authorization = new Headers(init?.headers).get("Authorization") ?? "";
    calls.push({ path: `${url.pathname}${url.search}`, authorization });
    if (url.pathname === "/app/installations") {
      assert.match(authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
      return Response.json([{
        id: 154095438,
        account: { login: "sachinkundu", type: "Organization" },
        target_type: "Organization",
        repository_selection: "selected",
        permissions: { metadata: "read", contents: "write", pull_requests: "write", checks: "write" },
        html_url: "https://github.com/organizations/sachinkundu/settings/installations/154095438",
        suspended_at: null,
      }]);
    }
    if (url.pathname === "/app/installations/154095438/access_tokens") {
      assert.match(authorization, /^Bearer [^.]+\.[^.]+\.[^.]+$/);
      return Response.json({ token: "installation-secret-token" });
    }
    if (url.pathname === "/installation/repositories") {
      assert.equal(authorization, "Bearer installation-secret-token");
      const second = url.searchParams.get("page") === "2";
      return Response.json({
        total_count: 2,
        repositories: [{
          id: second ? 1352134004 : 1345702511,
          full_name: second ? "sachinkundu/deos-sample-project-2" : "sachinkundu/deos-sample-project",
          default_branch: "main",
          private: false,
          archived: false,
          disabled: false,
        }],
      });
    }
    return new Response("provider raw error body", { status: 500 });
  };
  const catalog = new GitHubAppCatalog({
    apiUrl: "https://api.github.test",
    appId: "1234",
    privateKey: await privateKeyPem(),
    fetch: request,
    now: () => new Date("2026-08-31T09:00:00.000Z"),
  });

  const installations = await catalog.list();
  assert.deepEqual(
    installations[0]?.repositories.map((repository) => repository.fullName),
    ["sachinkundu/deos-sample-project", "sachinkundu/deos-sample-project-2"],
  );
  assert.equal(installations[0]?.repositories[0]?.access, "ready");
  assert.equal(
    installations[0]?.settingsUrl,
    "https://github.com/organizations/sachinkundu/settings/installations/154095438",
  );
  const browserSafe = JSON.stringify(installations);
  assert.doesNotMatch(browserSafe, /installation-secret-token|Authorization|privateKey|raw error/i);
  assert.equal(calls.filter((call) => call.path.startsWith("/installation/repositories")).length, 2);
});

test("GitHub App catalog returns a bounded error instead of a provider body", async () => {
  const catalog = new GitHubAppCatalog({
    apiUrl: "https://api.github.test",
    appId: "1234",
    privateKey: await privateKeyPem(),
    fetch: async () => new Response("secret provider body", { status: 503 }),
  });
  await assert.rejects(catalog.list(), (error: unknown) => {
    assert.equal((error as Error).message, "GitHub App installation catalog is unavailable");
    assert.doesNotMatch((error as Error).message, /secret provider body/);
    return true;
  });
});

test("Linear project catalog uses Relay paging and rejects GraphQL errors", async () => {
  let page = 0;
  const adapter = new LinearCapabilityAdapter(
    "https://api.linear.test/graphql",
    "linear-secret-token",
    { fetch: async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer linear-secret-token");
      const request = JSON.parse(String(init?.body)) as { variables: { first: number; after: string | null } };
      assert.equal(request.variables.first, 100);
      page += 1;
      assert.equal(request.variables.after, page === 1 ? null : "cursor-1");
      return Response.json({ data: { projects: {
        nodes: [{
          id: `project-${page}`,
          name: `Project ${page}`,
          url: `https://linear.app/test/project/project-${page}`,
          teams: { nodes: [
            { id: "team-2", name: "Platform", key: "PLT" },
            { id: "team-1", name: "Sachin Kundu", key: "SAC" },
          ] },
        }],
        pageInfo: { hasNextPage: page === 1, endCursor: page === 1 ? "cursor-1" : null },
      } } });
    } },
  );
  const projects = await adapter.listProjects();
  assert.deepEqual(projects.map((project) => project.projectId), ["project-1", "project-2"]);
  assert.deepEqual(projects[0]?.teams.map((team) => team.key), ["PLT", "SAC"]);

  const failed = new LinearCapabilityAdapter("https://api.linear.test/graphql", "token", {
    fetch: async () => Response.json({ errors: [{ message: "provider detail" }] }),
  });
  await assert.rejects(failed.listProjects(), /Linear capability GraphQL request failed/);
});
