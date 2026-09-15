import { recordCaughtError } from "./error-context.ts";

// Provider contracts verified against:
// https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
// https://docs.github.com/en/rest/pulls/comments
// https://docs.github.com/en/rest/pulls/reviews
// https://linear.app/developers/graphql
// https://linear.app/developers/oauth-actor-authorization
// https://linear.app/developers/webhooks

export type ReviewType = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
export type GitHubStep = "not_started" | "publishing" | "failed_retryable" | "done" | "host_check_required" | "abandoned";
export type LinearStep = "not_started" | "moving" | "failed_retryable" | "awaiting_delivery" | "reverting" | "reverted" | "done" | "host_check_required";
export type ReviewOutcome = "active" | "continued" | "abandoned_before_linear" | "abandoned_stale_after_linear" | "conflict" | "host_check_required";

export interface ReviewContentItem {
  contentItemId: string;
  kind: "reply" | "inline" | "review_body";
  body: string;
  target: Readonly<Record<string, string | number>>;
}

export interface PrepareReviewInput {
  reviewId: string;
  supersedesReviewId?: string | null;
  runId: string;
  issueId: string;
  repository: string;
  pullRequestNumber: number;
  headSha: string;
  gateVisitSequence: number;
  reviewType: ReviewType;
  accountPolicyVersion: number;
  items: readonly ReviewContentItem[];
}

export interface TrustedReviewIdentity {
  accessAccount: string;
  githubUserId: number;
}

export interface ServiceAssertion extends TrustedReviewIdentity {
  version: 1;
  keyVersion: number;
  method: string;
  bodyDigest: string;
  issuedAt: number;
  nonce: string;
  mac: string;
}

export interface ReviewIntentRecord {
  review_id: string;
  bound_digest: string;
  run_id: string;
  issue_id: string;
  repository: string;
  pull_request_number: number;
  head_sha: string;
  gate_visit_sequence: number;
  review_type: ReviewType;
  account_policy_version: number;
  target_state_id: string;
  target_state_name: "In Progress" | "Merging";
  target_edge: string;
  github_status: GitHubStep;
  linear_status: LinearStep;
  outcome: ReviewOutcome;
  linear_operation_id: string | null;
  linear_delivery_deadline: string | null;
  review_ready_at: string | null;
  terminal_at: string | null;
}

export class ReviewContinuationError extends Error {
  readonly code: string;
  readonly safeDetails: Readonly<Record<string, unknown>>;

  constructor(code: string, safeDetails: Readonly<Record<string, unknown>> = {}, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "ReviewContinuationError";
    this.code = code;
    this.safeDetails = safeDetails;
  }
}

const text = new TextEncoder();
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)]
  .map((value) => value.toString(16).padStart(2, "0")).join("");

export const sha256Hex = async (value: string): Promise<string> =>
  hex(await crypto.subtle.digest("SHA-256", text.encode(value)));

export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ReviewContinuationError("invalid_input");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new ReviewContinuationError("invalid_input");
};

const normalizeId = (value: unknown, code = "invalid_input"): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/.test(value)) {
    throw new ReviewContinuationError(code);
  }
  return value;
};

const normalizeReview = (input: PrepareReviewInput): PrepareReviewInput => {
  normalizeId(input.reviewId);
  normalizeId(input.runId);
  normalizeId(input.issueId);
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository)) throw new ReviewContinuationError("invalid_input");
  if (!Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) throw new ReviewContinuationError("invalid_input");
  if (!/^[0-9a-f]{40}$/.test(input.headSha)) throw new ReviewContinuationError("invalid_input");
  if (!Number.isSafeInteger(input.gateVisitSequence) || input.gateVisitSequence <= 0) throw new ReviewContinuationError("invalid_input");
  if (!Number.isSafeInteger(input.accountPolicyVersion) || input.accountPolicyVersion <= 0) throw new ReviewContinuationError("invalid_input");
  if (!["COMMENT", "REQUEST_CHANGES", "APPROVE"].includes(input.reviewType)) throw new ReviewContinuationError("invalid_input");
  if (!Array.isArray(input.items) || input.items.length > 100) throw new ReviewContinuationError("invalid_input");
  const ids = new Set<string>();
  for (const item of input.items) {
    normalizeId(item.contentItemId);
    if (ids.has(item.contentItemId)) throw new ReviewContinuationError("id_clash", { contentItemId: item.contentItemId });
    ids.add(item.contentItemId);
    if (!["reply", "inline", "review_body"].includes(item.kind) || typeof item.body !== "string" || item.body.length > 65_536) {
      throw new ReviewContinuationError("invalid_input");
    }
    canonicalJson(item.target);
  }
  return input;
};

export const reviewBoundDigest = async (input: PrepareReviewInput): Promise<string> => {
  const checked = normalizeReview(input);
  const items = await Promise.all(checked.items.map(async (item, ordinal) => ({
    ordinal,
    contentItemId: item.contentItemId,
    kind: item.kind,
    contentDigest: await sha256Hex(item.body),
    targetDigest: await sha256Hex(canonicalJson(item.target)),
  })));
  return sha256Hex(canonicalJson({
    version: 1,
    reviewId: checked.reviewId,
    supersedesReviewId: checked.supersedesReviewId ?? null,
    runId: checked.runId,
    issueId: checked.issueId,
    repository: checked.repository,
    pullRequestNumber: checked.pullRequestNumber,
    headSha: checked.headSha,
    gateVisitSequence: checked.gateVisitSequence,
    reviewType: checked.reviewType,
    accountPolicyVersion: checked.accountPolicyVersion,
    items,
  }));
};

const assertionMessage = (assertion: Omit<ServiceAssertion, "mac">): string => canonicalJson(assertion);
const hmacKey = (secret: string, usage: ("sign" | "verify")[]): Promise<CryptoKey> => {
  if (secret.length < 32) throw new ReviewContinuationError("service_auth_unavailable");
  return crypto.subtle.importKey("raw", text.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usage);
};

export const signServiceAssertion = async (
  input: Omit<ServiceAssertion, "version" | "keyVersion" | "mac">,
  secret: string,
  keyVersion = 1,
): Promise<ServiceAssertion> => {
  const unsigned = { version: 1 as const, keyVersion, ...input };
  const mac = hex(await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), text.encode(assertionMessage(unsigned))));
  return { ...unsigned, mac };
};

export const verifyServiceAssertion = async (
  assertion: ServiceAssertion,
  secret: string,
  expected: { method: string; bodyDigest: string; nowMs: number; maxAgeMs?: number; maxFutureMs?: number },
): Promise<void> => {
  const { mac, ...unsigned } = assertion;
  if (assertion.version !== 1 || assertion.keyVersion <= 0 || !/^[0-9a-f]{64}$/.test(mac)
    || assertion.method !== expected.method || assertion.bodyDigest !== expected.bodyDigest
    || !Number.isSafeInteger(assertion.githubUserId) || assertion.githubUserId <= 0
    || !assertion.accessAccount || !/^[A-Za-z0-9_-]{16,200}$/.test(assertion.nonce)) {
    throw new ReviewContinuationError("invalid_service_assertion");
  }
  const age = expected.nowMs - assertion.issuedAt;
  if (age > (expected.maxAgeMs ?? 60_000) || age < -(expected.maxFutureMs ?? 5_000)) {
    throw new ReviewContinuationError("expired_service_assertion");
  }
  const valid = await crypto.subtle.verify(
    "HMAC", await hmacKey(secret, ["verify"]), Uint8Array.from(mac.match(/../g) ?? [], (part) => Number.parseInt(part, 16)),
    text.encode(assertionMessage(unsigned)),
  );
  if (!valid) throw new ReviewContinuationError("invalid_service_assertion");
};

export const reviewTarget = (
  reviewType: ReviewType,
  states: { inProgressStateId: string; mergingStateId: string },
): { stateId: string; stateName: "In Progress" | "Merging"; edge: "edit" | "trusted_merge" } =>
  reviewType === "APPROVE"
    ? { stateId: normalizeId(states.mergingStateId), stateName: "Merging", edge: "trusted_merge" }
    : { stateId: normalizeId(states.inProgressStateId), stateName: "In Progress", edge: "edit" };

export const reviewMarker = async (input: {
  reviewId: string;
  partId: string;
  contentItemId?: string;
  facts: unknown;
}): Promise<string> => {
  const digest = await sha256Hex(canonicalJson(input.facts));
  return `<!-- bettaview:v1 review=${input.reviewId} part=${input.partId}${input.contentItemId ? ` item=${input.contentItemId}` : ""} digest=${digest} -->`;
};

export interface GitHubReviewFact {
  id: number;
  commit_id: string | null;
  state: string;
  body: string;
  html_url: string;
  user: { id: number } | null;
}
export interface GitHubCommentFact {
  id: number;
  commit_id: string;
  in_reply_to_id?: number | null;
  body: string;
  html_url: string;
  path: string;
  line?: number | null;
  side?: string | null;
  user: { id: number } | null;
}

export const classifyMarkerReadBack = <T>(
  pages: readonly (readonly T[])[],
  exact: (value: T) => boolean,
  conflict: (value: T) => boolean,
  complete: boolean,
): { outcome: "adopted"; value: T } | { outcome: "host_check_required"; reason: string } => {
  if (!complete) return { outcome: "host_check_required", reason: "incomplete_pagination" };
  const values = pages.flat();
  if (values.some(conflict)) return { outcome: "host_check_required", reason: "conflicting_marker_facts" };
  const matches = values.filter(exact);
  return matches.length === 1
    ? { outcome: "adopted", value: matches[0] }
    : { outcome: "host_check_required", reason: matches.length === 0 ? "no_exact_match" : "multiple_exact_matches" };
};

export type LinearMutationClassification =
  | { outcome: "succeeded"; issueId: string; stateId: string }
  | { outcome: "failed" | "unclear"; publicCode: string; providerMessage: string; causeChain: unknown[] };

export const classifyLinearMutation = (
  httpStatus: number,
  payload: unknown,
  expected: { issueId: string; stateId: string },
): LinearMutationClassification => {
  const body = payload as { errors?: unknown[]; data?: { issueUpdate?: { success?: unknown; issue?: { id?: unknown; state?: { id?: unknown } } } } };
  if (httpStatus < 200 || httpStatus >= 300) return {
    outcome: "failed", publicCode: "linear_http_failed", providerMessage: `Linear HTTP ${httpStatus}`, causeChain: [payload],
  };
  if (Array.isArray(body?.errors) && body.errors.length > 0) return {
    outcome: "failed", publicCode: "linear_graphql_failed",
    providerMessage: String((body.errors[0] as { message?: unknown })?.message ?? "Linear GraphQL error"), causeChain: body.errors,
  };
  const result = body?.data?.issueUpdate;
  if (result?.success !== true) return {
    outcome: "failed", publicCode: "linear_mutation_rejected", providerMessage: "Linear issueUpdate did not succeed", causeChain: [result ?? null],
  };
  if (result.issue?.id !== expected.issueId || result.issue?.state?.id !== expected.stateId) return {
    outcome: "unclear", publicCode: "linear_result_mismatch", providerMessage: "Linear returned mismatched issue state facts", causeChain: [result],
  };
  return { outcome: "succeeded", issueId: expected.issueId, stateId: expected.stateId };
};

export interface ReviewStatusView {
  reviewId: string;
  reviewType: ReviewType;
  goalState: string;
  github: { status: GitHubStep; label: string; complete: boolean };
  linear: { status: LinearStep; label: string; complete: boolean };
  outcome: ReviewOutcome;
  continued: boolean;
  actions: readonly ("retry" | "abandon" | "reload" | "replace")[];
  safeError?: { code: string; message: string };
}

export const projectReviewStatus = (
  intent: ReviewIntentRecord,
  error?: { code: string; message: string } | null,
): ReviewStatusView => {
  const actions: ("retry" | "abandon" | "reload" | "replace")[] = [];
  if (intent.github_status === "failed_retryable" || intent.linear_status === "failed_retryable") actions.push("retry");
  if (intent.outcome === "active" && intent.linear_operation_id === null && intent.github_status !== "host_check_required") actions.push("abandon");
  if (intent.outcome === "abandoned_before_linear" || intent.outcome === "abandoned_stale_after_linear") actions.push("reload", "replace");
  if (intent.github_status === "host_check_required" || intent.linear_status === "host_check_required") actions.push("reload");
  return {
    reviewId: intent.review_id,
    reviewType: intent.review_type,
    goalState: intent.target_state_name,
    github: { status: intent.github_status, label: "GitHub review", complete: intent.github_status === "done" },
    linear: { status: intent.linear_status, label: `Linear · ${intent.target_state_name}`, complete: intent.linear_status === "done" },
    outcome: intent.outcome,
    continued: intent.outcome === "continued",
    actions,
    ...(error ? { safeError: error } : {}),
  };
};

export interface RunGateAuthority {
  run_id: string;
  issue_id: string;
  route_repository: string | null;
  route_github_installation_id: string | null;
  definition_digest: string;
  frozen_access_account: string | null;
  frozen_github_user_id: number | null;
  frozen_linear_user_id: string | null;
  bettaview_account_policy_version: number | null;
  gate_state: string;
  gate_repository: string;
  pull_request_number: number;
  approved_head_sha: string;
  in_progress_state_id: string | null;
  merging_state_id: string | null;
}

const changes = (result: D1Result<unknown>): number => result.meta.changes ?? 0;

export class D1ReviewContinuationStore {
  private readonly database: D1Database;
  constructor(database: D1Database) { this.database = database; }

  authority(runId: string, visit: number): Promise<RunGateAuthority | null> {
    return this.database.prepare(
      `SELECT r.run_id,r.issue_id,r.route_repository,r.route_github_installation_id,r.definition_digest,
        r.frozen_access_account,r.frozen_github_user_id,r.frozen_linear_user_id,r.bettaview_account_policy_version,
        g.state gate_state,g.repository gate_repository,g.pull_request_number,g.approved_head_sha,
        p.in_progress_state_id,p.merging_state_id
       FROM orchestration_runs r JOIN human_gate_visits g ON g.run_id=r.run_id AND g.visit_sequence=?
       JOIN project_workflow_policies p ON p.project_id=r.project_id
       WHERE r.run_id=? AND p.bettaview_continuation_enabled=1`,
    ).bind(visit, runId).first<RunGateAuthority>();
  }

  find(reviewId: string): Promise<ReviewIntentRecord | null> {
    return this.database.prepare("SELECT * FROM review_intents WHERE review_id=?")
      .bind(reviewId).first<ReviewIntentRecord>();
  }

  part(reviewId: string, partId: string): Promise<{ kind: "reply" | "review_bundle" } | null> {
    return this.database.prepare("SELECT kind FROM review_parts WHERE review_id=? AND part_id=?")
      .bind(reviewId, partId).first<{ kind: "reply" | "review_bundle" }>();
  }

  async consumeNonce(assertion: ServiceAssertion, now: string): Promise<void> {
    const result = await this.database.prepare(
      `INSERT OR IGNORE INTO review_proof_nonces
       (key_version,nonce,issued_at,expires_at,request_digest,consumed_at) VALUES(?,?,?,?,?,?)`,
    ).bind(assertion.keyVersion, assertion.nonce, new Date(assertion.issuedAt).toISOString(),
      new Date(assertion.issuedAt + 60_000).toISOString(), assertion.bodyDigest, now).run();
    if (changes(result) !== 1) throw new ReviewContinuationError("replayed_service_assertion");
  }

  async prepare(input: PrepareReviewInput, digest: string, target: ReturnType<typeof reviewTarget>, now: string): Promise<ReviewIntentRecord> {
    const statements: D1PreparedStatement[] = [this.database.prepare(
      `INSERT OR IGNORE INTO review_intents
       (review_id,bound_digest,supersedes_review_id,run_id,issue_id,repository,pull_request_number,head_sha,
        gate_visit_sequence,review_type,account_policy_version,target_state_id,target_state_name,target_edge,
        github_status,linear_status,outcome,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'not_started','not_started','active',?,?)`,
    ).bind(input.reviewId, digest, input.supersedesReviewId ?? null, input.runId, input.issueId,
      input.repository, input.pullRequestNumber, input.headSha, input.gateVisitSequence, input.reviewType,
      input.accountPolicyVersion, target.stateId, target.stateName, target.edge, now, now)];
    for (const [ordinal, item] of input.items.entries()) {
      const contentDigest = await sha256Hex(item.body);
      const targetJson = canonicalJson(item.target);
      const targetDigest = await sha256Hex(targetJson);
      statements.push(this.database.prepare(
        `INSERT OR IGNORE INTO review_content_items
         (review_id,content_item_id,kind,ordinal,body,content_digest,target_json,target_digest,created_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
      ).bind(input.reviewId, item.contentItemId, item.kind, ordinal, item.body, contentDigest, targetJson, targetDigest, now));
    }
    const replies = input.items.filter((item) => item.kind === "reply");
    for (const [ordinal, item] of replies.entries()) {
      statements.push(this.database.prepare(
        `INSERT OR IGNORE INTO review_parts
         (review_id,part_id,content_item_id,kind,ordinal,content_digest,target_digest,created_at)
         SELECT review_id,?,content_item_id,'reply',?,content_digest,target_digest,?
         FROM review_content_items WHERE review_id=? AND content_item_id=?`,
      ).bind(`reply:${item.contentItemId}`, ordinal, now, input.reviewId, item.contentItemId));
    }
    statements.push(this.database.prepare(
      `INSERT OR IGNORE INTO review_parts
       (review_id,part_id,kind,ordinal,content_digest,target_digest,created_at)
       VALUES(?,'review_bundle','review_bundle',?,?,?,?)`,
    ).bind(input.reviewId, replies.length, digest, digest, now));
    statements.push(this.database.prepare(
      `INSERT OR IGNORE INTO review_continuation_leases
       (run_id,gate_visit_sequence,review_id,phase,acquired_at) VALUES(?,?,?,'publishing',?)`,
    ).bind(input.runId, input.gateVisitSequence, input.reviewId, now));
    await this.database.batch(statements);
    const stored = await this.find(input.reviewId);
    if (stored === null) throw new ReviewContinuationError("d1_write_failed");
    if (stored.bound_digest !== digest) throw new ReviewContinuationError("id_clash", { savedDigest: stored.bound_digest, receivedDigest: digest });
    const lease = await this.database.prepare(
      "SELECT review_id FROM review_continuation_leases WHERE run_id=? AND gate_visit_sequence=? AND released_at IS NULL",
    ).bind(input.runId, input.gateVisitSequence).first<{ review_id: string }>();
    if (lease?.review_id !== input.reviewId) throw new ReviewContinuationError("gate_review_in_progress", { activeReviewId: lease?.review_id ?? null });
    return stored;
  }

  workflowTarget(reviewId: string): Promise<{ runId: string; workflowInstanceId: string } | null> {
    return this.database.prepare(`SELECT r.run_id runId,o.workflow_instance_id workflowInstanceId
      FROM review_intents r JOIN orchestration_runs o ON o.run_id=r.run_id
      WHERE r.review_id=? AND r.outcome='active' AND r.github_status='done'`)
      .bind(reviewId).first<{ runId: string; workflowInstanceId: string }>();
  }

  async pendingForDelivery(runId: string, event: { issueId: string; actorId: string | null; fromStateId: string | null; toStateId: string | null }): Promise<ReviewIntentRecord | null> {
    return this.database.prepare(`SELECT r.* FROM review_intents r
      JOIN project_workflow_policies p ON p.project_id=(SELECT project_id FROM orchestration_runs WHERE run_id=r.run_id)
      WHERE r.run_id=? AND r.issue_id=? AND r.outcome='active' AND r.github_status='done'
        AND r.linear_status='awaiting_delivery' AND r.target_state_id=? AND p.linear_app_actor_id=?
        AND ?=(SELECT human_gate_state_id FROM project_workflow_policies WHERE project_id=(SELECT project_id FROM orchestration_runs WHERE run_id=r.run_id))
      ORDER BY r.created_at LIMIT 1`)
      .bind(runId, event.issueId, event.toStateId, event.actorId, event.fromStateId).first<ReviewIntentRecord>();
  }

  async failLinear(reviewId: string, operationId: string, classification: Exclude<LinearMutationClassification, { outcome: "succeeded" }>, now: string): Promise<void> {
    const status = classification.outcome === "unclear" ? "host_check_required" : "failed_retryable";
    await this.recordFault({ reviewId, operationId, provider: "linear", publicCode: classification.publicCode,
      error: new Error(classification.providerMessage, { cause: new AggregateError(classification.causeChain.map((cause) => cause instanceof Error ? cause : new Error(canonicalJson(cause)))) }),
      safeFacts: { operationId, outcome: classification.outcome }, now });
    const result = await this.database.prepare(`UPDATE review_intents SET linear_status=?,outcome=CASE WHEN ?='host_check_required' THEN 'host_check_required' ELSE outcome END,
      terminal_at=CASE WHEN ?='host_check_required' THEN ? ELSE terminal_at END,updated_at=?
      WHERE review_id=? AND linear_operation_id=? AND linear_status='moving' AND outcome='active'`)
      .bind(status,status,status,now,now,reviewId,operationId).run();
    if (changes(result) !== 1) throw new ReviewContinuationError("linear_fault_conflict");
  }

  async nextPermit(reviewId: string, step: "github" | "linear" | "repair", scopeId: string, requestDigest: string, now: string): Promise<{ permitId: string; generation: number }> {
    if (!/^[0-9a-f]{64}$/.test(requestDigest)) throw new ReviewContinuationError("invalid_request_digest");
    if (step === "github") {
      const first = await this.database.prepare(
        "SELECT part_id FROM review_parts WHERE review_id=? AND receipt_status IN ('pending','failed_retryable') ORDER BY ordinal LIMIT 1",
      ).bind(reviewId).first<{ part_id: string }>();
      if (!first || first.part_id !== scopeId) throw new ReviewContinuationError("part_not_permitted", { expectedPartId: first?.part_id ?? null });
    }
    const existing = await this.database.prepare(
      "SELECT generation,permit_id FROM review_attempts WHERE review_id=? AND step=? AND scope_id=? AND finished_at IS NULL",
    ).bind(reviewId, step, scopeId).first<{ generation: number; permit_id: string }>();
    if (existing) return { permitId: existing.permit_id, generation: existing.generation };
    const latest = await this.database.prepare(
      "SELECT COALESCE(MAX(generation),0) generation FROM review_attempts WHERE review_id=? AND step=? AND scope_id=?",
    ).bind(reviewId, step, scopeId).first<{ generation: number }>();
    const generation = (latest?.generation ?? 0) + 1;
    const permitId = `${reviewId}:${step}:${scopeId}:${generation}`;
    await this.database.prepare(
      `INSERT INTO review_attempts(review_id,step,scope_id,generation,permit_id,request_digest,started_at)
       VALUES(?,?,?,?,?,?,?)`,
    ).bind(reviewId, step, scopeId, generation, permitId, requestDigest, now).run();
    return { permitId, generation };
  }

  async completePart(input: {
    reviewId: string; partId: string; permitId: string; recordId: string; url: string;
    commitSha: string; githubUserId: number; event: ReviewType | null; receiptDigest: string; now: string;
  }): Promise<void> {
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE review_parts SET receipt_status='done',github_record_id=?,github_url=?,github_commit_sha=?,
         github_user_id=?,github_event=?,provider_receipt_digest=?,completed_at=?
         WHERE review_id=? AND part_id=? AND receipt_status='pending'`,
      ).bind(input.recordId, input.url, input.commitSha, input.githubUserId, input.event,
        input.receiptDigest, input.now, input.reviewId, input.partId),
      this.database.prepare(
        "UPDATE review_attempts SET outcome='succeeded',finished_at=? WHERE permit_id=? AND review_id=? AND step='github' AND scope_id=? AND finished_at IS NULL",
      ).bind(input.now, input.permitId, input.reviewId, input.partId),
    ]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) throw new ReviewContinuationError("receipt_conflict");
  }

  async markGitHubReady(reviewId: string, expectedHead: string, now: string): Promise<void> {
    const pending = await this.database.prepare(
      "SELECT COUNT(*) count FROM review_parts WHERE review_id=? AND receipt_status NOT IN ('done','published_prior_intent')",
    ).bind(reviewId).first<{ count: number }>();
    if ((pending?.count ?? 1) !== 0) throw new ReviewContinuationError("github_incomplete");
    const digest = await sha256Hex(canonicalJson({ reviewId, expectedHead, event: "review_ready" }));
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE review_intents SET github_status='done',review_ready_at=?,updated_at=?
         WHERE review_id=? AND head_sha=? AND github_status IN ('not_started','publishing','done') AND outcome='active'`,
      ).bind(now, now, reviewId, expectedHead),
      this.database.prepare(
        "INSERT OR IGNORE INTO review_ready_events(review_id,event_digest,state,created_at) VALUES(?,?,'pending',?)",
      ).bind(reviewId, digest, now),
    ]);
    if (changes(results[0]) !== 1) throw new ReviewContinuationError("stale_or_closed_gate");
  }

  async allocateLinear(reviewId: string, operationId: string, now: string): Promise<ReviewIntentRecord> {
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE review_continuation_leases SET phase='linear_pending'
         WHERE review_id=? AND phase='publishing' AND released_at IS NULL`,
      ).bind(reviewId),
      this.database.prepare(
        `UPDATE review_intents SET linear_status='moving',linear_operation_id=?,updated_at=?
         WHERE review_id=? AND outcome='active' AND github_status='done' AND linear_status='not_started'`,
      ).bind(operationId, now, reviewId),
    ]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) throw new ReviewContinuationError("linear_allocation_conflict");
    const intent = await this.find(reviewId);
    if (!intent) throw new ReviewContinuationError("d1_read_failed");
    return intent;
  }

  async awaitLinearDelivery(reviewId: string, operationId: string, now: Date): Promise<void> {
    const deadline = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
    const result = await this.database.prepare(
      `UPDATE review_intents SET linear_status='awaiting_delivery',linear_delivery_deadline=?,updated_at=?
       WHERE review_id=? AND linear_operation_id=? AND linear_status='moving'`,
    ).bind(deadline, now.toISOString(), reviewId, operationId).run();
    if (changes(result) !== 1) throw new ReviewContinuationError("linear_receipt_conflict");
  }

  async correlateDelivery(input: {
    reviewId: string; deliveryId: string; issueId: string; actorId: string; fromStateId: string;
    toStateId: string; operationId: string; liveHead: string; expectedAppActorId: string; humanReviewStateId: string; now: string;
  }): Promise<"continued" | "duplicate" | "mismatch" | "stale_head"> {
    const intent = await this.find(input.reviewId);
    if (!intent) return "mismatch";
    if (intent.outcome === "continued") return "duplicate";
    if (intent.issue_id !== input.issueId || intent.target_state_id !== input.toStateId
      || intent.linear_operation_id !== input.operationId || intent.linear_status !== "awaiting_delivery") return "mismatch";
    if (intent.head_sha !== input.liveHead) {
      await this.database.prepare(
        "UPDATE review_intents SET linear_status='reverting',updated_at=? WHERE review_id=? AND outcome='active'",
      ).bind(input.now, input.reviewId).run();
      return "stale_head";
    }
    if (input.actorId !== input.expectedAppActorId || input.fromStateId !== input.humanReviewStateId) return "mismatch";
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE review_intents SET linear_status='done',updated_at=?
         WHERE review_id=? AND outcome='active' AND linear_status='awaiting_delivery'`,
      ).bind(input.now, input.reviewId),
      this.database.prepare(
        "UPDATE workflow_event_inbox SET review_id=? WHERE delivery_id=? AND review_id IS NULL",
      ).bind(input.reviewId, input.deliveryId),
    ]);
    if (changes(results[0]) !== 1 || changes(results[1]) !== 1) {
      throw new ReviewContinuationError("gate_choice_conflict");
    }
    return "continued";
  }

  async abandonBeforeLinear(reviewId: string, now: string, reason = "reviewer_abandoned"): Promise<void> {
    const intent = await this.find(reviewId);
    if (!intent || intent.outcome !== "active" || intent.linear_operation_id !== null
      || intent.github_status === "host_check_required") throw new ReviewContinuationError("abandon_not_allowed");
    await this.database.batch([
      this.database.prepare(
        `UPDATE review_intents SET outcome='abandoned_before_linear',github_status=CASE WHEN github_status='done' THEN 'done' ELSE 'abandoned' END,
         updated_at=?,terminal_at=? WHERE review_id=? AND outcome='active' AND linear_operation_id IS NULL`,
      ).bind(now, now, reviewId),
      this.database.prepare(
        "UPDATE review_continuation_leases SET released_at=?,release_reason=? WHERE review_id=? AND released_at IS NULL AND phase='publishing'",
      ).bind(now, reason, reviewId),
      this.database.prepare(
        "UPDATE review_attempts SET outcome='abandoned',finished_at=? WHERE review_id=? AND finished_at IS NULL",
      ).bind(now, reviewId),
    ]);
  }

  async recordFault(input: { reviewId: string; operationId?: string | null; provider: "github" | "linear" | "d1" | "service_auth"; publicCode: string; error: unknown; safeFacts: unknown; now: string }): Promise<string> {
    const faultId = `review-fault:${await sha256Hex(`${input.reviewId}:${input.operationId ?? input.publicCode}`)}`;
    const error = input.error instanceof Error ? input.error : new Error(String(input.error));
    const causes: string[] = [];
    let current: unknown = error;
    for (let depth = 0; current instanceof Error && depth < 8; depth += 1) {
      causes.push(current.message.replace(/(?:token|secret|authorization)=[^\s,]+/gi, "credential=[redacted]"));
      current = current.cause;
    }
    await this.database.prepare(
      `INSERT OR IGNORE INTO review_faults
       (fault_id,review_id,operation_id,provider,public_code,first_provider_message,cause_chain_json,safe_act_facts_json,created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
    ).bind(faultId, input.reviewId, input.operationId ?? null, input.provider, input.publicCode,
      causes[0] ?? "unknown provider failure", JSON.stringify(causes), canonicalJson(input.safeFacts), input.now).run();
    return faultId;
  }
}

export class ReviewContinuationService {
  private readonly store: D1ReviewContinuationStore;
  private readonly secret: string;
  private readonly liveHead: (authority: RunGateAuthority) => Promise<string>;
  private readonly now: () => Date;
  constructor(store: D1ReviewContinuationStore, secret: string, liveHead: (authority: RunGateAuthority) => Promise<string>, now: () => Date = () => new Date()) {
    this.store = store;
    this.secret = secret;
    this.liveHead = liveHead;
    this.now = now;
  }

  async prepare(assertion: ServiceAssertion, input: PrepareReviewInput): Promise<ReviewStatusView> {
    const bodyDigest = await sha256Hex(canonicalJson(input));
    await verifyServiceAssertion(assertion, this.secret, { method: "prepareReview", bodyDigest, nowMs: this.now().getTime() });
    const now = this.now().toISOString();
    await this.store.consumeNonce(assertion, now);
    const authority = await this.store.authority(input.runId, input.gateVisitSequence);
    if (!authority || authority.gate_state !== "open" || authority.issue_id !== input.issueId
      || authority.gate_repository !== input.repository || authority.pull_request_number !== input.pullRequestNumber) {
      throw new ReviewContinuationError("unlinked_or_closed_gate");
    }
    if (authority.frozen_access_account !== assertion.accessAccount
      || authority.frozen_github_user_id !== assertion.githubUserId
      || authority.bettaview_account_policy_version !== input.accountPolicyVersion
      || !authority.frozen_linear_user_id) throw new ReviewContinuationError("identity_mismatch");
    const liveHead = await this.liveHead(authority);
    if (authority.approved_head_sha !== input.headSha || liveHead !== input.headSha) throw new ReviewContinuationError("stale_head");
    if (!authority.in_progress_state_id || !authority.merging_state_id) throw new ReviewContinuationError("continuation_not_ready");
    const intent = await this.store.prepare(input, await reviewBoundDigest(input), reviewTarget(input.reviewType, {
      inProgressStateId: authority.in_progress_state_id, mergingStateId: authority.merging_state_id,
    }), now);
    return projectReviewStatus(intent);
  }

  async status(reviewId: string): Promise<ReviewStatusView> {
    const intent = await this.store.find(normalizeId(reviewId));
    if (!intent) throw new ReviewContinuationError("review_not_found");
    return projectReviewStatus(intent);
  }
}


export type ReviewReadyDispatcher = (
  target: { runId: string; workflowInstanceId: string },
  reviewId: string,
) => Promise<void>;

export class ReviewContinuationRpc {
  private readonly store: D1ReviewContinuationStore;
  private readonly service: ReviewContinuationService;
  private readonly secret: string;
  private readonly liveHead: (authority: RunGateAuthority) => Promise<string>;
  private readonly dispatchReviewReady: ReviewReadyDispatcher;
  private readonly now: () => Date;

  constructor(
    store: D1ReviewContinuationStore,
    secret: string,
    liveHead: (authority: RunGateAuthority) => Promise<string>,
    dispatchReviewReady: ReviewReadyDispatcher,
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.secret = secret;
    this.liveHead = liveHead;
    this.dispatchReviewReady = dispatchReviewReady;
    this.now = now;
    this.service = new ReviewContinuationService(store, secret, liveHead, now);
  }

  prepareReview(assertion: ServiceAssertion, input: PrepareReviewInput): Promise<ReviewStatusView> {
    return this.service.prepare(assertion, input);
  }

  status(reviewId: string): Promise<ReviewStatusView> {
    return this.service.status(reviewId);
  }

  async requestPermit(assertion: ServiceAssertion, input: {
    reviewId: string; step: "github" | "linear" | "repair"; scopeId: string; requestDigest: string;
  }): Promise<{ permitId: string; generation: number }> {
    await this.authorizeLiveReview("requestPermit", assertion, input);
    return this.store.nextPermit(
      input.reviewId, input.step, input.scopeId, input.requestDigest, this.now().toISOString(),
    );
  }

  async completeGitHubPart(assertion: ServiceAssertion, input: {
    reviewId: string; partId: string; permitId: string; recordId: string; url: string;
    commitSha: string; githubUserId: number; event: ReviewType | null; receiptDigest: string;
  }): Promise<ReviewStatusView> {
    const { intent } = await this.authorizeReview("completeGitHubPart", assertion, input);
    const part = await this.store.part(input.reviewId, input.partId);
    if (!part) throw new ReviewContinuationError("part_not_found");
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new ReviewContinuationError("receipt_mismatch");
    }
    const pullPath = `/${intent.repository}/pull/${intent.pull_request_number}`;
    const expectedEvent = part.kind === "review_bundle" ? intent.review_type : null;
    if (input.githubUserId !== assertion.githubUserId || input.commitSha !== intent.head_sha
      || input.event !== expectedEvent
      || url.protocol !== "https:" || url.hostname !== "github.com" || url.pathname !== pullPath
      || !/^[0-9a-f]{64}$/.test(input.receiptDigest)) {
      throw new ReviewContinuationError("receipt_mismatch");
    }
    await this.store.completePart({ ...input, now: this.now().toISOString() });
    return this.status(input.reviewId);
  }

  async markGitHubReady(assertion: ServiceAssertion, input: {
    reviewId: string; headSha: string;
  }): Promise<ReviewStatusView> {
    const { intent } = await this.authorizeLiveReview("markGitHubReady", assertion, input);
    if (input.headSha !== intent.head_sha) throw new ReviewContinuationError("stale_head");
    await this.store.markGitHubReady(input.reviewId, input.headSha, this.now().toISOString());
    const target = await this.store.workflowTarget(input.reviewId);
    if (!target) throw new ReviewContinuationError("review_ready_target_missing");
    await this.dispatchReviewReady(target, input.reviewId);
    return this.status(input.reviewId);
  }

  async abandon(assertion: ServiceAssertion, input: { reviewId: string }): Promise<ReviewStatusView> {
    await this.authorizeReview("abandon", assertion, input);
    await this.store.abandonBeforeLinear(input.reviewId, this.now().toISOString());
    return this.status(input.reviewId);
  }

  private async authorize(method: string, assertion: ServiceAssertion, input: unknown): Promise<void> {
    const bodyDigest = await sha256Hex(canonicalJson(input));
    await verifyServiceAssertion(assertion, this.secret, {
      method, bodyDigest, nowMs: this.now().getTime(),
    });
    await this.store.consumeNonce(assertion, this.now().toISOString());
  }

  private async authorizeReview(
    method: string,
    assertion: ServiceAssertion,
    input: { reviewId: string },
  ): Promise<{ intent: ReviewIntentRecord; authority: RunGateAuthority }> {
    await this.authorize(method, assertion, input);
    const intent = await this.store.find(input.reviewId);
    if (!intent) throw new ReviewContinuationError("review_not_found");
    const authority = await this.store.authority(intent.run_id, intent.gate_visit_sequence);
    if (!authority || authority.frozen_access_account !== assertion.accessAccount
      || authority.frozen_github_user_id !== assertion.githubUserId
      || authority.bettaview_account_policy_version !== intent.account_policy_version) {
      throw new ReviewContinuationError("identity_mismatch");
    }
    return { intent, authority };
  }

  private async authorizeLiveReview(
    method: string,
    assertion: ServiceAssertion,
    input: { reviewId: string },
  ): Promise<{ intent: ReviewIntentRecord; authority: RunGateAuthority }> {
    const result = await this.authorizeReview(method, assertion, input);
    const { intent, authority } = result;
    if (authority.gate_state !== "open" || authority.issue_id !== intent.issue_id
      || authority.gate_repository !== intent.repository
      || authority.pull_request_number !== intent.pull_request_number
      || authority.approved_head_sha !== intent.head_sha
      || await this.liveHead(authority) !== intent.head_sha) {
      throw new ReviewContinuationError("stale_or_closed_gate");
    }
    return result;
  }
}

export interface ReviewWorkflowRun {
  runId: string;
  currentVisitSequence: number;
  definitionDigest: string;
  status: string;
}

export const continueReviewToLinear = async (
  store: D1ReviewContinuationStore,
  run: ReviewWorkflowRun,
  liveHead: (intent: ReviewIntentRecord) => Promise<string>,
  moveLinear: (issueId: string, stateId: string) => Promise<LinearMutationClassification>,
  reviewId: string,
  now: () => Date = () => new Date(),
): Promise<ReviewIntentRecord> => {
  let intent = await store.find(reviewId);
  const authority = intent ? await store.authority(intent.run_id, intent.gate_visit_sequence) : null;
  if (!intent || intent.run_id !== run.runId || intent.gate_visit_sequence !== run.currentVisitSequence
    || run.status !== "awaiting_human" || run.definitionDigest !== authority?.definition_digest) {
    throw new ReviewContinuationError("review_ready_authority_mismatch");
  }
  const currentHead = await liveHead(intent);
  if (currentHead !== intent.head_sha) {
    if (intent.linear_operation_id === null) {
      await store.abandonBeforeLinear(reviewId, now().toISOString(), "stale_or_closed_before_linear");
      const abandoned = await store.find(reviewId);
      if (!abandoned) throw new ReviewContinuationError("d1_read_failed");
      return abandoned;
    }
    throw new ReviewContinuationError("stale_head_after_linear");
  }
  if (["awaiting_delivery", "done"].includes(intent.linear_status)) return intent;
  if (intent.linear_status !== "not_started") {
    throw new ReviewContinuationError("linear_effect_requires_reconciliation");
  }
  const operationId = `review:${reviewId}:linear-state`;
  intent = await store.allocateLinear(reviewId, operationId, now().toISOString());
  const result = await moveLinear(intent.issue_id, intent.target_state_id);
  if (result.outcome !== "succeeded") {
    await store.failLinear(reviewId, operationId, result, now().toISOString());
  } else {
    await store.awaitLinearDelivery(reviewId, operationId, now());
  }
  const updated = await store.find(reviewId);
  if (!updated) throw new ReviewContinuationError("d1_read_failed");
  return updated;
};
export const preservePrimaryFailure = (primary: unknown, diagnostic: unknown): Error => {
  recordCaughtError(primary, "src/review-continuation.ts:primary");
  recordCaughtError(diagnostic, "src/review-continuation.ts:diagnostic");
  const primaryError = primary instanceof Error ? primary : new Error(String(primary));
  const diagnosticError = diagnostic instanceof Error ? diagnostic : new Error(String(diagnostic));
  return new Error(primaryError.message, { cause: new AggregateError([primaryError, diagnosticError], "diagnostic persistence also failed") });
};

export interface CheckedAccountInput {
  projectId: string;
  expectedRouteRevision: number;
  accessAccount: string;
  githubUserId: number;
  linearUserId: string;
  linearAppActorId: string;
  settingsActor: string;
  providerEvidenceDigest: string;
  states: { humanReview: string; inProgress: string; merging: string };
}

export interface BettaViewAccountView {
  projectId: string;
  policyVersion: number;
  accessAccount: string;
  githubUserId: number;
  linearUserId: string;
  routeRevision: number;
  readiness: "ready";
  stateNames: readonly ["Human Review", "In Progress", "Merging"];
}

export class D1BettaViewAccountStore {
  private readonly database: D1Database;
  constructor(database: D1Database) { this.database = database; }

  async current(projectId: string): Promise<BettaViewAccountView | null> {
    const row = await this.database.prepare(
      `SELECT project_id,policy_version,access_account,github_user_id,linear_user_id,route_revision
       FROM project_bettaview_accounts WHERE project_id=? AND status='current'`,
    ).bind(projectId).first<{
      project_id: string; policy_version: number; access_account: string; github_user_id: number;
      linear_user_id: string; route_revision: number;
    }>();
    return row ? {
      projectId: row.project_id, policyVersion: row.policy_version, accessAccount: row.access_account,
      githubUserId: row.github_user_id, linearUserId: row.linear_user_id, routeRevision: row.route_revision,
      readiness: "ready", stateNames: ["Human Review", "In Progress", "Merging"],
    } : null;
  }

  async activate(input: CheckedAccountInput, now: string): Promise<BettaViewAccountView> {
    normalizeId(input.projectId);
    normalizeId(input.linearUserId);
    normalizeId(input.linearAppActorId);
    if (!input.accessAccount || !Number.isSafeInteger(input.githubUserId) || input.githubUserId <= 0
      || !Number.isSafeInteger(input.expectedRouteRevision) || input.expectedRouteRevision <= 0
      || !/^[0-9a-f]{64}$/.test(input.providerEvidenceDigest)
      || Object.values(input.states).some((state) => !state)) throw new ReviewContinuationError("invalid_input");
    const policy = await this.database.prepare(
      "SELECT route_revision,human_gate_state_id FROM project_workflow_policies WHERE project_id=?",
    ).bind(input.projectId).first<{ route_revision: number; human_gate_state_id: string }>();
    if (!policy || policy.route_revision !== input.expectedRouteRevision) throw new ReviewContinuationError("stale_route_revision");
    if (policy.human_gate_state_id !== input.states.humanReview) throw new ReviewContinuationError("state_identity_mismatch");
    const latest = await this.database.prepare(
      "SELECT COALESCE(MAX(policy_version),0) version FROM project_bettaview_accounts WHERE project_id=?",
    ).bind(input.projectId).first<{ version: number }>();
    const version = (latest?.version ?? 0) + 1;
    const auditId = `bettaview-account:${input.projectId}:${version}`;
    const results = await this.database.batch([
      this.database.prepare(
        "UPDATE project_bettaview_accounts SET status='superseded',superseded_at=? WHERE project_id=? AND status='current'",
      ).bind(now, input.projectId),
      this.database.prepare(
        `INSERT INTO project_bettaview_accounts
         (project_id,policy_version,access_account,github_user_id,linear_user_id,provider_evidence_digest,
          settings_actor,route_revision,status,human_review_state_id,in_progress_state_id,merging_state_id,
          created_at,activated_at) VALUES(?,?,?,?,?,?,?,?,'current',?,?,?,?,?)`,
      ).bind(input.projectId, version, input.accessAccount, input.githubUserId, input.linearUserId,
        input.providerEvidenceDigest, input.settingsActor, input.expectedRouteRevision,
        input.states.humanReview, input.states.inProgress, input.states.merging, now, now),
      this.database.prepare(
        `INSERT INTO bettaview_account_audit
         (audit_id,project_id,policy_version,event,settings_actor,safe_facts_json,created_at)
         VALUES(?,?,?,'activated',?,?,?)`,
      ).bind(auditId, input.projectId, version, input.settingsActor, canonicalJson({
        accessAccount: input.accessAccount, githubUserId: input.githubUserId,
        linearUserId: input.linearUserId, routeRevision: input.expectedRouteRevision,
        providerEvidenceDigest: input.providerEvidenceDigest,
      }), now),
      this.database.prepare(
        `UPDATE project_workflow_policies SET bettaview_continuation_enabled=1,
         in_progress_state_id=?,merging_state_id=?,linear_app_actor_id=?,updated_at=?
         WHERE project_id=? AND route_revision=?`,
      ).bind(input.states.inProgress, input.states.merging, input.linearAppActorId, now, input.projectId, input.expectedRouteRevision),
    ]);
    if (changes(results[1]) !== 1 || changes(results[2]) !== 1 || changes(results[3]) !== 1) {
      throw new ReviewContinuationError("account_activation_conflict");
    }
    const view = await this.current(input.projectId);
    if (!view || view.policyVersion !== version) throw new ReviewContinuationError("account_activation_readback_failed");
    return view;
  }

  async rejected(input: Omit<CheckedAccountInput, "states" | "providerEvidenceDigest">, error: unknown, now: string): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.database.prepare(
      `INSERT INTO bettaview_account_audit
       (audit_id,project_id,event,settings_actor,safe_facts_json,provider_message,cause_chain_json,created_at)
       VALUES(? ,?,'rejected',?,?,?, ?,?)`,
    ).bind(`bettaview-account-rejected:${crypto.randomUUID()}`, input.projectId, input.settingsActor,
      canonicalJson({ accessAccount: input.accessAccount, githubUserId: input.githubUserId,
        linearUserId: input.linearUserId, routeRevision: input.expectedRouteRevision }),
      message, JSON.stringify([message]), now).run();
  }
}

export class LinearReviewTransitionAdapter {
  private readonly apiUrl: string;
  private readonly accessToken: string;
  private readonly request: typeof fetch;
  constructor(apiUrl: string, accessToken: string, request: typeof fetch = fetch) {
    this.apiUrl = apiUrl;
    this.accessToken = accessToken;
    this.request = request;
  }

  async move(issueId: string, stateId: string): Promise<LinearMutationClassification> {
    const response = await this.request(this.apiUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation BettaViewReviewState($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
            issue { id state { id } }
          }
        }`,
        variables: { id: issueId, stateId },
      }),
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      return {
        outcome: "unclear",
        publicCode: "linear_response_unreadable",
        providerMessage: error instanceof Error ? error.message : String(error),
        causeChain: [error],
      };
    }
    return classifyLinearMutation(response.status, payload, { issueId, stateId });
  }
}
