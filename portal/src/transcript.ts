import { PORTAL_SELECTS } from "./model.ts";

const ACCEPTED_MEDIA_TYPES = new Set([
  "application/json",
  "application/jsonl",
  "application/x-ndjson",
]);

interface TranscriptRow {
  attempt_id: string;
  run_id: string;
  node_id: string;
  run_sequence: number;
  issue_key: string;
  r2_key: string;
  media_type: string;
  byte_size: number;
  sha256: string;
}

export interface TranscriptRecord {
  number: number;
  raw: string;
  value: Record<string, unknown>;
}

export interface VerifiedTranscript {
  attemptId: string;
  runId: string;
  runSequence: number;
  issueKey: string;
  nodeId: string;
  byteSize: number;
  sha256: string;
  records: TranscriptRecord[];
  bytes: ArrayBuffer;
}

export class TranscriptNotFoundError extends Error {}
export class TranscriptUnavailableError extends Error {}

export const transcriptState = (records: readonly TranscriptRecord[]) => records.length ? 'content' as const : 'empty' as const;


const hex = (value: ArrayBuffer): string => Array.from(new Uint8Array(value))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

export const parseTranscriptJsonl = (text: string): TranscriptRecord[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return lines.map((raw, index) => {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TranscriptUnavailableError("transcript record is invalid");
    }
    return { number: index + 1, raw, value: value as Record<string, unknown> };
  });
};

export class TranscriptReadStore {
  private readonly db: D1Database;
  private readonly bucket: R2Bucket;

  constructor(
    db: D1Database,
    bucket: R2Bucket,
  ) {
    this.db = db;
    this.bucket = bucket;
  }

  async child(ownerId: string): Promise<Record<string, unknown>> {
    const row = await this.db.prepare(`SELECT owner.attempt_id, owner.child_index, owner.sha256, owner.byte_size, owner.event_count,
        artifact.r2_key, artifact.sha256 AS artifact_sha256
      FROM review_transcript_owners owner
      JOIN agent_attempts attempt ON attempt.attempt_id = owner.attempt_id
      JOIN orchestration_runs run ON run.run_id = attempt.run_id
      JOIN project_workflow_policies route ON route.project_id = run.project_id
      JOIN linear_issue_index issue ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
      JOIN artifacts artifact ON artifact.manifest_id = owner.manifest_id AND artifact.logical_name = owner.logical_name
        AND artifact.policy_outcome = 'accepted'
      JOIN artifact_manifests manifest ON manifest.manifest_id = artifact.manifest_id AND manifest.state = 'complete'
      WHERE owner.owner_kind = 'native_child_invocation' AND owner.owner_id = ?`)
      .bind(ownerId).first<{ attempt_id: string; child_index: number; sha256: string; byte_size: number; event_count: number; r2_key: string; artifact_sha256: string }>();
    if (!row) {
      const known = await this.db.prepare(`SELECT cycle.origin_attempt_id AS attempt_id FROM phase_review_cycles cycle
        JOIN orchestration_runs run ON run.run_id = cycle.run_id
        JOIN project_workflow_policies route ON route.project_id = run.project_id
        JOIN linear_issue_index issue ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
        WHERE EXISTS (SELECT 1 FROM json_each(cycle.state_json, '$.discovery.invocations') invocation WHERE json_extract(invocation.value, '$.id') = ?)
           OR EXISTS (SELECT 1 FROM json_each(cycle.state_json, '$.recheck.invocations') invocation WHERE json_extract(invocation.value, '$.id') = ?)`)
        .bind(ownerId, ownerId).first<{ attempt_id: string }>();
      if (!known) throw new TranscriptNotFoundError("review child transcript not found");
      return { state: 'corrupt', ownerId, attemptId: known.attempt_id, records: [], message: 'The required child transcript evidence is missing.' };
    }
    const corrupt = () => ({ state: "corrupt", ownerId, attemptId: row.attempt_id, records: [], message: "This child transcript failed its integrity check." });
    const object = await this.bucket.get(row.r2_key);
    if (!object) return corrupt();
    const text = await object.text();
    if (hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))) !== row.artifact_sha256) return corrupt();
    let child;
    try { child = JSON.parse(text).children?.[row.child_index]; }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return { ...corrupt(), detail: error.message };
    }
    if (child?.invocationId !== ownerId || typeof child.transcript !== "string") return corrupt();
    const bytes = new TextEncoder().encode(child.transcript);
    if (bytes.length !== row.byte_size || hex(await crypto.subtle.digest("SHA-256", bytes)) !== row.sha256) return corrupt();
    let records;
    try { records = parseTranscriptJsonl(child.transcript); }
    catch (error) {
      if (!(error instanceof SyntaxError || error instanceof TranscriptUnavailableError)) throw error;
      return { ...corrupt(), detail: error.message };
    }
    if (records.length !== row.event_count) return corrupt();
    return { state: transcriptState(records), ownerId, attemptId: row.attempt_id, records,
      byteSize: bytes.length, sha256: row.sha256, eventCount: records.length,
      message: records.length ? null : "No transcript content was captured." };
  }

  async view(attemptId: string): Promise<Record<string, unknown>> {
    try {
      const transcript = await this.read(attemptId);
      return { ...transcriptDto(transcript), state: transcriptState(transcript.records),
        message: transcript.records.length ? null : "No transcript content was captured." };
    } catch (error) {
      if (error instanceof TranscriptUnavailableError) {
        return { state: "corrupt", message: "This transcript failed its integrity check.",
          detail: error.message, attemptId, records: [] };
      }
      if (!(error instanceof TranscriptNotFoundError)) throw error;
      const owner = await this.db.prepare(`SELECT attempt.attempt_id, attempt.job_spec_json,
          run.definition_version, run.definition_id FROM agent_attempts attempt
        JOIN orchestration_runs run ON run.run_id = attempt.run_id
        JOIN project_workflow_policies route ON route.project_id = run.project_id
        JOIN linear_issue_index issue ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
        WHERE attempt.attempt_id = ?`).bind(attemptId)
        .first<{ attempt_id: string; job_spec_json: string }>();
      if (owner === null) throw error;
      const job = JSON.parse(owner.job_spec_json);
      return job.transcriptSchema ? { state: "corrupt", attemptId, records: [],
        message: "The required transcript evidence is missing." } : {
        state: "unavailable", attemptId, records: [],
        message: "No supported transcript was saved for this older job." };
    }
  }

  async read(attemptId: string): Promise<VerifiedTranscript> {
    const row = await this.db.prepare(PORTAL_SELECTS.transcript)
      .bind(attemptId)
      .first<TranscriptRow>();
    if (row === null) throw new TranscriptNotFoundError("transcript not found");
    if (
      !Number.isSafeInteger(row.byte_size) || row.byte_size < 0 ||
      !/^[0-9a-f]{64}$/i.test(row.sha256) ||
      !ACCEPTED_MEDIA_TYPES.has(row.media_type.toLowerCase())
    ) throw new TranscriptUnavailableError("transcript metadata is invalid");

    const object = await this.bucket.get(row.r2_key);
    if (object === null || object.size !== row.byte_size) {
      throw new TranscriptUnavailableError("transcript object is unavailable");
    }
    const buffer = await object.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength !== row.byte_size) {
      throw new TranscriptUnavailableError("transcript object size differs");
    }
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    if (digest.toLowerCase() !== row.sha256.toLowerCase()) {
      throw new TranscriptUnavailableError("transcript object digest differs");
    }
    let records: TranscriptRecord[];
    try {
      records = parseTranscriptJsonl(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch (error) {
      if (error instanceof TranscriptUnavailableError) throw error;
      throw Object.assign(new TranscriptUnavailableError("transcript JSONL is invalid"), { cause: error });
    }
    return {
      attemptId: row.attempt_id,
      runId: row.run_id,
      runSequence: row.run_sequence,
      issueKey: row.issue_key,
      nodeId: row.node_id,
      byteSize: row.byte_size,
      sha256: row.sha256.toLowerCase(),
      records,
      bytes: buffer,
    };
  }
}

export const transcriptDto = (transcript: VerifiedTranscript): Record<string, unknown> => ({
  attemptId: transcript.attemptId,
  runId: transcript.runId,
  runSequence: transcript.runSequence,
  issueKey: transcript.issueKey,
  nodeId: transcript.nodeId,
  byteSize: transcript.byteSize,
  sha256: transcript.sha256,
  eventCount: transcript.records.length,
  records: transcript.records,
});
