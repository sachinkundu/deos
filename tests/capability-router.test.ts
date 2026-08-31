import assert from "node:assert/strict";
import test from "node:test";

import { mintCapabilityToken, verifyCapabilityToken } from "../src/capability-auth.ts";
import { CapabilityRouter } from "../src/capability-router.ts";
import type {
  CapabilityContext,
  CapabilityStore,
} from "../src/capability-store.ts";
import type { GitHubCapabilityAdapter } from "../src/github-capability.ts";
import type { GitHubGitProxyAdapter } from "../src/github-git-proxy.ts";
import type { LinearCapabilityAdapter } from "../src/linear-capability.ts";
import type {
  ProviderOperationRecord,
  ProviderOperationState,
} from "../src/linear-transition.ts";
import { OpenRouterReviewError } from "../src/openrouter-review.ts";
import type {
  OpenRouterResponseStore,
  OpenRouterStoredResponse,
} from "../src/openrouter-response-store.ts";

const SECRET = "test-capability-secret-with-more-than-thirty-two-bytes";
const NOW = new Date("2026-08-16T11:00:00.000Z");
const claims = {
  version: 1 as const,
  issuer: "deos" as const,
  audience: "sandbox-capabilities" as const,
  attemptId: "attempt-1",
  runId: "workflow:project-1:issue-1:run:1",
  repository: "sachinkundu/deos",
  issueId: "issue-1",
  actions: [
    "github.clone_repository",
    "github.publish_work_product",
    "linear.upsert_working_note",
  ] as const,
  changeId: null,
  planningBranch: null,
  expiresAt: Math.floor(NOW.getTime() / 1000) + 3600,
};

class Store implements CapabilityStore {
  readonly operations = new Map<string, ProviderOperationRecord>();
  contextValue: CapabilityContext | null = {
    attemptId: claims.attemptId,
    runId: claims.runId,
    issueId: claims.issueId,
    projectId: "project-1",
    repository: claims.repository,
    githubInstallationId: "154095438",
    attemptState: "running",
  };

  context() { return Promise.resolve(this.contextValue); }

  async begin(input: {
    operationId: string;
    runId: string;
    attemptId: string;
    capability: string;
    action: string;
    sanitizedTarget: string;
    requestDigest: string;
    now: string;
  }) {
    const existing = this.operations.get(input.operationId);
    if (existing !== undefined) return { operation: existing, created: false };
    const operation: ProviderOperationRecord = {
      operation_id: input.operationId,
      run_id: input.runId,
      attempt_id: input.attemptId,
      capability: input.capability,
      action: input.action,
      sanitized_target: input.sanitizedTarget,
      request_digest: input.requestDigest,
      state: "pending",
      provider_resource_id: null,
      observed_pre_state: null,
      provider_updated_at: null,
      latest_delivery_id: null,
      safe_error_category: null,
      diagnostic_id: null,
      started_at: input.now,
      updated_at: input.now,
      completed_at: null,
    };
    this.operations.set(input.operationId, operation);
    return { operation, created: true };
  }

  find(operationId: string) { return Promise.resolve(this.operations.get(operationId) ?? null); }

  listAttemptOperations(attemptId: string, action: string) {
    return Promise.resolve([...this.operations.values()].filter((operation) =>
      operation.attempt_id === attemptId && operation.capability === "model" &&
      operation.action === action));
  }

  finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    diagnosticId?: string | null;
    now: string;
  }) {
    const operation = this.operations.get(input.operationId);
    if (operation?.state !== input.expected) return Promise.resolve(false);
    operation.state = input.state;
    operation.provider_resource_id = input.providerResourceId;
    operation.safe_error_category = input.safeErrorCategory;
    operation.diagnostic_id = input.diagnosticId ?? null;
    operation.updated_at = input.now;
    operation.completed_at = input.now;
    return Promise.resolve(true);
  }
}

class GitHub {
  calls = 0;
  fail = false;
  async publish() {
    this.calls += 1;
    if (this.fail) throw new Error("ambiguous");
    return {
      pullRequestId: "pr-17",
      pullRequestUrl: "https://github.com/sachinkundu/deos/pull/17",
      branch: `deos/${claims.attemptId}`,
      reconciled: false,
    };
  }
}

class Linear {
  calls = 0;
  async upsertNote() {
    this.calls += 1;
    return { commentId: "comment-1", reconciled: false };
  }
}

class GitProxy implements GitHubGitProxyAdapter {
  readonly calls: Array<{ repository: string; installationId: string; kind: string }> = [];
  proxy(input: {
    request: Request;
    repository: string;
    installationId: string;
    kind: "advertisement" | "upload_pack";
  }) {
    this.calls.push({
      repository: input.repository,
      installationId: input.installationId,
      kind: input.kind,
    });
    return Promise.resolve(new Response("git-proxy-response", {
      headers: { "Content-Type": "application/x-git-upload-pack-advertisement" },
    }));
  }
}

class Responses implements OpenRouterResponseStore {
  readonly stored = new Map<string, OpenRouterStoredResponse>();
  put(input: OpenRouterStoredResponse & { now: string }) {
    const { now: _now, ...response } = input;
    this.stored.set(input.operationId, response);
    return Promise.resolve();
  }
  get(operationId: string) {
    return Promise.resolve(this.stored.get(operationId) ?? null);
  }
}

const requestBody = {
  version: 1,
  action: "publish_work_product",
  operationKey: "implementation-pr",
  repository: claims.repository,
  branch: `deos/${claims.attemptId}`,
  baseBranch: "main",
  title: "Implement controlled task",
  body: "Bounded work product",
  files: [{ path: "src/example.ts", content: "export const value = 1;\n" }],
};

const setup = async () => {
  const store = new Store();
  const github = new GitHub();
  const selectedInstallations: string[] = [];
  const linear = new Linear();
  const gitProxy = new GitProxy();
  const router = new CapabilityRouter({
    store,
    github: github as unknown as GitHubCapabilityAdapter,
    githubForInstallation: (installationId) => {
      selectedInstallations.push(installationId);
      return github as unknown as GitHubCapabilityAdapter;
    },
    githubGit: gitProxy,
    linear: linear as unknown as LinearCapabilityAdapter,
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(claims, SECRET);
  const invoke = (path: "github" | "linear", body: unknown, attempt = claims.attemptId) =>
    router.handle(new Request(`https://worker.example/capabilities/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": attempt,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }));
  const invokeGit = (kind: "advertisement" | "upload_pack" = "advertisement") => router.handle(new Request(
    kind === "advertisement"
      ? "https://worker.example/capabilities/git/info/refs?service=git-upload-pack"
      : "https://worker.example/capabilities/git/git-upload-pack",
    {
      method: kind === "advertisement" ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": claims.attemptId,
        ...(kind === "upload_pack" ? { "Content-Type": "application/x-git-upload-pack-request" } : {}),
      },
      ...(kind === "upload_pack" ? { body: "pack-request" } : {}),
    },
  ));
  return { store, github, selectedInstallations, linear, gitProxy, router, token, invoke, invokeGit };
};

test("signed capability token is scoped and expires", async () => {
  const token = await mintCapabilityToken(claims, SECRET);
  assert.deepEqual(await verifyCapabilityToken(token, SECRET, NOW.getTime()), claims);
  await assert.rejects(verifyCapabilityToken(token, `${SECRET}-wrong`, NOW.getTime()));
  await assert.rejects(
    verifyCapabilityToken(token, SECRET, (claims.expiresAt + 1) * 1000),
    /expired/,
  );
});

test("repository checkout proxy accepts only the active frozen attempt", async () => {
  const active = await setup();
  active.store.contextValue = { ...active.store.contextValue!, attemptState: "pending" };
  const response = await active.invokeGit();
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "git-proxy-response");
  assert.deepEqual(active.gitProxy.calls, [{
    repository: claims.repository,
    installationId: "154095438",
    kind: "advertisement",
  }]);

  assert.equal((await active.invokeGit("upload_pack")).status, 200);
  assert.deepEqual(active.gitProxy.calls[1], {
    repository: claims.repository,
    installationId: "154095438",
    kind: "upload_pack",
  });

  active.store.contextValue = { ...active.store.contextValue!, attemptState: "completed" };
  assert.equal((await active.invokeGit()).status, 403);
  assert.equal(active.gitProxy.calls.length, 2);
});

test("allowed GitHub work product uses the frozen install once and duplicate returns the durable receipt", async () => {
  const { invoke, github, selectedInstallations, store } = await setup();
  const first = await invoke("github", requestBody);
  const second = await invoke("github", requestBody);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(github.calls, 1);
  assert.deepEqual(selectedInstallations, ["154095438"]);
  assert.equal(store.operations.size, 1);
  const receipt = await second.json() as { state: string; providerResourceId: string };
  assert.equal(receipt.state, "succeeded");
  assert.equal(receipt.providerResourceId, "pr-17");
});

test("repository, branch, path, and Linear transition denials occur before providers", async () => {
  for (const body of [
    { ...requestBody, repository: "someone/else" },
    { ...requestBody, branch: "main" },
    { ...requestBody, files: [{ path: ".github/workflows/exfiltrate.yml", content: "bad" }] },
  ]) {
    const { invoke, github } = await setup();
    const response = await invoke("github", body);
    assert.equal(response.status, 403);
    assert.equal(github.calls, 0);
  }
  const { invoke, linear, store } = await setup();
  const response = await invoke("linear", {
    version: 1,
    action: "transition_issue",
    operationKey: "move-state",
    issueId: claims.issueId,
    body: "Human Approval",
  });
  assert.equal(response.status, 403);
  assert.equal(linear.calls, 0);
  assert.equal([...store.operations.values()][0].state, "denied");
});

test("Linear capability permits only the declared note action on the scoped issue", async () => {
  const allowed = await setup();
  const allowedResponse = await allowed.invoke("linear", {
    version: 1,
    action: "upsert_working_note",
    operationKey: "upsert-working-note",
    issueId: claims.issueId,
    body: "Progress note",
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowed.linear.calls, 1);
  const undeclared = await setup();
  const undeclaredResponse = await undeclared.invoke("linear", {
    version: 1,
    action: "attach_artifact_reference",
    operationKey: "attach-artifact-reference",
    issueId: claims.issueId,
    body: "r2://sanitized/reference",
  });
  assert.equal(undeclaredResponse.status, 403);
  assert.equal(undeclared.linear.calls, 0);
  const { invoke, linear } = await setup();
  assert.equal((await invoke("linear", {
    version: 1,
    action: "upsert_working_note",
    operationKey: "wrong-issue",
    issueId: "issue-2",
    body: "No",
  })).status, 403);
  assert.equal(linear.calls, 0);
});

test("ambiguous provider response is durable and cannot leak provider credentials", async () => {
  const { invoke, github, store } = await setup();
  github.fail = true;
  const response = await invoke("github", requestBody);
  assert.equal(response.status, 502);
  const text = await response.text();
  assert.equal(text.includes(SECRET), false);
  assert.equal(text.includes("token"), false);
  assert.equal([...store.operations.values()][0].state, "manual_reconciliation_required");
});

test("inactive or mismatched attempt is rejected before provider access", async () => {
  const { invoke, github, store } = await setup();
  assert.equal((await invoke("github", requestBody, "attempt-2")).status, 403);
  store.contextValue = { ...store.contextValue!, attemptState: "completed" };
  assert.equal((await invoke("github", requestBody)).status, 403);
  assert.equal(github.calls, 0);
});

test("OpenRouter capability permits one exact saved-model call and no repair call", async () => {
  const store = new Store();
  let reviewCalls = 0;
  const modelClaims = {
    ...claims,
    actions: ["model.openrouter_review"] as const,
    modelProvider: "openrouter" as const,
    model: "deepseek/deepseek-v4-pro",
    reasoning: "high",
  };
  const router = new CapabilityRouter({
    store,
    github: new GitHub() as unknown as GitHubCapabilityAdapter,
    linear: new Linear() as unknown as LinearCapabilityAdapter,
    openrouter: { review: async () => {
      reviewCalls += 1;
      return {
        model: modelClaims.model,
        providerRequestId: "request-1",
        result: { findings: [] },
        rawResponse: { id: "request-1" },
      };
    } },
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(modelClaims, SECRET);
  const invoke = (repairAttempt: number) => router.handle(new Request(
    "https://worker.example/capabilities/model-review",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": claims.attemptId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        action: "openrouter_trace_review",
        model: modelClaims.model,
        reasoning: modelClaims.reasoning,
        mode: "discovery",
        repairAttempt,
        prompt: "Review the exact plan.",
      }),
    },
  ));
  assert.equal((await invoke(0)).status, 200);
  assert.equal((await invoke(0)).status, 409);
  assert.equal((await invoke(1)).status, 403);
  assert.equal(reviewCalls, 1);
});

test("OpenRouter failure returns a safe durable diagnostic reference", async () => {
  const store = new Store();
  const diagnostics: Array<Record<string, unknown>> = [];
  const modelClaims = {
    ...claims,
    actions: ["model.openrouter_review"] as const,
    modelProvider: "openrouter" as const,
    model: "deepseek/deepseek-v4-pro",
    reasoning: "high",
  };
  const router = new CapabilityRouter({
    store,
    github: new GitHub() as unknown as GitHubCapabilityAdapter,
    linear: new Linear() as unknown as LinearCapabilityAdapter,
    openrouter: { review: async () => {
      throw new OpenRouterReviewError("OpenRouter HTTP 400", {
        stage: "http",
        httpStatus: 400,
        providerCode: "invalid_request_error",
        providerType: "invalid_request_error",
        providerMessage: "Invalid JSON schema; secret sk-or-v1-should-never-be-returned",
        providerRequestId: "request-error-1",
        responseContentType: "application/json",
        responseBodySha256: "abc123",
        responseTruncated: false,
        requestMayHaveSucceeded: false,
        retryable: false,
        rawResponseBody: "{\"error\":\"protected\"}",
      });
    } },
    diagnostics: { record: async (input) => {
      diagnostics.push(input);
      return "diagnostic:provider:test";
    } },
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(modelClaims, SECRET);
  const response = await router.handle(new Request(
    "https://worker.example/capabilities/model-review",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": claims.attemptId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: 1,
        action: "openrouter_trace_review",
        model: modelClaims.model,
        reasoning: modelClaims.reasoning,
        mode: "discovery",
        repairAttempt: 0,
        prompt: "Review the exact plan.",
      }),
    },
  ));
  assert.equal(response.status, 502);
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.state, "failed");
  assert.equal(body.safeErrorCategory, "openrouter_http_400");
  assert.equal(body.diagnosticId, "diagnostic:provider:test");
  assert.equal(JSON.stringify(body).includes("secret"), false);
  assert.equal(JSON.stringify(body).includes("Invalid JSON schema"), false);
  assert.equal(diagnostics.length, 1);
  const operation = [...store.operations.values()][0];
  assert.equal(operation.state, "failed");
  assert.equal(operation.safe_error_category, "openrouter_http_400");
  assert.equal(operation.diagnostic_id, "diagnostic:provider:test");
});

test("Codex Responses calls use the saved OpenRouter model and replay durable output", async () => {
  const store = new Store();
  const responses = new Responses();
  let calls = 0;
  let proxied: Readonly<Record<string, unknown>> | null = null;
  const modelClaims = {
    ...claims,
    actions: ["model.openrouter_review"] as const,
    modelProvider: "openrouter" as const,
    model: "deepseek/deepseek-v4-pro",
    reasoning: "high",
  };
  const router = new CapabilityRouter({
    store,
    github: new GitHub() as unknown as GitHubCapabilityAdapter,
    linear: new Linear() as unknown as LinearCapabilityAdapter,
    openrouter: {
      review: async () => { throw new Error("legacy adapter must not run"); },
      proxyResponses: async (input) => {
        calls += 1;
        proxied = input;
        return {
          status: 200,
          contentType: "text/event-stream",
          body: "event: response.completed\ndata: {\"response\":{\"id\":\"resp-1\"}}\n\n",
          providerRequestId: "resp-1",
        };
      },
    },
    openrouterResponses: responses,
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(modelClaims, SECRET);
  const request = (input = "Inspect the repository.") => router.handle(new Request(
    "https://worker.example/capabilities/openrouter/v1/responses",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": claims.attemptId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelClaims.model,
        input,
        stream: true,
        tools: [
          { type: "function", name: "exec", parameters: { type: "object" } },
          { type: "web_search" },
        ],
      }),
    },
  ));
  const first = await request();
  const second = await request();
  const otherDirection = await request("Review requirements back to proposal statements.");
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(otherDirection.status, 200);
  assert.equal(await first.text(), await second.text());
  assert.equal(calls, 2);
  const captured = proxied as unknown as Record<string, unknown>;
  assert.equal(captured.model, modelClaims.model);
  assert.equal(captured.store, false);
  assert.equal([...store.operations.values()][0].state, "succeeded");

  const receipts = await router.handle(new Request(
    "https://worker.example/capabilities/model-review/receipts",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Deos-Attempt": claims.attemptId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ version: 1, action: "list_openrouter_review_receipts" }),
    },
  ));
  const receiptBody = await receipts.json() as { receipts: Array<{ providerResourceId: string }> };
  assert.equal(receiptBody.receipts.length, 2);
  assert.equal(receiptBody.receipts[0].providerResourceId, "resp-1");
});

test("Codex Responses proxy rejects model substitution, disallowed hosted tools, and raw credentials", async () => {
  const store = new Store();
  const responses = new Responses();
  let calls = 0;
  const modelClaims = {
    ...claims,
    actions: ["model.openrouter_review"] as const,
    modelProvider: "openrouter" as const,
    model: "deepseek/deepseek-v4-pro",
    reasoning: "high",
  };
  const router = new CapabilityRouter({
    store,
    github: new GitHub() as unknown as GitHubCapabilityAdapter,
    linear: new Linear() as unknown as LinearCapabilityAdapter,
    openrouter: {
      review: async () => { throw new Error("unused"); },
      proxyResponses: async () => {
        calls += 1;
        return { status: 200, contentType: "application/json", body: "{}", providerRequestId: null };
      },
    },
    openrouterResponses: responses,
    signingSecret: SECRET,
    now: () => NOW,
  });
  const token = await mintCapabilityToken(modelClaims, SECRET);
  for (const body of [
    { model: "other/model", input: "Review." },
    { model: modelClaims.model, input: "Review.", tools: [{ type: "file_search" }] },
    { model: modelClaims.model, input: "Bearer abcdefghijklmnopqrstuvwxyz" },
  ]) {
    const response = await router.handle(new Request(
      "https://worker.example/capabilities/openrouter/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Deos-Attempt": claims.attemptId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    ));
    assert.equal(response.status, 403);
  }
  assert.equal(calls, 0);
});
