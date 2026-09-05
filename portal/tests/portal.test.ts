import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { verifyAccess } from "../src/auth.ts";
import {
  isRecoveredTerminalVisit,
  portalRunRetry,
  safeGateVisit,
  PortalIssueSearchHistoryStore,
  PORTAL_MUTATIONS,
  PORTAL_SELECTS,
} from "../src/model.ts";
import { presentationStagesForDefinition, validatePresentationManifest } from "../src/manifests.ts";
import { routePortalRequest } from "../src/worker.ts";
import { normalizeRepository, RepositorySettingsError, RepositorySettingsStore } from "../src/settings.ts";
import {
  TraceReviewArtifactError,
  TraceReviewNotFoundError,
  TraceReviewReadStore,
} from "../src/review.ts";
import {
  DesignReviewArtifactError,
  designReviewFreshness,
  designReviewSelfStatus,
  supportsDesignReview,
  DesignReviewNotFoundError,
  DesignReviewReadStore,
} from "../src/design-review.ts";
import {
  parseTranscriptJsonl,
  TranscriptReadStore,
  TranscriptUnavailableError,
  transcriptDto,
} from "../src/transcript.ts";
import { activityForRecord } from "../src/transcript-view.ts";
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

test("the Workflow Map issue inventory is not restricted to one workflow definition", () => {
  assert.match(PORTAL_SELECTS.workflowIssues, /FROM portal_issue_search_history history/);
  assert.match(PORTAL_SELECTS.workflowIssues, /history\.viewer_email = \?/);
  assert.doesNotMatch(PORTAL_SELECTS.workflowIssues, /definition_id\s*=/i);
});

test("portal reads are authorized by every configured project route", () => {
  for (const name of ["workflowIssues", "simpleIssues", "issueSearch", "issueByKey", "run", "issueForRun", "transcript"] as const) {
    assert.match(PORTAL_SELECTS[name], /JOIN project_workflow_policies route ON route\.project_id = (?:issue|run)\.project_id/);
    assert.doesNotMatch(PORTAL_SELECTS[name], /(?:issue|run)\.project_id = \?/);
  }
});

test("search history is a separate bounded mutation", () => {
  assert.match(PORTAL_MUTATIONS.recordIssueSearch, /^INSERT INTO portal_issue_search_history/);
  assert.match(PORTAL_MUTATIONS.recordIssueSearch, /VALUES \(\?, \?, \?, \?\)/);
  assert.match(PORTAL_MUTATIONS.recordIssueSearch, /ON CONFLICT/);
  assert.match(PORTAL_MUTATIONS.recordIssueSearch, /DO UPDATE SET searched_at/);
});

test("search history resolves the exact recorded issue before saving the viewer entry", async () => {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ query, values });
          if (query === PORTAL_SELECTS.issueByKey) return { first: async () => ({
            issue_id: "issue-142",
            project_id: "second-project-id",
            issue_key: "SAC-142",
            title: "Specify a calculator CLI",
            linear_url: "https://linear.example/SAC-142",
            observed_at: "2026-08-30T12:00:00Z",
          }) };
          return { run: async () => ({ success: true }) };
        },
      };
    },
  } as unknown as D1Database;
  const recorded = await new PortalIssueSearchHistoryStore(db)
    .record("Person@Example.com", "sac-142", "2026-08-30T13:00:00Z");
  assert.equal(recorded, true);
  assert.deepEqual(calls.map((call) => call.values), [
    ["SAC-142"],
    ["second-project-id", "person@example.com", "issue-142", "2026-08-30T13:00:00Z"],
  ]);
});

test("only an operator-recovered terminal visit is excluded from the final workflow path", () => {
  assert.equal(isRecoveredTerminalVisit("stopped", "operator_retry"), true);
  assert.equal(isRecoveredTerminalVisit("stopped", "operator_reconciliation"), true);
  assert.equal(isRecoveredTerminalVisit("stopped", "workflow"), false);
  assert.equal(isRecoveredTerminalVisit("planning", "operator_retry"), false);
});

test("portal retry is shown only for the exact cleaned failed agent visit", () => {
  const run = {
    status: "failed",
    current_node: "agent_failed",
    current_visit_sequence: 4,
    terminal_cause: "agent_execution_failed",
  };
  const attempt = {
    attempt_id: "attempt-1",
    visit_sequence: 3,
    node_id: "self_discovery",
    state: "failed",
    cleanup_state: "destroyed",
  };
  const transition = {
    from_node: "self_discovery",
    to_node: "agent_failed",
    from_visit_sequence: 3,
    to_visit_sequence: 4,
    cause_reference: "agent:self_discovery:failed",
  };
  assert.deepEqual(portalRunRetry(run, [attempt], [transition], null), {
    failedAttemptId: "attempt-1",
    retryNode: "self_discovery",
  });
  assert.deepEqual(portalRunRetry(run, [{ ...attempt, state: "absolute_timeout" }], [transition], null), {
    failedAttemptId: "attempt-1",
    retryNode: "self_discovery",
  });
  assert.equal(portalRunRetry(run, [{ ...attempt, cleanup_state: "pending" }], [transition], null), null);
  assert.equal(portalRunRetry({ ...run, terminal_cause: "policy_failed" }, [attempt], [transition], null), null);
  assert.equal(portalRunRetry(run, [attempt], [{ ...transition, cause_reference: "other" }], null), null);
});

test("a pending provider continuation remains safely retryable", () => {
  const run = {
    status: "active",
    current_node: "self_discovery",
    current_visit_sequence: 5,
    terminal_cause: null,
  };
  const retry = {
    failed_attempt_id: "attempt-1",
    retry_node: "self_discovery",
    state: "pending",
    to_visit_sequence: 5,
  };
  assert.deepEqual(portalRunRetry(run, [], [], retry), {
    failedAttemptId: "attempt-1",
    retryNode: "self_discovery",
  });
  assert.equal(portalRunRetry({ ...run, current_visit_sequence: 6 }, [], [], retry), null);
});

test("gate links fail closed unless the saved repository and pull request match exactly", () => {
  const gate = {
    visit_sequence: 20,
    node_id: "design_review",
    gate_kind: "design" as const,
    work_type: "design" as const,
    round: 1,
    state: "open",
    repository: "sachinkundu/deos-sample-project",
    pull_request_number: 14,
    pull_request_url: "https://github.com/sachinkundu/deos-sample-project/pull/14",
    approved_head_sha: "a".repeat(40),
    decision_outcome: null,
  };
  assert.deepEqual(safeGateVisit(gate), gate);
  assert.equal(safeGateVisit({ ...gate, pull_request_url: "https://example.test/pull/14" }), null);
  assert.equal(safeGateVisit(undefined), null);
});

test("repository settings accept only exact owner and repository names", () => {
  assert.equal(normalizeRepository(" sachinkundu/deos-sample-project "), "sachinkundu/deos-sample-project");
  for (const value of ["deos", "https://github.com/sachinkundu/deos", "owner/repo/extra", "owner/re po"]) {
    assert.throws(() => normalizeRepository(value), (error) =>
      error instanceof RepositorySettingsError && error.code === "invalid_repository");
  }
});

test("repository settings no longer read workflow selectors", async () => {
  let query = "";
  const db = {
    prepare(value: string) {
      query = value;
      return { bind: () => ({ first: async () => ({
        project_id: "project-id",
        trial_repository: "sachinkundu/deos",
        repository_revision: 3,
        repository_updated_by: "sachinkundu@gmail.com",
        repository_updated_at: "2026-08-27T08:00:00Z",
        dispatch_enabled: 0,
        workflow_revision: 5,
        workflow_updated_by: "sachinkundu@gmail.com",
        workflow_updated_at: "2026-08-27T08:00:00Z",
        active_runs: 0,
      }) }) };
    },
  } as unknown as D1Database;
  const settings = await new RepositorySettingsStore(db).read("project-id");
  assert.equal(settings?.dispatchEnabled, false);
  assert.deepEqual(Object.keys(settings ?? {}).includes("selectorEnabled"), false);
  assert.doesNotMatch(query, /workflow_definition_selectors|simple-workflow/i);
});

test("a digest-verified workflow does not require a deployment-specific presentation allowlist", async () => {
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
    digest: "a-new-digest-that-was-not-known-when-the-portal-was-deployed",
    name: "openspec-delivery",
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

test("the SAC-142 workflow version and future nodes receive a complete dynamic presentation", () => {
  const definition = {
    digest: "e1f91bf77c8dbfbf82d685f0989dd4c42369541e8ea73c0a46be8280eabe42c4",
    name: "simple-traceability",
    start: "claim_issue",
    nodes: {
      claim_issue: { id: "claim_issue", edges: { completed: "planning_author" } },
      planning_author: { id: "planning_author", edges: { completed: "planning_review" } },
      planning_review: {
        id: "planning_review",
        edges: { revision_requested: "start_new_review_round", merge_authorized: "done" },
      },
      start_new_review_round: { id: "start_new_review_round", edges: { completed: "planning_author" } },
      future_provider_gate: { id: "future_provider_gate", edges: { completed: "done" } },
      done: { id: "done", edges: {} },
    },
  } as unknown as LoadedWorkflowDefinition;
  const manifest = validatePresentationManifest(definition);
  assert.equal(manifest.size, Object.keys(definition.nodes).length);
  assert.equal(manifest.get("start_new_review_round"), "planning");
  assert.equal(manifest.get("future_provider_gate"), "future_provider_gate");
  assert.equal(manifest.get("done"), "complete");
  assert.deepEqual(presentationStagesForDefinition(definition).map((stage) => stage.id), [
    "claim", "planning", "review", "complete", "future_provider_gate",
  ]);
});

test("version 17 presents two gates with distinct checked merge and design stages", () => {
  const nodeIds = [
    "claim_issue", "planning_author", "independent_discovery", "planning_review",
    "merge_planning_pr", "verify_planning_merge", "design_author", "publish_design",
    "design_review", "start_new_design_round", "design_revision_author",
    "merge_design_pr", "done",
  ];
  const definition = {
    digest: "design-stage-digest",
    name: "simple-traceability",
    version: 17,
    start: "claim_issue",
    nodes: Object.fromEntries(nodeIds.map((id, index) => [id, {
      id,
      edges: index + 1 < nodeIds.length ? { completed: nodeIds[index + 1] } : {},
    }])),
  } as unknown as LoadedWorkflowDefinition;
  const manifest = validatePresentationManifest(definition);
  assert.equal(manifest.get("planning_review"), "review");
  assert.equal(manifest.get("design_review"), "review");
  assert.equal(manifest.get("merge_planning_pr"), "plan_merge");
  assert.equal(manifest.get("design_author"), "design");
  assert.equal(manifest.get("merge_design_pr"), "design_merge");
  assert.deepEqual(presentationStagesForDefinition(definition).map((stage) => stage.label), [
    "Claim issue", "Create planning PR", "Independent review", "Human approval",
    "Merge plan & check", "Create design PR", "Merge design & check", "Completed",
  ]);
});

test("an unknown workflow renders each stored node without semantic guessing", () => {
  const definition = {
    digest: "another-new-digest",
    name: "custom-delivery",
    start: "collect_context",
    nodes: {
      collect_context: { id: "collect_context", edges: { completed: "human_decision" } },
      human_decision: { id: "human_decision", edges: {} },
    },
  } as unknown as LoadedWorkflowDefinition;
  const manifest = validatePresentationManifest(definition);
  assert.deepEqual([...manifest], [
    ["collect_context", "collect_context"],
    ["human_decision", "human_decision"],
  ]);
  assert.deepEqual(presentationStagesForDefinition(definition), [
    { id: "collect_context", label: "Collect context" },
    { id: "human_decision", label: "Human decision" },
  ]);
});

test("dynamic presentation still rejects a missing edge target", () => {
  const definition = {
    digest: "new-digest",
    name: "custom-delivery",
    start: "known_node",
    nodes: {
      known_node: { id: "known_node", edges: { completed: "missing_node" } },
    },
  } as unknown as LoadedWorkflowDefinition;
  assert.throws(() => validatePresentationManifest(definition), /workflow presentation edge is incomplete/);
});

test("authentication runs before assets, route methods, or D1", async () => {
  let assetReads = 0;
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
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

test("browser routes map to explicit portal entries without SPA fallback", async () => {
  const paths: string[] = [];
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      paths.push(path);
      return new Response(path);
    } } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
  };
  const authenticate = async () => ({ email: "sachinkundu@gmail.com" });
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/"), env, authenticate)).text(), "/index.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/settings"), env, authenticate)).text(), "/settings.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/settings/"), env, authenticate)).text(), "/settings.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/runs/workflow%3Aa%3Ab%3Arun%3A1/design-review"), env, authenticate)).text(), "/settings.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/assets/app.js"), env, authenticate)).text(), "/assets/app.js");
  const unknown = await routePortalRequest(new Request("https://deos.example/future-tool"), env, authenticate);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "route_not_found" });
  assert.deepEqual(paths, ["/index.html", "/settings.html", "/settings.html", "/settings.html", "/assets/app.js"]);
});

test("an authenticated issue search records the viewer before the read-only API guard", async () => {
  const queries: string[] = [];
  const db = {
    prepare(query: string) {
      queries.push(query);
      return {
        bind() {
          if (query === PORTAL_SELECTS.issueByKey) return { first: async () => ({
            issue_id: "issue-142",
            project_id: "project-id",
            issue_key: "SAC-142",
            title: "Specify a calculator CLI",
            linear_url: "https://linear.example/SAC-142",
            observed_at: "2026-08-30T12:00:00Z",
          }) };
          return { run: async () => ({ success: true }) };
        },
      };
    },
  } as unknown as D1Database;
  const env = {
    DB: db,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response("portal") } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
  };
  const response = await routePortalRequest(new Request("https://deos.example/api/issues/SAC-142/search", {
    method: "POST",
  }), env, async () => ({ email: "sachinkundu@gmail.com" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recorded: true });
  assert.deepEqual(queries, [PORTAL_SELECTS.issueByKey, PORTAL_MUTATIONS.recordIssueSearch]);
});

test("route workflow writes require only dispatch and revision", async () => {
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response("portal") } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
  };
  const response = await routePortalRequest(new Request("https://deos.example/api/settings/routes/project-id/workflow", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dispatchEnabled: true, selectorEnabled: true, expectedRevision: 1 }),
  }), env, async () => ({ email: "sachinkundu@gmail.com" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
});

test("an authenticated run retry passes only the failed attempt identity to the private retry service", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: unknown }> = [];
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response("portal") } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
    STAGE_RETRY_SECRET: "test-retry-secret",
    RETRY_ADMIN: {
      fetch: async (request: Request) => {
        calls.push({
          url: request.url,
          authorization: request.headers.get("Authorization"),
          body: await request.json(),
        });
        return Response.json({ retry: {
          retry_id: "stage-retry:attempt-1",
          run_id: "workflow:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:run:1",
          retry_node: "self_discovery",
          state: "established",
        } }, { status: 202 });
      },
    } as unknown as Fetcher,
  };
  const runId = "workflow:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb:run:1";
  const response = await routePortalRequest(new Request(
    `https://deos.example/api/runs/${encodeURIComponent(runId)}/retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ failedAttemptId: "attempt-1", retryNode: "self_discovery" }),
    },
  ), env, async () => ({ email: "sachinkundu@gmail.com" }));

  assert.equal(response.status, 202);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://retry-admin.internal/stage-retries");
  assert.equal(calls[0].authorization, "Bearer test-retry-secret");
  assert.deepEqual(calls[0].body, {
    version: 1,
    runId,
    failedAttemptId: "attempt-1",
    retryNode: "self_discovery",
    requestedBy: "sachinkundu@gmail.com",
  });
  assert.deepEqual(await response.json(), {
    retryId: "stage-retry:attempt-1",
    runId,
    retryNode: "self_discovery",
    state: "established",
  });
});

test("route writes reject non-object and oversized JSON before the admin binding", async () => {
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response("portal") } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
  };
  const authenticate = async () => ({ email: "sachinkundu@gmail.com" });
  const invalid = await routePortalRequest(new Request("https://deos.example/api/settings/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "[]",
  }), env, authenticate);
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), { error: "invalid_request" });

  const malformed = await routePortalRequest(new Request("https://deos.example/api/settings/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  }), env, authenticate);
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: "invalid_request" });

  const tooLarge = await routePortalRequest(new Request("https://deos.example/api/settings/routes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: "x".repeat(4_200) }),
  }), env, authenticate);
  assert.equal(tooLarge.status, 413);
  assert.deepEqual(await tooLarge.json(), { error: "request_too_large" });
});

test("transcript JSONL keeps exact numbered records for readable and raw views", () => {
  const text = [
    JSON.stringify({ type: "assistant_message", timestamp: "2026-08-26T08:00:00Z", text: "Planning started." }),
    JSON.stringify({ type: "tool_call", tool_name: "read_file", summary: "Read the issue." }),
  ].join("\n");
  const records = parseTranscriptJsonl(text);
  assert.deepEqual(records.map((record) => record.number), [1, 2]);
  assert.equal(records[0]?.raw, text.split("\n")[0]);
  assert.equal(activityForRecord(records[0]!).title, "Agent update");
  assert.equal(activityForRecord(records[1]!).title, "Tool call · read_file");
});

test("transcript JSONL preserves every record beyond the former local ceiling", () => {
  const text = Array.from({ length: 10_001 }, (_, index) =>
    JSON.stringify({ type: "status", index, message: `Update ${index}` })).join("\n");
  const records = parseTranscriptJsonl(text);
  assert.equal(records.length, 10_001);
  assert.equal(records.at(-1)?.value.index, 10_000);
});

test("attempt transcript reads only the D1-selected accepted object and verifies integrity", async () => {
  const attemptId = "01a03852-9204-7612-bbb6-b76579f1462a";
  const objectKey = "runs/private/attempts/transcript.jsonl";
  const body = new TextEncoder().encode(`${JSON.stringify({ type: "status", message: "Done" })}\n`);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let requestedKey = "";
  const db = {
    prepare(query: string) {
      assert.equal(query, PORTAL_SELECTS.transcript);
      return {
        bind(id: string) {
          assert.equal(id, attemptId);
          return { first: async () => ({
            attempt_id: attemptId,
            run_id: "workflow:project:issue:run:3",
            node_id: "planning_agent",
            run_sequence: 3,
            issue_key: "SAC-130",
            r2_key: objectKey,
            media_type: "application/json",
            byte_size: body.byteLength,
            sha256: digest,
          }) };
        },
      };
    },
  } as unknown as D1Database;
  const bucket = {
    async get(key: string) {
      requestedKey = key;
      return { size: body.byteLength, arrayBuffer: async () => body.buffer };
    },
  } as unknown as R2Bucket;
  const transcript = await new TranscriptReadStore(db, bucket).read(attemptId);
  assert.equal(requestedKey, objectKey);
  assert.equal(transcript.records.length, 1);
  assert.deepEqual(Object.keys(transcriptDto(transcript)).sort(), [
    "attemptId", "byteSize", "eventCount", "issueKey", "nodeId", "records", "runId", "runSequence", "sha256",
  ]);
  assert.equal(JSON.stringify(transcriptDto(transcript)).includes(objectKey), false);
});

test("attempt transcript fails closed when the R2 body differs from D1", async () => {
  const body = new TextEncoder().encode("{}\n");
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => ({
        attempt_id: "01a03852-9204-7612-bbb6-b76579f1462a",
        run_id: "workflow:project:issue:run:3",
        node_id: "planning_agent",
        run_sequence: 3,
        issue_key: "SAC-130",
        r2_key: "private/transcript.jsonl",
        media_type: "application/json",
        byte_size: body.byteLength,
        sha256: "0".repeat(64),
      }) }) };
    },
  } as unknown as D1Database;
  const bucket = { get: async () => ({ size: body.byteLength, arrayBuffer: async () => body.buffer }) } as unknown as R2Bucket;
  await assert.rejects(
    () => new TranscriptReadStore(db, bucket).read("01a03852-9204-7612-bbb6-b76579f1462a"),
    TranscriptUnavailableError,
  );
});

test("review artifacts use the allowlist, D1-selected key, and exact hash", async () => {
  const body = new TextEncoder().encode('{"version":1}\n');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let requestedKey = "";
  const db = {
    prepare() {
      return { bind: (reviewId: string, logicalName: string) => {
        assert.equal(reviewId, "review:01a03852-9204-7612-bbb6-b76579f1462a");
        assert.equal(logicalName, "candidate-inventory.json");
        return { first: async () => ({
          r2_key: "private/review/candidate-inventory.json",
          media_type: "application/json",
          sha256: digest,
        }) };
      } };
    },
  } as unknown as D1Database;
  const bucket = { get: async (key: string) => {
    requestedKey = key;
    return { arrayBuffer: async () => body.buffer };
  } } as unknown as R2Bucket;
  const artifact = await new TraceReviewReadStore(db, bucket).artifact(
    "review:01a03852-9204-7612-bbb6-b76579f1462a",
    "candidate-inventory.json",
  );
  assert.equal(requestedKey, "private/review/candidate-inventory.json");
  assert.equal(artifact.sha256, digest);
  await assert.rejects(
    () => new TraceReviewReadStore(db, bucket).artifact(
      "review:01a03852-9204-7612-bbb6-b76579f1462a",
      "provider-references.json",
    ),
    TraceReviewNotFoundError,
  );
});

test("review artifact hash mismatch fails closed", async () => {
  const body = new TextEncoder().encode("changed");
  const db = {
    prepare() {
      return { bind: () => ({ first: async () => ({
        r2_key: "private/review/raw-review-output.json",
        media_type: "application/json",
        sha256: "0".repeat(64),
      }) }) };
    },
  } as unknown as D1Database;
  const bucket = {
    get: async () => ({ arrayBuffer: async () => body.buffer }),
  } as unknown as R2Bucket;
  await assert.rejects(
    () => new TraceReviewReadStore(db, bucket).artifact(
      "review:01a03852-9204-7612-bbb6-b76579f1462a",
      "raw-review-output.json",
    ),
    TraceReviewArtifactError,
  );
});

test("design review artifacts use an allowlist and verify the D1-selected R2 hash", async () => {
  const body = new TextEncoder().encode('{"version":1}\n');
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", body)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  let requestedKey = "";
  const db = {
    prepare() {
      return { bind: (reviewId: string, logicalName: string) => {
        assert.equal(reviewId, "design-review:01a03852-9204-7612-bbb6-b76579f1462a");
        assert.equal(logicalName, "normalized-review.json");
        return { first: async () => ({
          r2_key: "private/design-review/normalized-review.json",
          media_type: "application/json",
          sha256: digest,
        }) };
      } };
    },
  } as unknown as D1Database;
  const bucket = { get: async (key: string) => {
    requestedKey = key;
    return { arrayBuffer: async () => body.buffer };
  } } as unknown as R2Bucket;
  const store = new DesignReviewReadStore(db, bucket);
  const artifact = await store.artifact(
    "design-review:01a03852-9204-7612-bbb6-b76579f1462a",
    "normalized-review.json",
  );
  assert.equal(requestedKey, "private/design-review/normalized-review.json");
  assert.equal(artifact.sha256, digest);
  await assert.rejects(
    () => store.artifact(
      "design-review:01a03852-9204-7612-bbb6-b76579f1462a",
      "provider-references.jsonl",
    ),
    DesignReviewNotFoundError,
  );
});

test("design review artifact hash mismatch fails closed", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({
    r2_key: "private/design-review/raw-review-output.json",
    media_type: "application/json",
    sha256: "0".repeat(64),
  }) }) }) } as unknown as D1Database;
  const bucket = { get: async () => ({ arrayBuffer: async () => new TextEncoder().encode("changed").buffer }) } as unknown as R2Bucket;
  await assert.rejects(
    () => new DesignReviewReadStore(db, bucket).artifact(
      "design-review:01a03852-9204-7612-bbb6-b76579f1462a",
      "raw-review-output.json",
    ),
    DesignReviewArtifactError,
  );
});

test("design review presentation distinguishes current, stale, historical, and later-round self state", () => {
  assert.equal(supportsDesignReview(18), false);
  assert.equal(supportsDesignReview(19), true);
  assert.equal(designReviewSelfStatus(1), "required");
  assert.equal(designReviewSelfStatus(0), "not_required");
  assert.equal(designReviewFreshness({
    phase: "self", round: 1, reviewedHeadSha: null, currentHeadSha: "b".repeat(40),
    hasInitialIndependentReview: true,
  }), "historical");
  assert.equal(designReviewFreshness({
    phase: "independent", round: 1, reviewedHeadSha: "a".repeat(40), currentHeadSha: "b".repeat(40),
    hasInitialIndependentReview: true,
  }), "stale");
  assert.equal(designReviewFreshness({
    phase: "independent", round: 2, reviewedHeadSha: "b".repeat(40), currentHeadSha: "b".repeat(40),
    hasInitialIndependentReview: true,
  }), "current");
});

test("design review API projection keeps failed attempts and later-round readiness visible", async () => {
  const head = "b".repeat(40);
  const runId = "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:60f49205-c6d8-4972-a9e6-73cdf5432941:run:1";
  const db = {
    prepare(sql: string) {
      return { bind: () => ({
        first: async () => sql.includes("FROM orchestration_runs run") ? {
          run_id: runId, status: "awaiting_human", definition_version: 19,
          issue_key: "SAC-151", title: "Set a wallpaper", head_sha: head,
        } : null,
        all: async () => {
          if (sql.includes("FROM design_review_rounds WHERE")) return { results: [{
            round_id: "round-2", round_no: 2, kind: "human_revision", self_required: 0,
            status: "ready_for_human", response_turns: 1, outside_model: "outside/model",
          }] };
          if (sql.includes("FROM design_review_attempts attempt")) return { results: [{
            review_attempt_id: "design-review:01a03852-9204-7612-bbb6-b76579f1462a",
            round_id: "round-2", round_no: 2, phase: "independent",
            input_sha256: "a".repeat(64), candidate_id: "design:candidate", head_sha: head,
            model_provider: "openrouter", model: "outside/model", reasoning: "high",
            outcome: "failed", evidence_manifest_id: null, accepted: 0,
            created_at: "2026-09-02T12:00:00.000Z", completed_at: "2026-09-02T12:01:00.000Z",
          }] };
          if (sql.includes("FROM design_review_findings")) return { results: [] };
          if (sql.includes("FROM design_review_dispositions")) return { results: [] };
          if (sql.includes("FROM design_gate_bindings")) return { results: [{
            visit_sequence: 20, round_id: "round-2", head_sha: head,
          }] };
          throw new Error(`unexpected query: ${sql}`);
        },
      }) };
    },
  } as unknown as D1Database;
  const projection = await new DesignReviewReadStore(db, {} as R2Bucket).projection(runId) as {
    supported: boolean;
    rounds: Array<{ selfStatus: string; status: string }>;
    attempts: Array<{ outcome: string; accepted: boolean; freshness: string }>;
    gateBindings: unknown[];
  };
  assert.equal(projection.supported, true);
  assert.deepEqual(projection.rounds.map((round) => [round.selfStatus, round.status]), [
    ["not_required", "ready_for_human"],
  ]);
  assert.deepEqual(projection.attempts.map((attempt) => [attempt.outcome, attempt.accepted, attempt.freshness]), [
    ["failed", false, "current"],
  ]);
  assert.equal(projection.gateBindings.length, 1);
});
