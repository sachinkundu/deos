import {sha256Hex} from './implementation-hash.ts';

export interface TestFailureContext {
  runId: string;
  leaseId?: string;
  phase: string;
  workId?: string;
  operation: string;
  safeCode: string;
  fence?: number;
}

interface SavedError {
  name: string;
  message: string;
  stack: string | null;
  cause: SavedError | null;
}

function redact(text: string): string {
  return text
    .replace(/\b(Bearer\s+)[^\s"']+/gi,'$1[redacted]')
    .replace(/\b((?:authorization|cookie|set-cookie|x-api-key|cf-access-client-secret)\s*[:=]\s*)[^\s;,"']+/gi,'$1[redacted]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{12,}|gh[pousr]_[a-zA-Z0-9_]{12,})\b/g,'[redacted]');
}

function describeError(value: unknown, seen = new Set<unknown>()): SavedError {
  if (seen.has(value)) return {name:'CircularCause',message:'circular error cause',stack:null,cause:null};
  seen.add(value);
  if (value instanceof Error) return {name:value.name,message:redact(value.message),
    stack:value.stack ? redact(value.stack) : null,
    cause:value.cause === undefined ? null : describeError(value.cause,seen)};
  return {name:'NonError',message:redact(String(value)),stack:null,cause:null};
}

export class SharedTestFailureStore {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  constructor(db:D1Database,bucket:R2Bucket) {this.db=db;this.bucket=bucket;}

  async record(context:TestFailureContext,error:unknown,at=new Date()):Promise<string> {
    if (!context.runId || !context.phase || !/^[a-z0-9._:-]+$/.test(context.operation) ||
        !/^[a-z0-9._:-]+$/.test(context.safeCode) ||
        (context.fence !== undefined && (!Number.isSafeInteger(context.fence) || context.fence < 0)))
      throw new Error('invalid_shared_test_failure_context');
    const faultId=crypto.randomUUID();
    const saved=describeError(error);
    const key=`shared-test/failures/${encodeURIComponent(context.runId)}/${faultId}.json`;
    const body=JSON.stringify({faultId,context,error:saved,occurredAt:at.toISOString()});
    const hash=await sha256Hex(body);
    let objectSaved=false;
    let objectFailure:unknown;
    try {
      const written=await this.bucket.put(key,body,{onlyIf:{etagDoesNotMatch:'*'},
        httpMetadata:{contentType:'application/json'}});
      if (!written) throw new Error('shared_test_error_object_exists');
      const read=await this.bucket.get(key);
      if (!read || await sha256Hex(await read.text()) !== hash)
        throw new Error('shared_test_error_object_readback_failed');
      objectSaved=true;
    } catch (storageError) { objectFailure=storageError; }
    try {
      await this.db.prepare(`INSERT INTO test_failures
        (fault_id,run_id,lease_id,phase,work_id,safe_code,object_key,object_sha256,
         first_message,first_stack,causes_json,context_json,occurred_at,later_faults_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(faultId,context.runId,context.leaseId??null,context.phase,context.workId??null,
          context.safeCode,objectSaved?key:null,objectSaved?hash:null,saved.message,saved.stack,
          JSON.stringify(saved.cause),JSON.stringify(context),at.toISOString(),
          JSON.stringify(objectFailure ? [{storageError:describeError(objectFailure)}] : [])).run();
      if (context.leaseId) {
        await this.db.batch([
          this.db.prepare(`UPDATE test_leases SET first_fault_id=COALESCE(first_fault_id,?)
            WHERE lease_id=? AND run_id=?`).bind(faultId,context.leaseId,context.runId),
          this.db.prepare(`UPDATE test_environment SET first_fault_id=COALESCE(first_fault_id,?)
            WHERE site_id=1 AND owner_lease_id=? AND owner_run_id=?`)
            .bind(faultId,context.leaseId,context.runId),
        ]);
      }
    } catch (databaseError) {
      throw new AggregateError(objectFailure ? [databaseError,objectFailure] : [databaseError],
        `shared_test_failure_index_failed:${faultId}:${objectSaved?key:'object_unavailable'}`,{cause:error});
    }
    return faultId;
  }
}
