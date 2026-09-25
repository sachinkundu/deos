import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";

import { publishContinuation } from "../portal/bettaview/worker/review-continuation.js";
import {
  continueReviewToLinear,
  D1ReviewContinuationStore,
  ReviewContinuationRpc,
} from "../src/review-continuation.ts";
import { SqliteD1Database } from "./sqlite-d1-adapter.mjs";

const configPath = process.argv[2];
if (!configPath) throw new Error("usage: node scripts/demo-bettaview-review-continuation.mjs CONFIG_FILE");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const order = [];

const invoke = (name, request) => {
  const requestPath = join(config.requestDir, `${name}.json`);
  writeFileSync(requestPath, `${JSON.stringify(request)}\n`, { encoding: "utf8", mode: 0o600 });
  const result = spawnSync("deos-implementation", [requestPath], { encoding: "utf8" });
  if (result.error) throw new Error(`provider helper failed for ${name}`, { cause: result.error });
  if (result.status !== 0) {
    throw new Error(`provider helper failed for ${name}: ${result.stderr || result.stdout}`, {
      cause: new Error(result.stderr || result.stdout || `exit ${result.status}`),
    });
  }
  try {
    return JSON.parse(result.stdout.trim());
  } catch (cause) {
    throw new Error(`provider helper returned invalid JSON for ${name}: ${result.stdout}`, { cause });
  }
};

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { "content-type": "application/json" },
});

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys=ON");
for (const migration of readdirSync("migrations").filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
  database.exec(readFileSync(join("migrations", migration), "utf8"));
}
const now = new Date().toISOString();
const definitionDigest = "d".repeat(64);
database.prepare(`INSERT INTO workflow_definitions
  (definition_id,version,project_id,name,canonical_json,digest,enabled_at,created_at)
  VALUES(?,?,?,?,?,?,?,?)`).run("safe-proof-definition", 1, config.projectId, "Safe proof", "{}", definitionDigest, now, now);
database.prepare(`INSERT INTO project_workflow_policies
  (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,
   human_gate_state_id,dispatch_enabled,updated_at,linear_project_name,github_installation_id,
   route_revision,route_digest,bettaview_continuation_enabled,in_progress_state_id,merging_state_id,
   linear_app_actor_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  config.projectId, "safe-proof-definition", 1, definitionDigest, config.repository, "Todo",
  config.reviewStateId, 1, now, "Safe proof", "safe-installation", 1, "safe-route",
  1, config.workStateId, config.mergeStateId, config.linearAppActorId,
);
database.prepare(`INSERT INTO orchestration_runs
  (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,definition_version,
   definition_digest,workflow_instance_id,current_node,status,accumulated_data_json,created_at,updated_at,
   route_repository,route_github_installation_id,route_human_gate_state_id,
   frozen_access_account,frozen_github_user_id,frozen_linear_user_id,bettaview_account_policy_version)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
  config.runId, "safe-proof-correlation", 1, config.projectId, config.issueId, "safe-proof-definition", 1,
  definitionDigest, "safe-proof-workflow", "human-review", "awaiting_human", "{}", now, now,
  config.repository, "safe-installation", config.reviewStateId,
  config.accessAccount, config.githubUserId, config.linearUserId, 1,
);
database.prepare(`INSERT INTO human_gate_visits
  (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,
   pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at)
  VALUES(?,1,'human-review','plan','proposal_and_specs','planning',1,'open',?,?,?,?,?,'main',?,?)`).run(
  config.runId, config.repository, `safe-pr-${config.pullNumber}`, config.pullNumber,
  config.pullUrl, config.branch, config.head, now,
);

const store = new D1ReviewContinuationStore(new SqliteD1Database(database));
let githubReceipt = null;
let linearReceipt = null;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url);
  const method = options.method || "GET";
  if (parsed.hostname !== "api.github.com") throw new Error(`unexpected provider host ${parsed.hostname}`);
  if (method === "GET" && parsed.pathname === "/user") {
    return json({ id: config.githubUserId, login: "scoped-reviewer" });
  }
  if (method === "GET" && parsed.pathname === `/repos/${config.repository}/pulls/${config.pullNumber}`) {
    return json({
      number: config.pullNumber,
      state: "open",
      merged: false,
      head: { sha: config.head },
      base: { sha: "b".repeat(40) },
      user: { login: "fixture-author" },
    });
  }
  if (method === "GET" && parsed.pathname === `/repos/${config.repository}/pulls/${config.pullNumber}/files`) return json([]);
  if (method === "GET" && parsed.pathname === `/repos/${config.repository}/pulls/${config.pullNumber}/comments`) return json([]);
  if (method === "POST" && parsed.pathname === `/repos/${config.repository}/pulls/${config.pullNumber}/reviews`) {
    const payload = JSON.parse(options.body);
    assert.equal(payload.commit_id, config.head);
    assert.equal(payload.event, "COMMENT");
    assert.match(payload.body, /BettaView scoped provider proof/);
    assert.match(payload.body, /bettaview:v1/);
    githubReceipt = invoke("provider-github-review", {
      action: "safe_test",
      operation: "github.review",
      resourceId: config.resourceId,
      operationId: config.githubOperationId,
      body: payload,
    });
    order.push("github:review");
    const reviewId = githubReceipt.reviewId ?? githubReceipt.id ?? 1;
    return json({
      id: reviewId,
      html_url: `${config.pullUrl}#pullrequestreview-${reviewId}`,
      commit_id: config.head,
      state: "COMMENTED",
      body: payload.body,
      user: { id: config.githubUserId },
    }, 201);
  }
  throw new Error(`unexpected GitHub transport request ${method} ${parsed.pathname}`);
};

const secret = "review-continuation-proof-secret-v1";
const rpc = new ReviewContinuationRpc(
  store,
  secret,
  async () => config.head,
  async (_target, reviewId) => {
    order.push("deos:review-ready");
    await continueReviewToLinear(
      store,
      {
        runId: config.runId,
        currentVisitSequence: 1,
        definitionDigest,
        status: "awaiting_human",
      },
      async () => config.head,
      async (issueId, stateId) => {
        assert.equal(issueId, config.issueId);
        assert.equal(stateId, config.workStateId);
        linearReceipt = invoke("provider-linear-move", {
          action: "safe_test",
          operation: "linear.move",
          resourceId: config.resourceId,
          operationId: config.linearOperationId,
          issueId,
          stateId,
        });
        order.push("linear:move");
        return { outcome: "succeeded", issueId, stateId };
      },
      reviewId,
    );
  },
);
const serviceBinding = {
  async prepareReview(...args) {
    const value = await rpc.prepareReview(...args);
    order.push("deos:prepare");
    return value;
  },
  async requestPermit(...args) {
    const value = await rpc.requestPermit(...args);
    order.push("deos:permit");
    return value;
  },
  async completeGitHubPart(...args) {
    const value = await rpc.completeGitHubPart(...args);
    order.push("deos:github-receipt");
    return value;
  },
  markGitHubReady: (...args) => rpc.markGitHubReady(...args),
  status: (...args) => rpc.status(...args),
};

try {
  const result = await publishContinuation("scoped-test-token", config.accessAccount, {
    REVIEW_CONTINUATION_SECRET: secret,
    DEOS_REVIEW_CONTINUATION: serviceBinding,
  }, {
    reviewId: config.reviewId,
    prUrl: config.pullUrl,
    headSha: config.head,
    event: "COMMENT",
    reviewBody: "BettaView scoped provider proof: publish review before continuing Linear.",
    comments: [],
    continuation: {
      runId: config.runId,
      issueId: config.issueId,
      repository: config.repository,
      pullRequestNumber: config.pullNumber,
      gateVisitSequence: 1,
      accountPolicyVersion: 1,
    },
  });
  assert.deepEqual(order, [
    "deos:prepare", "deos:permit", "github:review", "deos:github-receipt",
    "deos:review-ready", "linear:move",
  ]);
  assert.equal(result.continuation.github.complete, true);
  assert.equal(result.continuation.linear.status, "awaiting_delivery");
  const durable = database.prepare(`SELECT review_id,github_status,linear_status,outcome,linear_operation_id
    FROM review_intents WHERE review_id=?`).get(config.reviewId);
  const attempts = database.prepare(`SELECT step,scope_id,generation,outcome
    FROM review_attempts WHERE review_id=? ORDER BY step,scope_id,generation`).all(config.reviewId);
  assert.equal(durable.github_status, "done");
  assert.equal(durable.linear_status, "awaiting_delivery");
  assert.deepEqual(attempts.map((row) => ({ ...row })), [
    { step: "github", scope_id: "review_bundle", generation: 1, outcome: "succeeded" },
  ]);
  process.stdout.write(`${JSON.stringify({
    claim: "BettaView used the production continuation RPC and workflow transition to save the scoped GitHub review before requesting the scoped Linear move",
    order,
    pullUrl: config.pullUrl,
    issueUrl: config.issueUrl,
    githubOperationId: config.githubOperationId,
    linearOperationId: config.linearOperationId,
    githubReceipt,
    linearReceipt,
    durable,
    attempts,
  })}\n`);
} finally {
  globalThis.fetch = originalFetch;
  database.close();
}
