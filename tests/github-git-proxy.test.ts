import assert from "node:assert/strict";
import test from "node:test";

import type { GitHubTokenProvider } from "../src/github-capability.ts";
import { captureErrors } from "../src/error-context.ts";
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

test("Git proxy normalizes transient upstream failures to HTTP 502", async () => {
  const proxy = new GitHubGitProxy({
    tokenProvider: () => new TokenProvider(),
    fetch: () => Promise.resolve(new Response("temporary provider failure", { status: 429 })),
  });
  const request = new Request(
    "https://deos.example/capabilities/git/info/refs?service=git-upload-pack",
  );

  const response = await proxy.proxy({
    request,
    repository: "sachinkundu/deos-sample-project-2",
    installationId: "154095438",
    kind: "advertisement",
  });

  assert.equal(response.status, 502);
  assert.equal((await response.text()).includes("temporary provider failure"), false);
});


test("checkout upstream diagnostics keep status and body with token redaction", async () => {
  let saved: unknown;
  const token="github-installation-secret";
  const proxy=new GitHubGitProxy({tokenProvider:()=>new TokenProvider(),
    fetch:()=>Promise.resolve(new Response(`original failure ${token} ${btoa(`x-access-token:${token}`)}`,
      {status:502,headers:{"x-github-request-id":"request-123"}}))});
  const response=await captureErrors(async errors=>{saved=errors;},()=>proxy.proxy({
    request:new Request("https://deos.example/capabilities/git/info/refs?service=git-upload-pack"),
    repository:"owner/repo",installationId:"123",kind:"advertisement"}));
  assert.equal(response.status,502);
  const encoded=JSON.stringify(saved);
  assert.match(encoded,/original failure/);assert.match(encoded,/request-123/);
  assert.ok(!encoded.includes(token));assert.ok(!encoded.includes(btoa(`x-access-token:${token}`)));
});
