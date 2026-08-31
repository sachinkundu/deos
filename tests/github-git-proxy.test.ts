import assert from "node:assert/strict";
import test from "node:test";

import type { GitHubTokenProvider } from "../src/github-capability.ts";
import { GitHubGitProxy } from "../src/github-git-proxy.ts";

class TokenProvider implements GitHubTokenProvider {
  calls = 0;
  token() {
    this.calls += 1;
    return Promise.resolve("github-installation-secret");
  }
}

test("Git proxy keeps the App token in the Worker and streams upload-pack", async () => {
  const token = new TokenProvider();
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const proxy = new GitHubGitProxy({
    tokenProvider: () => token,
    fetch: (input, init) => {
      requests.push({ url: String(input), init });
      return Promise.resolve(new Response("pack-response", {
        status: 200,
        headers: { "Content-Type": "application/x-git-upload-pack-result" },
      }));
    },
  });
  const request = new Request("https://deos.example/capabilities/git/git-upload-pack", {
    method: "POST",
    headers: { "Git-Protocol": "version=2" },
    body: "pack-request",
  });

  const response = await proxy.proxy({
    request,
    repository: "sachinkundu/deos-sample-project-2",
    installationId: "154095438",
    kind: "upload_pack",
  });

  assert.equal(response.status, 200);
  const responseBody = await response.text();
  assert.equal(responseBody, "pack-response");
  assert.equal(token.calls, 1);
  assert.equal(
    requests[0].url,
    "https://github.com/sachinkundu/deos-sample-project-2.git/git-upload-pack",
  );
  assert.equal(requests[0].init?.method, "POST");
  const headers = new Headers(requests[0].init?.headers);
  assert.equal(
    headers.get("Authorization"),
    `Basic ${btoa("x-access-token:github-installation-secret")}`,
  );
  assert.equal(headers.get("Git-Protocol"), "version=2");
  assert.equal(request.headers.get("Authorization"), null);
  assert.equal(responseBody.includes("github-installation-secret"), false);
});

test("Git proxy rejects invalid targets and hides upstream error bodies", async () => {
  const token = new TokenProvider();
  const proxy = new GitHubGitProxy({
    tokenProvider: () => token,
    fetch: () => Promise.resolve(new Response("provider secret detail", { status: 403 })),
  });
  const request = new Request(
    "https://deos.example/capabilities/git/info/refs?service=git-upload-pack",
  );

  const invalid = await proxy.proxy({
    request,
    repository: "../outside",
    installationId: "154095438",
    kind: "advertisement",
  });
  assert.equal(invalid.status, 400);
  assert.equal(token.calls, 0);

  const upstream = await proxy.proxy({
    request,
    repository: "sachinkundu/deos-sample-project-2",
    installationId: "154095438",
    kind: "advertisement",
  });
  assert.equal(upstream.status, 403);
  assert.equal((await upstream.text()).includes("provider secret detail"), false);
});
