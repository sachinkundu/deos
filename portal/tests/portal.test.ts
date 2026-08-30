import assert from "node:assert/strict";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { verifyAccess } from "../src/auth.ts";
import { isRecoveredTerminalVisit, PORTAL_SELECTS } from "../src/model.ts";
import { presentationStagesForDefinition, validatePresentationManifest } from "../src/manifests.ts";
import { routePortalRequest } from "../src/worker.ts";
import { normalizeRepository, RepositorySettingsError, RepositorySettingsStore } from "../src/settings.ts";
import {
  TraceReviewArtifactError,
  TraceReviewNotFoundError,
  TraceReviewReadStore,
} from "../src/review.ts";
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
  assert.match(PORTAL_SELECTS.workflowIssues, /FROM linear_issue_index issue/);
  assert.doesNotMatch(PORTAL_SELECTS.workflowIssues, /definition_id\s*=/i);
});

test("only an operator-recovered terminal visit is excluded from the final workflow path", () => {
  assert.equal(isRecoveredTerminalVisit("stopped", "operator_retry"), true);
  assert.equal(isRecoveredTerminalVisit("stopped", "operator_reconciliation"), true);
  assert.equal(isRecoveredTerminalVisit("stopped", "workflow"), false);
  assert.equal(isRecoveredTerminalVisit("planning", "operator_retry"), false);
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
    PROJECT_ID: "project-id",
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
    PROJECT_ID: "project-id",
  };
  const authenticate = async () => ({ email: "sachinkundu@gmail.com" });
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/"), env, authenticate)).text(), "/index.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/settings"), env, authenticate)).text(), "/settings.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/settings/"), env, authenticate)).text(), "/settings.html");
  assert.equal(await (await routePortalRequest(new Request("https://deos.example/assets/app.js"), env, authenticate)).text(), "/assets/app.js");
  const unknown = await routePortalRequest(new Request("https://deos.example/future-tool"), env, authenticate);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await unknown.json(), { error: "route_not_found" });
  assert.deepEqual(paths, ["/index.html", "/settings.html", "/settings.html", "/assets/app.js"]);
});

test("workflow control writes require only dispatch and revision", async () => {
  const env = {
    DB: {} as D1Database,
    ARTIFACTS: {} as R2Bucket,
    ASSETS: { fetch: async () => new Response("portal") } as unknown as Fetcher,
    ACCESS_TEAM_DOMAIN: "deos-test.cloudflareaccess.com",
    ACCESS_AUD: "aud",
    ALLOWED_EMAIL: "sachinkundu@gmail.com",
    PROJECT_ID: "project-id",
  };
  const response = await routePortalRequest(new Request("https://deos.example/api/settings/workflow", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dispatchEnabled: true, selectorEnabled: true, expectedRevision: 1 }),
  }), env, async () => ({ email: "sachinkundu@gmail.com" }));
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_request" });
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
        bind(id: string, projectId: string) {
          assert.equal(id, attemptId);
          assert.equal(projectId, "project-id");
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
  const transcript = await new TranscriptReadStore(db, bucket, "project-id").read(attemptId);
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
    () => new TranscriptReadStore(db, bucket, "project-id").read("01a03852-9204-7612-bbb6-b76579f1462a"),
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
      return { bind: (reviewId: string, projectId: string, logicalName: string) => {
        assert.equal(reviewId, "review:01a03852-9204-7612-bbb6-b76579f1462a");
        assert.equal(projectId, "project-id");
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
  const artifact = await new TraceReviewReadStore(db, bucket, "project-id").artifact(
    "review:01a03852-9204-7612-bbb6-b76579f1462a",
    "candidate-inventory.json",
  );
  assert.equal(requestedKey, "private/review/candidate-inventory.json");
  assert.equal(artifact.sha256, digest);
  await assert.rejects(
    () => new TraceReviewReadStore(db, bucket, "project-id").artifact(
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
    () => new TraceReviewReadStore(db, bucket, "project-id").artifact(
      "review:01a03852-9204-7612-bbb6-b76579f1462a",
      "raw-review-output.json",
    ),
    TraceReviewArtifactError,
  );
});
