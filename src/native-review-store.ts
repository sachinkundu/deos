import { nativeReviewMessage } from "../container/native-review-packet.mjs";
/** Durable receipts for native sessions; semantic policy stays in existing reducers. */
export interface NativeReviewSession {
  session_key: string;
  author_attempt_id: string;
  candidate_sequence: number;
  call_index: number;
  phase: "planning" | "design";
  input_sha256: string;
  launch_json: string;
  subagent_id: string | null;
  state: "allocated" | "started" | "complete" | "accepted" | "fault";
  proof_r2_key: string | null;
  proof_sha256: string | null;
}

export const nativeDigest = async (text: string): Promise<string> => {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const nativeRecord = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("native review object is invalid");
  }
  return value as Record<string, unknown>;
};

export class D1NativeReviewStore {
  private db: D1Database;
  private bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) { this.db = db; this.bucket = bucket; }

  async response(attemptId: string, candidate: number, kind: string) {
    const row = await this.db.prepare(`SELECT response_json FROM self_review_checkpoints
      WHERE author_attempt_id = ? AND json_extract(request_json, '$.candidateSequence') = ?
        AND json_extract(request_json, '$.kind') = ? AND response_json IS NOT NULL ORDER BY sequence DESC LIMIT 1`)
      .bind(attemptId, candidate, kind).first<{ response_json: string }>();
    return row === null ? null : nativeRecord(JSON.parse(row.response_json));
  }

  async finalCheckpoint(attemptId: string) {
    const row = await this.db.prepare(`SELECT request_json, response_json FROM self_review_checkpoints
      WHERE author_attempt_id = ? AND response_json IS NOT NULL ORDER BY sequence DESC LIMIT 1`)
      .bind(attemptId).first<{ request_json: string; response_json: string }>();
    if (row === null) throw new Error("native author has no final checkpoint");
    const response = nativeRecord(JSON.parse(row.response_json));
    if (response.action !== "stop") throw new Error("native author has not reached an accepted stop");
    const sessions = await this.db.prepare("SELECT DISTINCT candidate_sequence FROM self_review_sessions WHERE author_attempt_id = ?")
      .bind(attemptId).all<{ candidate_sequence: number }>();
    if (sessions.results.length === 0) throw new Error("native stop has no durable review evidence");
    for (const item of sessions.results) await this.verifyCandidate(attemptId, item.candidate_sequence);
    const open = await this.db.prepare("SELECT session_key FROM self_review_sessions WHERE author_attempt_id = ? AND state != 'accepted' LIMIT 1")
      .bind(attemptId).first();
    if (open !== null) throw new Error("native stop has an unaccepted child");
    return { request: nativeRecord(JSON.parse(row.request_json)), response };
  }

  async checkpoint(attemptId: string, request: Record<string, unknown>, execute: () => Promise<Record<string, unknown>>) {
    const sequence = request.sequence;
    if (!Number.isSafeInteger(sequence) || Number(sequence) < 0 || request.attemptId !== attemptId) {
      throw new Error("native checkpoint identity mismatch");
    }
    const requestJson = JSON.stringify(request);
    const requestSha256 = await nativeDigest(requestJson);
    await this.db.prepare(`INSERT OR IGNORE INTO self_review_checkpoints
      (author_attempt_id, sequence, request_sha256, request_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .bind(attemptId, sequence, requestSha256, requestJson, new Date().toISOString()).run();
    const saved = await this.db.prepare(`SELECT request_sha256, response_json FROM self_review_checkpoints
      WHERE author_attempt_id = ? AND sequence = ?`).bind(attemptId, sequence)
      .first<{ request_sha256: string; response_json: string | null }>();
    if (saved?.request_sha256 !== requestSha256) throw new Error("native checkpoint input changed");
    if (saved.response_json !== null) return nativeRecord(JSON.parse(saved.response_json));
    const response = { ...await execute(), sequence, requestSha256 };
    const encoded = JSON.stringify(response);
    await this.db.prepare(`UPDATE self_review_checkpoints SET response_json = ?
      WHERE author_attempt_id = ? AND sequence = ? AND request_sha256 = ? AND response_json IS NULL`)
      .bind(encoded, attemptId, sequence, requestSha256).run();
    const committed = await this.db.prepare(`SELECT response_json FROM self_review_checkpoints
      WHERE author_attempt_id = ? AND sequence = ?`).bind(attemptId, sequence)
      .first<{ response_json: string }>();
    if (committed?.response_json !== encoded) throw new Error("native checkpoint response conflict");
    return response;
  }

  async allocate(attemptId: string, phase: "planning" | "design", sequence: number, launch: Record<string, unknown>) {
    if (!Number.isSafeInteger(sequence) || sequence < 1 || !Number.isSafeInteger(launch.index) || Number(launch.index) < 0 ||
        typeof launch.inputSha256 !== "string" || !/^[a-f0-9]{64}$/.test(launch.inputSha256)) {
      throw new Error("native launch identity is invalid");
    }
    const key = `${attemptId}:${sequence}:${launch.index}`;
    const encoded = JSON.stringify(launch);
    const inputDigest = await nativeDigest(nativeReviewMessage(launch));
    const profileDigest = await nativeDigest(JSON.stringify({ role: "deos_reviewer", model: launch.model, reasoning: launch.reasoning,
      tools: "checked-source-reader-v1", fork: launch.sessionId === null ? "none" : "proof-correction" }));
    const candidateDigest = await nativeDigest(JSON.stringify(launch.beforeManifest ?? []));
    const now = new Date().toISOString();
    await this.db.prepare(`INSERT OR IGNORE INTO self_review_sessions
      (session_key, author_attempt_id, candidate_sequence, call_index, phase, input_sha256, profile_sha256, candidate_sha256, launch_json,
       state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'allocated', ?, ?)`)
      .bind(key, attemptId, sequence, launch.index, phase, inputDigest, profileDigest, candidateDigest, encoded, now, now).run();
    const row = await this.session(key, attemptId);
    if (row.launch_json !== encoded || row.phase !== phase) throw new Error("native launch replay conflict");
    return key;
  }

  async session(key: string, attemptId: string): Promise<NativeReviewSession> {
    const row = await this.db.prepare("SELECT * FROM self_review_sessions WHERE session_key = ?")
      .bind(key).first<NativeReviewSession>();
    if (row === null || row.author_attempt_id !== attemptId) throw new Error("native session is not owned by this author");
    return row;
  }

  async started(key: string, attemptId: string, childId: string) {
    if (!/^[a-f0-9-]{36}$/.test(childId)) throw new Error("native child identity is invalid");
    const row = await this.session(key, attemptId);
    const launch = nativeRecord(JSON.parse(row.launch_json));
    if (launch.sessionId === null) {
      const reused = await this.db.prepare("SELECT session_key FROM self_review_sessions WHERE subagent_id = ? AND session_key != ? LIMIT 1")
        .bind(childId, key).first();
      if (reused !== null) throw new Error("native fresh child was already used");
    }
    if (row.subagent_id !== null && row.subagent_id !== childId) throw new Error("native child identity changed");
    await this.db.prepare(`UPDATE self_review_sessions SET subagent_id = ?, state = 'started', updated_at = ?
      WHERE session_key = ? AND state = 'allocated'`).bind(childId, new Date().toISOString(), key).run();
    if ((await this.session(key, attemptId)).subagent_id !== childId) throw new Error("native child start was not saved");
  }

  async complete(key: string, attemptId: string, proof: Record<string, unknown>) {
    const row = await this.session(key, attemptId);
    if (proof.sessionKey !== key || proof.authorAttemptId !== attemptId || proof.subagentId !== row.subagent_id ||
        row.subagent_id === null || JSON.stringify(proof.launch) !== row.launch_json) {
      throw new Error("native proof identity mismatch");
    }
    const effective = nativeRecord(proof.effectiveInput);
    const launch = nativeRecord(proof.launch);
    if (launch.sessionId === null ? effective.fork_turns !== "none" || effective.agent_type !== "deos_reviewer" : effective.target !== launch.sessionId) {
      throw new Error("native proof did not use the declared fresh session or proof correction");
    }
    if (effective.message !== nativeReviewMessage(launch)) throw new Error("native effective prompt changed");
    const start = nativeRecord(proof.startReceipt);
    const completion = nativeRecord(proof.completionReceipt);
    if (start.agent_type !== "deos_reviewer" || start.model !== launch.model ||
        completion.agent_id !== row.subagent_id || completion.agent_type !== "deos_reviewer") {
      throw new Error("native proof profile changed");
    }
    const encoded = JSON.stringify(proof);
    const digest = await nativeDigest(encoded);
    const r2Key = `native-self-review/${encodeURIComponent(key)}/proof.json`;
    await this.bucket.put(r2Key, encoded, { onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json" } });
    const readBack = await this.bucket.get(r2Key);
    if (readBack === null || await nativeDigest(await readBack.text()) !== digest) {
      throw new Error("native proof read-back failed");
    }
    const valid = proof.fault === null && Array.isArray(proof.beforeManifest) &&
      JSON.stringify(proof.beforeManifest) === JSON.stringify(proof.afterManifest) &&
      Array.isArray(proof.transcript) && proof.transcript.length > 0;
    await this.db.prepare(`UPDATE self_review_sessions SET state = ?, proof_r2_key = ?, proof_sha256 = ?, updated_at = ?
      WHERE session_key = ? AND state IN ('started', 'complete', 'fault')`)
      .bind(valid ? "complete" : "fault", r2Key, digest, new Date().toISOString(), key).run();
    const saved = await this.session(key, attemptId);
    if (!valid || saved.proof_sha256 !== digest) throw new Error("native proof rejected");
  }

  async verifyCandidate(attemptId: string, sequence: number) {
    const rows = await this.db.prepare(`SELECT * FROM self_review_sessions
      WHERE author_attempt_id = ? AND candidate_sequence = ? ORDER BY call_index`)
      .bind(attemptId, sequence).all<NativeReviewSession>();
    if (rows.results.length === 0) throw new Error("native candidate has no review proof");
    for (const [index, row] of rows.results.entries()) {
      if (row.call_index !== index || !["complete", "accepted"].includes(row.state) || row.proof_r2_key === null) {
        throw new Error("native candidate proof is incomplete");
      }
      const object = await this.bucket.get(row.proof_r2_key);
      if (object === null || await nativeDigest(await object.text()) !== row.proof_sha256) {
        throw new Error("native candidate proof read-back failed");
      }
    }
  }

  async accepted(attemptId: string, sequence: number, reviewId: string | null = null, outcome: string | null = null) {
    await this.verifyCandidate(attemptId, sequence);
    await this.db.prepare(`UPDATE self_review_sessions SET state = 'accepted', review_id = ?, stop_result = ?, updated_at = ?
      WHERE author_attempt_id = ? AND candidate_sequence = ? AND state = 'complete'`)
      .bind(reviewId, outcome, new Date().toISOString(), attemptId, sequence).run();
  }
}
