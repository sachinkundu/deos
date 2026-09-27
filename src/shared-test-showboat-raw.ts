async function bytesSha256(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0'))
    .join('');
}

interface Pending {
  run_id:string;lease_id:string;attempt_id:string;
  r2_key:string;sha256:string;byte_size:number;
}

/** Preserve the agent's actual Showboat output as private, checked source proof. */
export class SharedTestShowboatRawDriver {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  constructor(db:D1Database,bucket:R2Bucket) {this.db=db;this.bucket=bucket;}

  async resume(at=new Date()):Promise<'idle'|'saved'> {
    const row=await this.db.prepare(`SELECT l.run_id,l.lease_id,l.attempt_id,
      a.r2_key,a.sha256,a.byte_size FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN artifact_manifests m ON m.run_id=l.run_id AND m.attempt_id=l.attempt_id
        AND m.manifest_id=('manifest:' || l.attempt_id) AND m.state='complete'
      JOIN artifacts a ON a.manifest_id=m.manifest_id
        AND a.logical_name='showboat.md' AND a.policy_outcome='accepted'
      WHERE e.site_id=1 AND e.state IN ('active','quiescing')
        AND e.owner_run_id=l.run_id AND l.state IN ('active','quiescing')
        AND NOT EXISTS (SELECT 1 FROM test_proof_items p
          WHERE p.run_id=l.run_id AND p.lease_id=l.lease_id
            AND p.phase='first' AND p.kind='showboat')`)
      .first<Pending>();
    if(!row)return 'idle';
    if(!/^[a-f0-9]{64}$/.test(row.sha256) || row.byte_size<20 ||
        row.byte_size>200_000 ||
        row.r2_key!==`runs/${encodeURIComponent(row.run_id)}/attempts/${row.attempt_id}/showboat.md`)
      throw new Error('test_showboat_artifact_invalid');
    const source=await this.bucket.get(row.r2_key);
    if(!source)throw new Error('test_showboat_artifact_missing');
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(bytes.byteLength!==row.byte_size || await bytesSha256(bytes)!==row.sha256)
      throw new Error('test_showboat_artifact_changed');
    const document=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);
    if(!document.startsWith('# ') || !document.includes('```bash') ||
        !document.includes('```output') ||
        !document.includes('<!-- showboat-id: ') || document.includes('\0'))
      throw new Error('test_showboat_document_invalid');
    const proofId=crypto.randomUUID();
    const key=`shared-test/raw/${encodeURIComponent(row.lease_id)}/${proofId}.md`;
    const saved=await this.bucket.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'text/markdown'},
      customMetadata:{sha256:row.sha256,evidenceClass:'private-capture'}});
    const read=await this.bucket.get(key);
    if(!saved || !read || await bytesSha256(new Uint8Array(await read.arrayBuffer()))!==row.sha256)
      throw new Error('test_showboat_raw_readback_failed');
    const inserted=await this.db.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
       capture_recipe,sanitizer_result,source_sha256,object_key,
       content_type,byte_count)
      SELECT ?,?,?,'first','showboat','private','operator_only',
        ?,'pending',?,?,'text/markdown',?
      WHERE EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
        ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND
          e.owner_run_id=? AND e.owner_lease_id=? AND
          e.state IN ('active','quiescing') AND l.run_id=? AND
          l.attempt_id=? AND l.state IN ('active','quiescing'))`)
      .bind(proofId,row.run_id,row.lease_id,
        JSON.stringify({version:1,artifactKey:row.r2_key}),row.sha256,key,
        bytes.byteLength,row.run_id,row.lease_id,row.run_id,
        row.attempt_id).run();
    if(inserted.meta.changes!==1)
      throw new Error('test_showboat_raw_write_fenced');
    return 'saved';
  }
}
