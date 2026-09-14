import { sha256Hex } from "./implementation-hash.ts";
import { errorDetails } from "./error-details.ts";
import {
  ImplementationError,
  type ImplementationCandidate,
  type ProofRequirement,
  type ImplementationPolicy,
} from "./implementation-contract.ts";

export interface ImplementationRun {
  run_id: string;
  linear_identifier: string;
  issue_run_sequence: number;
  change_id: string;
  approved_design_sha: string;
  tested_base_sha: string;
  branch: string;
  allowed_linear_user_id: string;
  human_binding_revision: number;
  input_key: string;
  input_sha: string;
  approved_files_json: string;
  requirements_json: string;
  status: string;
  tree_sha: string | null;
  candidate_key: string | null;
  candidate_sha: string | null;
  patch_key: string | null;
  patch_sha: string | null;
  patch_base_sha: string | null;
  source_attempt_id: string | null;
  pr_number: number | null;
  pr_url: string | null;
  pr_head_sha: string | null;
  merge_sha: string | null;
  created_at: string;
  updated_at: string;
}
export interface ImplementationInput {
  version: 1;
  runId: string;
  repository: string;
  change: string;
  branch: string;
  approvedDesignSha: string;
  testedBaseSha: string;
  policy: ImplementationPolicy;
  approvedFiles: { path: string; content: string; sha256: string }[];
  issue: Record<string, unknown>;
  receipts: Record<string, unknown>;
  requirements: ProofRequirement;
}
export interface ImplementationResource {
  resource_id: string;
  run_id: string;
  attempt_id: string;
  kind: string;
  slot_id: string;
  allocation_op: string;
  provider: string;
  provider_resource_id: string | null;
  namespace: string | null;
  local_persist_path: string | null;
  preview_origin: string | null;
  status: "allocating" | "ready" | "quarantined" | "destroyed";
  create_window: string | null;
  quarantine_until: string | null;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}
export interface ImplementationGate {
  run_id: string;
  visit_sequence: number;
  node_id: string;
  expected_event_kind: "comment" | "state";
  allowed_linear_user_id: string;
  issue_id: string;
  human_state_id: string;
  question_id: string | null;
  pr_number: number | null;
  head_sha: string | null;
  base_sha: string | null;
  state: string;
  decision_delivery_id: string | null;
  decision_outcome: string | null;
  opened_at: string;
}
export interface ImplementationQuestion {
  question_id: string;
  run_id: string;
  block_key: string;
  gate_visit: number;
  linear_comment_id: string | null;
  opened_delivery_id: string;
  opened_at: string;
  question_key: string;
  question_sha: string;
  status: string;
  answer_delivery_id: string | null;
  answer_comment_id: string | null;
  answer_actor_id: string | null;
  reply_key: string | null;
  reply_sha: string | null;
}
function redactDiagnostic(value: unknown): unknown {
  if (typeof value === "string")
    return value
      .replace(
        /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,}|lin_api_[A-Za-z0-9]+)\b/g,
        "[redacted]",
      )
      .replace(/(Bearer\s+)[A-Za-z0-9._~-]{16,}/gi, "$1[redacted]");
  if (Array.isArray(value)) return value.map(redactDiagnostic);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /^(authorization|cookie|set-cookie|access_token|refresh_token|private_key|signing_secret)$/i.test(
          key,
        )
          ? "[redacted]"
          : redactDiagnostic(item),
      ]),
    );
  return value;
}

export class ImplementationStore {
  readonly db: D1Database;
  readonly bucket: R2Bucket;
  constructor(db: D1Database, bucket: R2Bucket) {
    this.db = db;
    this.bucket = bucket;
  }
  async put(
    runId: string,
    name: string,
    content: string | Uint8Array,
    mediaType = "application/json",
  ) {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    const sha256 = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const key = `implementation/${runId}/${sha256}/${name}`;
    try {
      await this.bucket.put(key, bytes, {
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: mediaType },
      });
    } catch (error) {
      try {
        const saved = await this.readBytes(key, sha256);
        if (saved.byteLength !== bytes.byteLength)
          throw new Error("R2 size differs");
      } catch (readError) {
        throw new AggregateError(
          [error, readError],
          "R2 create and reconciliation failed",
          { cause: error },
        );
      }
    }
    const saved = await this.readBytes(key, sha256);
    if (saved.byteLength !== bytes.byteLength)
      throw new ImplementationError(
        "artifact_size",
        `R2 read-back size differs: ${key}`,
      );
    return { key, sha256, byteSize: bytes.byteLength };
  }
  async readBytes(key: string, sha: string) {
    const object = await this.bucket.get(key);
    if (!object)
      throw new ImplementationError(
        "artifact_missing",
        `R2 object is missing: ${key}`,
      );
    const bytes = new Uint8Array(await object.arrayBuffer());
    const actual = [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
      ),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (actual !== sha)
      throw new ImplementationError(
        "artifact_hash",
        `R2 hash mismatch: ${key}; expected ${sha}; actual ${actual}`,
      );
    return bytes;
  }
  async read<T>(key: string, sha: string): Promise<T> {
    return JSON.parse(
      new TextDecoder().decode(await this.readBytes(key, sha)),
    ) as T;
  }
  run(runId: string) {
    return this.db
      .prepare("SELECT * FROM implementation_runs WHERE run_id = ?")
      .bind(runId)
      .first<ImplementationRun>();
  }
  async requireRun(runId: string) {
    const run = await this.run(runId);
    if (!run)
      throw new ImplementationError(
        "run_missing",
        `Implementation run missing: ${runId}`,
      );
    return run;
  }
  async candidate(run: ImplementationRun) {
    if (!run.candidate_key || !run.candidate_sha)
      throw new ImplementationError(
        "candidate_missing",
        "No accepted implementation candidate",
      );
    return this.read<ImplementationCandidate>(
      run.candidate_key,
      run.candidate_sha,
    );
  }
  async allocate(
    input: ImplementationInput,
    human: { userId: string; revision: number },
    identifier: string,
    sequence: number,
  ) {
    const artifact = await this.put(
      input.runId,
      "checked-input.json",
      JSON.stringify(input),
    );
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO implementation_runs
      (run_id,linear_identifier,issue_run_sequence,change_id,approved_design_sha,tested_base_sha,branch,
       allowed_linear_user_id,human_binding_revision,input_key,input_sha,approved_files_json,requirements_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        input.runId,
        identifier,
        sequence,
        input.change,
        input.approvedDesignSha,
        input.testedBaseSha,
        input.branch,
        human.userId,
        human.revision,
        artifact.key,
        artifact.sha256,
        JSON.stringify(input.approvedFiles),
        JSON.stringify(input.requirements),
        now,
        now,
      )
      .run();
    const row = await this.requireRun(input.runId);
    if (
      row.approved_design_sha !== input.approvedDesignSha ||
      row.branch !== input.branch ||
      row.allowed_linear_user_id !== human.userId
    )
      throw new ImplementationError(
        "run_identity_conflict",
        "Implementation allocation conflicts with saved authority",
      );
    return row;
  }
  async beginTry(
    run: ImplementationRun,
    attempt: { attempt_id: string; sandbox_id: string; visit_sequence: number },
    kind: "tasks" | "build",
  ) {
    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO implementation_tries
      (attempt_id,run_id,try_sequence,kind,sandbox_id,status,tested_base_sha,input_patch_sha,created_at,updated_at)
      SELECT ?,?,COALESCE(MAX(try_sequence),0)+1,?,?,'running',?,?,?,? FROM implementation_tries WHERE run_id=?`,
      )
      .bind(
        attempt.attempt_id,
        run.run_id,
        kind,
        attempt.sandbox_id,
        run.tested_base_sha,
        run.patch_sha,
        now,
        now,
        run.run_id,
      )
      .run();
    const saved = await this.db
      .prepare("SELECT * FROM implementation_tries WHERE attempt_id = ?")
      .bind(attempt.attempt_id)
      .first<{ run_id: string; sandbox_id: string; status: string }>();
    if (
      saved?.run_id !== run.run_id ||
      saved.sandbox_id !== attempt.sandbox_id ||
      saved.status !== "running"
    )
      throw new ImplementationError(
        "attempt_identity_conflict",
        "Implementation try is not active or has conflicting identity",
      );
  }
  async checkpoint(
    run: ImplementationRun,
    candidate: ImplementationCandidate,
    patch: string,
  ) {
    if ((await sha256Hex(patch)) !== candidate.patchSha)
      throw new ImplementationError(
        "patch_hash",
        "Cumulative patch hash differs from the checked candidate",
      );
    const patchObject = await this.put(
      run.run_id,
      "patch.diff",
      patch,
      "text/plain",
    );
    const object = await this.put(
      run.run_id,
      "candidate.json",
      JSON.stringify(candidate),
    );
    const now = new Date().toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE implementation_runs SET tree_sha=?,candidate_key=?,candidate_sha=?,patch_key=?,patch_sha=?,patch_base_sha=?,source_attempt_id=?,status=?,updated_at=? WHERE run_id=? AND tested_base_sha=?`,
        )
        .bind(
          candidate.treeSha,
          object.key,
          object.sha256,
          patchObject.key,
          patchObject.sha256,
          candidate.testedBaseSha,
          candidate.attemptId,
          candidate.outcome === "needs_human"
            ? "clarification"
            : candidate.kind === "tasks"
              ? "build"
              : "proof",
          now,
          run.run_id,
          candidate.testedBaseSha,
        ),
      this.db
        .prepare(
          "UPDATE implementation_tries SET output_patch_sha=?,status=CASE WHEN status IN ('manual_reconciliation_required','retry_required') THEN status ELSE ? END,updated_at=? WHERE attempt_id=? AND run_id=?",
        )
        .bind(
          patchObject.sha256,
          candidate.outcome,
          now,
          candidate.attemptId,
          run.run_id,
        ),
    ]);
    const saved = await this.requireRun(run.run_id);
    if (saved.candidate_sha !== object.sha256)
      throw new ImplementationError(
        "checkpoint_conflict",
        "Checkpoint authority changed during acceptance",
      );
  }
  resources(attemptId: string) {
    return this.db
      .prepare("SELECT * FROM implementation_resources WHERE attempt_id=?")
      .bind(attemptId)
      .all<ImplementationResource>();
  }
  async resource(attemptId: string, kind: string) {
    return this.db
      .prepare(
        "SELECT * FROM implementation_resources WHERE attempt_id=? AND kind=?",
      )
      .bind(attemptId, kind)
      .first<ImplementationResource>();
  }
  async allocateResource(
    runId: string,
    attemptId: string,
    kind: string,
    provider: string,
  ) {
    const now = new Date().toISOString();
    const id = `${attemptId}:${kind}`;
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO implementation_resources
      (resource_id,run_id,attempt_id,kind,slot_id,allocation_op,provider,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'allocating',?,?)`,
      )
      .bind(
        id,
        runId,
        attemptId,
        kind,
        id,
        `${id}:allocate`,
        provider,
        now,
        now,
      )
      .run();
    const row = await this.resource(attemptId, kind);
    if (!row || row.run_id !== runId)
      throw new ImplementationError(
        "resource_identity",
        "Resource allocation identity differs",
      );
    return row;
  }
  async assertResource(
    runId: string,
    attemptId: string,
    id: string,
    providerId?: string,
  ) {
    const row = await this.db
      .prepare(
        `SELECT r.* FROM implementation_resources r JOIN implementation_tries t ON t.attempt_id=r.attempt_id
      WHERE r.resource_id=? AND r.run_id=? AND r.attempt_id=? AND r.status='ready' AND t.status='running'`,
      )
      .bind(id, runId, attemptId)
      .first<ImplementationResource>();
    if (
      !row ||
      (providerId !== undefined && row.provider_resource_id !== providerId)
    )
      throw new ImplementationError(
        "cross_run_resource",
        `Resource is not ready for this attempt: ${id}`,
      );
    return row;
  }
  gate(runId: string, visit: number) {
    return this.db
      .prepare(
        "SELECT * FROM implementation_gates WHERE run_id=? AND visit_sequence=?",
      )
      .bind(runId, visit)
      .first<ImplementationGate>();
  }
  question(runId: string) {
    return this.db
      .prepare(
        "SELECT * FROM implementation_questions WHERE run_id=? AND status IN ('open','answered')",
      )
      .bind(runId)
      .first<ImplementationQuestion>();
  }
  async error(
    runId: string,
    attemptId: string | null,
    operation: string,
    error: unknown,
  ) {
    const original = {
      operation,
      error: redactDiagnostic(errorDetails(error)),
    };
    const object = await this.put(
      runId,
      "original-error.json",
      JSON.stringify(original),
    );
    const id = `${attemptId ?? runId}:${operation}:${object.sha256}`;
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO implementation_effect_errors VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        runId,
        attemptId,
        operation,
        object.key,
        object.sha256,
        new Date().toISOString(),
      )
      .run();
    if (attemptId)
      await this.db
        .prepare(
          `UPDATE implementation_tries SET primary_error_manifest=COALESCE(primary_error_manifest,?),public_error_code=COALESCE(public_error_code,?),updated_at=? WHERE attempt_id=?`,
        )
        .bind(
          object.key,
          error instanceof ImplementationError
            ? error.code
            : "implementation_failed",
          new Date().toISOString(),
          attemptId,
        )
        .run();
    return object;
  }
}
