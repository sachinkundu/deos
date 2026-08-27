import assert from "node:assert/strict";
import test from "node:test";

import { mintCapabilityToken, verifyCapabilityToken } from "../src/capability-auth.ts";
import { CapabilityRouter } from "../src/capability-router.ts";
import type {
  CapabilityContext,
  CapabilityStore,
} from "../src/capability-store.ts";
import type { GitHubCapabilityAdapter } from "../src/github-capability.ts";
import type { LinearCapabilityAdapter } from "../src/linear-capability.ts";
import type {
  ProviderOperationRecord,
  ProviderOperationState,
} from "../src/linear-transition.ts";

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
  actions: ["github.publish_work_product", "linear.upsert_working_note"] as const,
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

  finish(input: {
    operationId: string;
    expected: ProviderOperationState;
    state: ProviderOperationState;
    providerResourceId: string | null;
    safeErrorCategory: string | null;
    now: string;
  }) {
    const operation = this.operations.get(input.operationId);
    if (operation?.state !== input.expected) return Promise.resolve(false);
    operation.state = input.state;
    operation.provider_resource_id = input.providerResourceId;
    operation.safe_error_category = input.safeErrorCategory;
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
  const linear = new Linear();
  const router = new CapabilityRouter({
    store,
    github: github as unknown as GitHubCapabilityAdapter,
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
  return { store, github, linear, router, token, invoke };
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

test("allowed GitHub work product is executed once and duplicate returns the durable receipt", async () => {
  const { invoke, github, store } = await setup();
  const first = await invoke("github", requestBody);
  const second = await invoke("github", requestBody);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(github.calls, 1);
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
    model: "anthropic/claude-sonnet-4.5",
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
