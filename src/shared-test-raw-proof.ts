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

  /** Trusted operator capture of the real Linear issue; no agent route calls this. */
  async saveLinearScreen(runId:string,leaseId:string,
    capture:{image:Uint8Array;url:string},at=new Date(),expectedFence?:number):Promise<string> {
    const lease=await this.db.prepare(`SELECT l.task_key,e.fence FROM test_leases l
      JOIN test_environment e ON e.owner_lease_id=l.lease_id
      WHERE l.run_id=? AND l.lease_id=? AND e.owner_run_id=?
        AND e.state IN ('active','quiescing') AND l.state IN ('active','quiescing')
        AND (? IS NULL OR e.fence=?)`)
      .bind(runId,leaseId,runId,expectedFence??null,expectedFence??null).first<{task_key:string;fence:number}>();
    if(!lease || !/^[A-Z]+-\d+$/.test(lease.task_key))
      throw new Error('test_linear_screen_lease_missing');
    const url=new URL(capture.url);
    const parts=url.pathname.split('/');
    if(url.protocol!=='https:' || url.hostname!=='linear.app' ||
        parts[1]!=='sachinkundu' || parts[2]!=='issue' ||
        parts[3]!==lease.task_key || capture.image.byteLength<100 ||
        capture.image.byteLength>8_000_000 ||
        ![0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>
          capture.image[index]===byte))
      throw new Error('test_linear_screen_capture_invalid');
    const proofId=crypto.randomUUID();
    const key=`shared-test/raw/${encodeURIComponent(leaseId)}/${proofId}.png`;
    const sha=await bytesSha256(capture.image);
    const written=await this.bucket.put(key,capture.image,
      {onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'image/png'},
        customMetadata:{sha256:sha,evidenceClass:'private-capture'}});
    const read=await this.bucket.get(key);
    if(!written || !read ||
        await bytesSha256(new Uint8Array(await read.arrayBuffer()))!==sha)
      throw new Error('test_linear_screen_raw_readback_failed');
    const inserted=await this.db.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
       capture_recipe,sanitizer_result,source_sha256,object_key,content_type,
       byte_count) SELECT ?,?,?,'first','linear_screen','private',
         'operator_only',?,'pending',?,?,'image/png',?
       WHERE EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
         ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND
           e.owner_run_id=? AND e.owner_lease_id=? AND
           e.state IN ('active','quiescing') AND l.run_id=? AND
           l.task_key=? AND e.fence=? AND l.state IN ('active','quiescing'))`)
      .bind(proofId,runId,leaseId,
        JSON.stringify({version:1,source:'connected-operator-browser',
          issueKey:lease.task_key,sourceUrl:capture.url}),
        sha,key,capture.image.byteLength,runId,leaseId,runId,
        lease.task_key,lease.fence).run();
    if(inserted.meta.changes!==1)
      throw new Error('test_linear_screen_write_fenced');
    return proofId;
  }
}
