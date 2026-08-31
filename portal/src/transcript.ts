import { PORTAL_SELECTS } from "./model.ts";

const MAX_TRANSCRIPT_BYTES = 4 * 1024 * 1024;
const MAX_TRANSCRIPT_RECORDS = 10_000;
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

const hex = (value: ArrayBuffer): string => Array.from(new Uint8Array(value))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

export const parseTranscriptJsonl = (text: string): TranscriptRecord[] => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length > MAX_TRANSCRIPT_RECORDS) throw new TranscriptUnavailableError("transcript is too large");
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

  async read(attemptId: string): Promise<VerifiedTranscript> {
    const row = await this.db.prepare(PORTAL_SELECTS.transcript)
      .bind(attemptId)
      .first<TranscriptRow>();
    if (row === null) throw new TranscriptNotFoundError("transcript not found");
    if (
      !Number.isSafeInteger(row.byte_size) || row.byte_size < 0 ||
      row.byte_size > MAX_TRANSCRIPT_BYTES ||
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
      throw new TranscriptUnavailableError("transcript JSONL is invalid");
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
