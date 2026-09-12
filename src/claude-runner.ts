import { requireAttemptTier } from "./sandbox-tier.ts";
import type { ArtifactCollectionResult } from "./artifact-collector.ts";
import { recordCaughtError } from "./error-context.ts";
import { sandboxIdentity } from "./orchestration-identity.ts";
import { CLAUDE_MODEL, CLAUDE_EFFORT, CLAUDE_VERSION, ClaudeReviewError, digest, record,
  verifyClaudeEnrollment, type ClaudeReceipt } from "./claude-review.ts";
import { ClaudeReviewStore, type ClaudeInvocation } from "./claude-review-store.ts";
import type { AgentAttemptRecord, SandboxFactory } from "./sandbox-controller.ts";
import type { CapabilityClaims } from "./capability-auth.ts";

const encoded = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};
const response = (body: Record<string, unknown>, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export class ClaudeRunner {
  private readonly dependencies: {
    db: D1Database; store: ClaudeReviewStore; sandboxes: SandboxFactory;
    token: string | undefined; secretVersion: string | undefined; signingKey: string;
  };
  constructor(dependencies: ClaudeRunner["dependencies"]) { this.dependencies = dependencies; }

  private async attempt(id: string): Promise<{ attempt: AgentAttemptRecord; job: Record<string, unknown> }> {
    const attempt = await this.dependencies.db.prepare("SELECT * FROM agent_attempts WHERE attempt_id = ?")
      .bind(id).first<AgentAttemptRecord>();
    if (!attempt || await digest(attempt.job_spec_json) !== attempt.job_spec_digest) throw new ClaudeReviewError("review_failure");
    const job = record(JSON.parse(attempt.job_spec_json));
    if (job.modelProvider !== "claude" || job.model !== CLAUDE_MODEL || job.reasoning !== CLAUDE_EFFORT ||
        job.agentRole !== "reviewer" || job.permissionProfile !== "review_read_only" ||
        Date.parse(attempt.absolute_deadline) <= Date.now()) throw new ClaudeReviewError("review_failure");
    return { attempt, job };
  }

  private async tier(attempt: AgentAttemptRecord) {
    const run = await this.dependencies.db.prepare("SELECT sandbox_tier FROM orchestration_runs WHERE run_id = ?")
      .bind(attempt.run_id).first<{sandbox_tier:string}>();
    return requireAttemptTier(run?.sandbox_tier, attempt.sandbox_tier);
  }

  async handle(path: string, input: unknown, claims: CapabilityClaims, token: string, url: string): Promise<Response> {
    if (!claims.actions.includes("model.claude_review") || claims.modelProvider !== "claude" ||
        claims.model !== CLAUDE_MODEL || claims.reasoning !== CLAUDE_EFFORT) return response({ error: "capability_denied" }, 403);
    try {
      const body = record(input);
      const { attempt, job } = await this.attempt(claims.attemptId);
      if (path.endsWith("/review")) return await this.review(body, attempt, job, token, url);
      if (path.endsWith("/status")) return await this.status(body, attempt);
      if (path.endsWith("/tools")) return await this.read(body, attempt, job);
      if (path.endsWith("/finish")) {
        await this.finish(attempt.attempt_id);
        return response({ state: "finished" });
      }
      throw new ClaudeReviewError("review_failure");
    } catch (error) {
      const operation = ["review", "status", "tools", "finish"].find(name => path.endsWith(`/${name}`)) ?? "unknown";
      recordCaughtError(new Error(`Claude ${operation} failed (${error instanceof ClaudeReviewError ? error.causeCode : "runner_operation"})`), "src/claude-runner.ts:handle");
      const safe = error instanceof ClaudeReviewError ? error : new ClaudeReviewError("review_failure");
      await this.dependencies.store.fail(claims.attemptId, safe.causeCode, safe.retryNotBefore);
      await this.dependencies.db.prepare("UPDATE agent_attempts SET result_detail = ? WHERE attempt_id = ? AND state = 'running'")
        .bind(safe.causeCode, claims.attemptId).run();
      return response({ error: safe.causeCode, retryNotBefore: safe.retryNotBefore }, 409);
    }
  }

  private async review(body: Record<string, unknown>, attempt: AgentAttemptRecord,
    job: Record<string, unknown>, capabilityToken: string, capabilityUrl: string): Promise<Response> {
    if (Object.keys(body).some(k => !["ordinal", "prompt", "schema", "sessionId"].includes(k)) ||
        typeof body.prompt !== "string" || body.prompt.length === 0 || body.prompt.length > 2_000_000 ||
        !Number.isInteger(body.ordinal) || Number(body.ordinal) < 0 || Number(body.ordinal) > 5 ||
        !(body.sessionId === null || typeof body.sessionId === "string")) throw new ClaudeReviewError("review_failure");
    record(body.schema);
    const inputSha256 = await digest(JSON.stringify({ prompt: body.prompt, schema: body.schema, sessionId: body.sessionId }));
    const store = this.dependencies.store;
    let invocation = await store.invocation(attempt.attempt_id);
    if (!invocation) {
      if (body.ordinal !== 0 || body.sessionId !== null) throw new ClaudeReviewError("review_failure");
      const enrollment = await store.enrollment();
      const run = await this.dependencies.db.prepare(`SELECT independent_review_account_binding AS binding
        FROM orchestration_runs WHERE run_id = ?`).bind(attempt.run_id).first<{ binding: string }>();
      await verifyClaudeEnrollment({ token: this.dependencies.token ?? "", key: this.dependencies.signingKey,
        enrollment, secretVersion: this.dependencies.secretVersion ?? "", expectedAccountBinding: run?.binding ?? "" });
      const runnerId = await sandboxIdentity(`${attempt.attempt_id}:claude`);
      const won = await store.claim({ attemptId: attempt.attempt_id, runnerId,
        jobDigest: attempt.job_spec_digest, enrollment });
      if (!won) return response({ state: "starting" }, 202);
      // Only the durable claim winner may start a process. Never retry this block.
      const sandbox = this.dependencies.sandboxes.get(runnerId, { keepAlive: true, tier: await this.tier(attempt) });
      await sandbox.mkdir("/deos/claude", { recursive: true });
      await sandbox.writeFile("/deos/claude/config.json", JSON.stringify({ attemptId: attempt.attempt_id,
        deadline: attempt.absolute_deadline, capabilityToken, capabilityUrl, enrollment }));
      const process = await sandbox.exec(["node", "--experimental-strip-types", "/deos/bin/claude-trusted-runner.mjs"], {
        cwd: "/deos/claude", env: { CLAUDE_CODE_OAUTH_TOKEN: this.dependencies.token! },
        timeout: Math.max(1, Date.parse(attempt.absolute_deadline) - Date.now()),
      });
      await store.started(attempt.attempt_id, process.id);
      invocation = await store.invocation(attempt.attempt_id);
    }
    if (!invocation || invocation.job_digest !== attempt.job_spec_digest) throw new ClaudeReviewError("review_failure");
    if (invocation.state === "finished") {
      const turn = await store.turn(attempt.attempt_id, Number(body.ordinal));
      if (!turn || turn.input_sha256 !== inputSha256 || turn.session_id !== body.sessionId) throw new ClaudeReviewError("review_failure");
      const receipt = await store.receipt(turn);
      if (!receipt) throw new ClaudeReviewError("review_failure");
      return response({ receipt });
    }
    if (invocation.state === "claimed") return response({ state: "starting" }, 202);
    this.assertRunning(invocation);
    const turn = await store.claimTurn(attempt.attempt_id, Number(body.ordinal), inputSha256, body.sessionId as string | null);
    const receipt = await store.receipt(turn);
    if (receipt) return response({ receipt });
    const sandbox = this.dependencies.sandboxes.get(invocation.runner_id, { keepAlive: true, tier: await this.tier(attempt) });
    const path = `/deos/claude/request-${turn.ordinal}.json`;
    const request = JSON.stringify({ ...body, inputSha256 });
    if ((await sandbox.exists(path)).exists) {
      if ((await sandbox.readFile(path)).content !== request) throw new ClaudeReviewError("review_failure");
    } else {
      await sandbox.writeFile(`${path}.tmp`, request);
      const rename = await sandbox.exec(["mv", `${path}.tmp`, path]);
      if ((await rename.waitForExit()).code !== 0) throw new ClaudeReviewError("review_failure");
    }
    return response({ state: "running", ordinal: turn.ordinal }, 202);
  }

  private assertRunning(invocation: ClaudeInvocation): void {
    if (invocation.state === "failed") throw new ClaudeReviewError(invocation.safe_cause ?? "review_failure", invocation.retry_not_before);
    if (invocation.state !== "running") throw new ClaudeReviewError("review_failure");
  }

  private async status(body: Record<string, unknown>, attempt: AgentAttemptRecord): Promise<Response> {
    if (Object.keys(body).length !== 1 || !Number.isInteger(body.ordinal)) throw new ClaudeReviewError("review_failure");
    const store = this.dependencies.store;
    const invocation = await store.invocation(attempt.attempt_id);
    if (!invocation) throw new ClaudeReviewError("review_failure");
    if (invocation.state === "claimed") return response({ state: "starting" }, 202);
    if (invocation.state !== "finished") this.assertRunning(invocation);
    const turn = await store.turn(attempt.attempt_id, Number(body.ordinal));
    if (!turn && body.ordinal === 0 && invocation.state === "running") return response({ state: "starting" }, 202);
    if (!turn) throw new ClaudeReviewError("review_failure");
    const saved = await store.receipt(turn);
    if (saved) return response({ receipt: saved });
    const sandbox = this.dependencies.sandboxes.get(invocation.runner_id, { keepAlive: true, tier: await this.tier(attempt) });
    if ((await sandbox.exists("/deos/claude/failure.json")).exists) {
      const failure = record(JSON.parse((await sandbox.readFile("/deos/claude/failure.json")).content));
      const stage = ["configuration", "client_start", "provider_turn", "receipt_validation", "receipt_write"].includes(String(failure.diagnosticStage))
        ? failure.diagnosticStage : "unknown";
      const facts = record(failure.diagnosticFacts ?? {});
      const safeFacts = Object.fromEntries(Object.entries(facts).filter(([key, value]) =>
        ["spawnError", "exitCode", "initSeen", "modelPinned", "terminalSuccess", "finalError", "quotaCount", "effortCount"].includes(key) &&
        (typeof value === "boolean" || (typeof value === "number" && Number.isSafeInteger(value)))));
      recordCaughtError(new Error(`Claude client stopped at ${stage}: ${JSON.stringify(safeFacts)}`), "src/claude-runner.ts:status");
      throw new ClaudeReviewError(["auth_failure", "plan_limit"].includes(String(failure.cause))
        ? failure.cause as "auth_failure" | "plan_limit" : "review_failure",
        typeof failure.retryNotBefore === "string" && Number.isFinite(Date.parse(failure.retryNotBefore)) ? failure.retryNotBefore : null);
    }
    const path = `/deos/claude/result-${turn.ordinal}.json`;
    if (!(await sandbox.exists(path)).exists) {
      const process = invocation.process_id ? await sandbox.getProcess(invocation.process_id) : null;
      if (!process || (await process.status()).state !== "running") throw new ClaudeReviewError("review_failure");
      return response({ state: "running" }, 202);
    }
    const content = (await sandbox.readFile(path)).content;
    if (this.dependencies.token && content.includes(this.dependencies.token)) throw new ClaudeReviewError("review_failure");
    const receipt = record(record(JSON.parse(content)).receipt);
    if (receipt.version !== 1 || receipt.provider !== "claude" || receipt.model !== CLAUDE_MODEL ||
        receipt.effort !== CLAUDE_EFFORT || receipt.clientVersion !== CLAUDE_VERSION || receipt.paidUsage !== false ||
        receipt.route !== "claude_pro" || receipt.accountEvidence !== "trusted_enrollment" ||
        typeof receipt.sessionId !== "string" || !receipt.sessionId) throw new ClaudeReviewError("review_failure");
    record(receipt.result);
    await store.saveReceipt(turn, receipt as unknown as ClaudeReceipt);
    return response({ receipt });
  }

  private async read(body: Record<string, unknown>, attempt: AgentAttemptRecord, job: Record<string, unknown>): Promise<Response> {
    if (Object.keys(body).length !== 1 || typeof body.command !== "string" || body.command.length > 8192) throw new ClaudeReviewError("review_failure");
    const invocation = await this.dependencies.store.invocation(attempt.attempt_id);
    if (!invocation) throw new ClaudeReviewError("review_failure");
    this.assertRunning(invocation);
    if (!Array.isArray(job.claudeReviewSources) || job.claudeReviewSources.length === 0) throw new ClaudeReviewError("review_failure");
    const state = { phase: job.reviewKind === "design" ? "design" : "planning", change: job.openspecChange,
      before: job.claudeReviewSources, reviewJob: { materializedContext: job.materializedContext } };
    const sandbox = this.dependencies.sandboxes.get(attempt.sandbox_id, { keepAlive: true, tier: await this.tier(attempt) });
    const process = await sandbox.exec(["node", "/deos/bin/claude-review-read.mjs", encoded(JSON.stringify(state)), encoded(body.command)], { timeout: 15_000 });
    const output = await process.output({ encoding: "utf8", maxBytes: 262144, timeout: 20_000 });
    if (output.exitCode !== 0 || output.truncated || output.timedOut) throw new ClaudeReviewError("review_failure");
    return response({ text: output.stdout });
  }

  async audit(): Promise<void> {
    const rows = await this.dependencies.db.prepare(`SELECT c.attempt_id FROM claude_review_invocations c
      JOIN agent_attempts a ON a.attempt_id = c.attempt_id
      WHERE c.cleanup_state != 'destroyed' AND
        (c.state = 'failed' OR a.state IN ('completed','blocked','failed','interrupted','absolute_timeout','canceled')
         OR a.absolute_deadline <= ?)`)
      .bind(new Date().toISOString()).all<{ attempt_id: string }>();
    for (const row of rows.results) {
      await this.dependencies.store.fail(row.attempt_id, "review_failure");
      await this.cleanup(row.attempt_id);
    }
  }

  async failure(attemptId: string): Promise<string> {
    const invocation = await this.dependencies.store.invocation(attemptId);
    if (invocation?.safe_cause) return invocation.safe_cause;
    const attempt = await this.dependencies.db.prepare("SELECT result_detail FROM agent_attempts WHERE attempt_id = ?")
      .bind(attemptId).first<{ result_detail: string | null }>();
    return ["auth_failure", "plan_limit"].includes(attempt?.result_detail ?? "") ? attempt!.result_detail! : "review_failure";
  }

  async cleanup(attemptId: string): Promise<void> {
    const invocation = await this.dependencies.store.invocation(attemptId);
    if (!invocation || invocation.cleanup_state === "destroyed") return;
    try {
      const attempt = await this.dependencies.db.prepare("SELECT * FROM agent_attempts WHERE attempt_id = ?")
        .bind(attemptId).first<AgentAttemptRecord>();
      if (!attempt) throw new Error("Claude cleanup attempt is missing");
      const sandbox = this.dependencies.sandboxes.get(invocation.runner_id, { keepAlive: false, tier: await this.tier(attempt) });
      await sandbox.setKeepAlive(false);
      await sandbox.destroy();
      await this.dependencies.store.cleanup(attemptId, "destroyed");
    } catch {
      await this.dependencies.store.cleanup(attemptId, "failed");
      throw new ClaudeReviewError("review_failure");
    }
  }

  async finish(attemptId: string): Promise<void> {
    const store = this.dependencies.store;
    const invocation = await store.invocation(attemptId);
    if (!invocation) throw new ClaudeReviewError("review_failure");
    if (invocation.state === "finished" && invocation.cleanup_state === "destroyed") return;
    this.assertRunning(invocation);
    await store.receipts(attemptId);
    await this.cleanup(attemptId);
    await store.finish(attemptId);
  }

  saveCollection(attemptId: string, jobDigest: string, collection: ArtifactCollectionResult): Promise<void> {
    return this.dependencies.store.saveCollection(attemptId, jobDigest, collection);
  }

  collection(attemptId: string, jobDigest: string): Promise<ArtifactCollectionResult | null> {
    return this.dependencies.store.collection(attemptId, jobDigest);
  }

  async proofForReuse(attemptId: string | null, reviewId: string | null = null): Promise<void> {
    const seen = new Set<string>();
    while (!attemptId && reviewId) {
      if (seen.has(reviewId)) throw new ClaudeReviewError("review_failure");
      seen.add(reviewId);
      const row = await this.dependencies.db.prepare(`SELECT attempt_id, reused_from_review_id FROM trace_reviews
        WHERE review_id = ? AND accepted = 1 AND reviewer_provider = 'claude'`)
        .bind(reviewId).first<{ attempt_id: string | null; reused_from_review_id: string | null }>();
      if (!row) throw new ClaudeReviewError("review_failure");
      attemptId = row.attempt_id;
      reviewId = row.reused_from_review_id;
    }
    if (!attemptId) throw new ClaudeReviewError("review_failure");
    const attempt = await this.dependencies.db.prepare("SELECT cleanup_state FROM agent_attempts WHERE attempt_id = ?")
      .bind(attemptId).first<{ cleanup_state: string }>();
    if (attempt?.cleanup_state !== "destroyed") throw new ClaudeReviewError("review_failure");
    await this.proof(attemptId);
  }

  async proof(attemptId: string): Promise<ClaudeReceipt[]> {
    const invocation = await this.dependencies.store.invocation(attemptId);
    if (invocation?.state !== "finished" || invocation.cleanup_state !== "destroyed") throw new ClaudeReviewError("review_failure");
    return this.dependencies.store.receipts(attemptId);
  }
}
