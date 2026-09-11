import { ClaudeReviewError, digest, type ClaudeEnrollment, type ClaudeReceipt, type ClaudeStopCause } from "./claude-review.ts";

export interface ClaudeInvocation {
  attempt_id: string;
  runner_id: string;
  job_digest: string;
  secret_version: string;
  account_binding: string;
  state: "claimed" | "running" | "finished" | "failed";
  process_id: string | null;
  safe_cause: ClaudeStopCause | null;
  retry_not_before: string | null;
  cleanup_state: "pending" | "destroyed" | "failed";
}
export interface ClaudeTurn {
  attempt_id: string;
  ordinal: number;
  input_sha256: string;
  session_id: string | null;
  receipt_key: string | null;
  receipt_sha256: string | null;
}

/** Invocation claims are never reset: ambiguity consumes the attempt. */
export class ClaudeReviewStore {
  private readonly db: D1Database;
  private readonly bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) { this.db = db; this.bucket = bucket; }

  async enrollment(): Promise<ClaudeEnrollment> {
    const row = await this.db.prepare("SELECT * FROM claude_review_enrollment WHERE singleton = 1")
      .first<{ secret_version: string; account_binding: string; token_hmac: string }>();
    if (!row) throw new ClaudeReviewError("auth_failure");
    return { version: 1, secretVersion: row.secret_version, accountBinding: row.account_binding,
      tokenHmac: row.token_hmac, subscription: "pro", paidUsageEnabled: false };
  }

  invocation(attemptId: string): Promise<ClaudeInvocation | null> {
    return this.db.prepare("SELECT * FROM claude_review_invocations WHERE attempt_id = ?")
      .bind(attemptId).first<ClaudeInvocation>();
  }

  async claim(input: { attemptId: string; runnerId: string; jobDigest: string; enrollment: ClaudeEnrollment }): Promise<boolean> {
    const now = new Date().toISOString();
    const result = await this.db.prepare(`INSERT OR IGNORE INTO claude_review_invocations
      (attempt_id, runner_id, job_digest, secret_version, account_binding, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'claimed', ?, ?)`)
      .bind(input.attemptId, input.runnerId, input.jobDigest, input.enrollment.secretVersion,
        input.enrollment.accountBinding, now, now).run();
    return result.meta.changes === 1;
  }

  async started(attemptId: string, processId: string): Promise<void> {
    const result = await this.db.prepare(`UPDATE claude_review_invocations SET state = 'running',
      process_id = ?, updated_at = ? WHERE attempt_id = ? AND state = 'claimed'`)
      .bind(processId, new Date().toISOString(), attemptId).run();
    if (result.meta.changes !== 1) throw new ClaudeReviewError("review_failure");
  }

  async fail(attemptId: string, cause: ClaudeStopCause, retry: string | null = null): Promise<void> {
    await this.db.prepare(`UPDATE claude_review_invocations SET state = 'failed', safe_cause = ?,
      retry_not_before = ?, updated_at = ? WHERE attempt_id = ? AND state != 'failed'`)
      .bind(cause, retry, new Date().toISOString(), attemptId).run();
  }

  async cleanup(attemptId: string, state: "destroyed" | "failed"): Promise<void> {
    await this.db.prepare(`UPDATE claude_review_invocations SET cleanup_state = ?, updated_at = ? WHERE attempt_id = ?`)
      .bind(state, new Date().toISOString(), attemptId).run();
  }

  async finish(attemptId: string): Promise<void> {
    const result = await this.db.prepare(`UPDATE claude_review_invocations SET state = 'finished', updated_at = ?
      WHERE attempt_id = ? AND state = 'running' AND cleanup_state = 'destroyed'
      AND EXISTS (SELECT 1 FROM claude_review_turns WHERE attempt_id = ?)
      AND NOT EXISTS (SELECT 1 FROM claude_review_turns WHERE attempt_id = ? AND receipt_key IS NULL)`)
      .bind(new Date().toISOString(), attemptId, attemptId, attemptId).run();
    if (result.meta.changes !== 1) {
      if ((await this.invocation(attemptId))?.state !== "finished") throw new ClaudeReviewError("review_failure");
    }
  }

  async claimTurn(attemptId: string, ordinal: number, inputHash: string, session: string | null): Promise<ClaudeTurn> {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal > 5 || !/^[a-f0-9]{64}$/.test(inputHash)) {
      throw new ClaudeReviewError("review_failure");
    }
    await this.db.prepare(`INSERT OR IGNORE INTO claude_review_turns
      (attempt_id, ordinal, input_sha256, session_id, created_at)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM claude_review_invocations WHERE attempt_id = ? AND state = 'running')
      AND (? = 0 OR EXISTS (SELECT 1 FROM claude_review_turns WHERE attempt_id = ? AND ordinal = ? AND receipt_key IS NOT NULL))`)
      .bind(attemptId, ordinal, inputHash, session, new Date().toISOString(), attemptId, ordinal, attemptId, ordinal - 1).run();
    const turn = await this.turn(attemptId, ordinal);
    if (!turn || turn.input_sha256 !== inputHash || turn.session_id !== session) throw new ClaudeReviewError("review_failure");
    return turn;
  }

  turn(attemptId: string, ordinal: number): Promise<ClaudeTurn | null> {
    return this.db.prepare("SELECT * FROM claude_review_turns WHERE attempt_id = ? AND ordinal = ?")
      .bind(attemptId, ordinal).first<ClaudeTurn>();
  }

  async saveReceipt(turn: ClaudeTurn, receipt: ClaudeReceipt): Promise<void> {
    const invocation = await this.invocation(turn.attempt_id);
    if (!invocation || invocation.state !== "running" || receipt.attemptId !== turn.attempt_id ||
        receipt.turn !== turn.ordinal || receipt.inputSha256 !== turn.input_sha256 ||
        receipt.accountBinding !== invocation.account_binding || receipt.secretVersion !== invocation.secret_version ||
        (turn.session_id !== null && receipt.sessionId !== turn.session_id)) throw new ClaudeReviewError("review_failure");
    const body = JSON.stringify(receipt);
    const hash = await digest(body);
    const key = `protected/claude-reviews/${await digest(turn.attempt_id)}/${turn.ordinal}.json`;
    await this.bucket.put(key, body, { onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" }, customMetadata: { sha256: hash } });
    const saved = await this.bucket.get(key);
    if (!saved || await digest(await saved.text()) !== hash) throw new ClaudeReviewError("review_failure");
    await this.db.prepare(`UPDATE claude_review_turns SET receipt_key = ?, receipt_sha256 = ?
      WHERE attempt_id = ? AND ordinal = ? AND input_sha256 = ? AND receipt_key IS NULL
      AND EXISTS (SELECT 1 FROM claude_review_invocations WHERE attempt_id = ? AND state = 'running')`)
      .bind(key, hash, turn.attempt_id, turn.ordinal, turn.input_sha256, turn.attempt_id).run();
    const readBack = await this.turn(turn.attempt_id, turn.ordinal);
    if (readBack?.receipt_key !== key || readBack.receipt_sha256 !== hash) throw new ClaudeReviewError("review_failure");
  }

  async receipt(turn: ClaudeTurn): Promise<ClaudeReceipt | null> {
    if (!turn.receipt_key) return null;
    const object = await this.bucket.get(turn.receipt_key);
    if (!object) throw new ClaudeReviewError("review_failure");
    const body = await object.text();
    if (await digest(body) !== turn.receipt_sha256) throw new ClaudeReviewError("review_failure");
    return JSON.parse(body) as ClaudeReceipt;
  }

  async receipts(attemptId: string): Promise<ClaudeReceipt[]> {
    const turns = await this.db.prepare("SELECT * FROM claude_review_turns WHERE attempt_id = ? ORDER BY ordinal")
      .bind(attemptId).all<ClaudeTurn>();
    const receipts: ClaudeReceipt[] = [];
    for (const turn of turns.results) {
      const receipt = await this.receipt(turn);
      if (!receipt || turn.ordinal !== receipts.length) throw new ClaudeReviewError("review_failure");
      receipts.push(receipt);
    }
    if (!receipts.length) throw new ClaudeReviewError("review_failure");
    return receipts;
  }
}
