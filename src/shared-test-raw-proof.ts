import {SharedTestLeaseStore} from './shared-test-lease.ts';
import type {TestBrowserScope} from './shared-test-browser-store.ts';

async function bytesSha256(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0'))
    .join('');
}

/** A capture is private until a separate sanitizer creates safe bytes. */
export class SharedTestRawProofStore {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  constructor(db:D1Database,bucket:R2Bucket) {this.db=db;this.bucket=bucket;}

  async saveAppScreen(scope:TestBrowserScope,capture:{image:Uint8Array;url:string},
    at=new Date()):Promise<string> {
    const origin=`https://${scope.plan.canonicalHost}`;
    if(new URL(capture.url).origin!==origin ||
        capture.image.byteLength<100 || capture.image.byteLength>8_000_000 ||
        ![0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>
          capture.image[index]===byte))
      throw new Error('test_raw_proof_capture_invalid');
    await new SharedTestLeaseStore(this.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence,at);
    const proofId=crypto.randomUUID();
    const key=`shared-test/raw/${encodeURIComponent(scope.leaseId)}/${proofId}.png`;
    const sha=await bytesSha256(capture.image);
    const result=await this.bucket.put(key,capture.image,{onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'image/png'},
      customMetadata:{sha256:sha,evidenceClass:'private-capture'}});
    if(!result)throw new Error('test_raw_proof_object_conflict');
    const saved=await this.bucket.get(key);
    if(!saved || await bytesSha256(new Uint8Array(await saved.arrayBuffer()))!==sha)
      throw new Error('test_raw_proof_readback_failed');
    const now=at.toISOString();
    const write=await this.db.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
       capture_recipe,sanitizer_result,source_sha256,object_key,content_type,
       byte_count) SELECT ?,?,?,'first','app_screen','private',
         'operator_only',?,'pending',?,?,'image/png',?
       WHERE EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
         ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active'
           AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=?
           AND e.heartbeat_due_at>? AND l.attempt_id=? AND l.state='active')`)
      .bind(proofId,scope.runId,scope.leaseId,
        JSON.stringify({version:1,service:scope.plan.serviceName,origin}),
        sha,key,capture.image.byteLength,scope.runId,scope.leaseId,
        scope.fence,now,scope.attemptId).run();
    if(write.meta.changes!==1)
      throw new Error('test_raw_proof_write_fenced');
    return proofId;
  }
}
