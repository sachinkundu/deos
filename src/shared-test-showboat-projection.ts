import {sharedTestProofUrl} from './shared-test-proof-url.ts';

interface Pending {
  proof_id:string;run_id:string;lease_id:string;task_key:string;
  candidate_commit:string;source_sha256:string;object_key:string;
}

async function hash(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0'))
    .join('');
}

function checkoutOutput(raw:string,candidate:string):boolean {
  const pairs=raw.matchAll(/```bash\n([^`]*?)\n```\s*```output\n([^`]*?)\n```/g);
  for(const pair of pairs) {
    if(pair[1].trim()==='git rev-parse HEAD' &&
        pair[2].trim()===candidate)return true;
  }
  return false;
}

/** Project only the exact checkout command/output pair from raw Showboat. */
export class SharedTestShowboatProjection {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  constructor(db:D1Database,bucket:R2Bucket) {this.db=db;this.bucket=bucket;}

  async resume(at=new Date()):Promise<'idle'|'projected'> {
    const row=await this.db.prepare(`SELECT p.proof_id,p.run_id,p.lease_id,
      l.task_key,l.candidate_commit,p.source_sha256,p.object_key
      FROM test_proof_items p JOIN test_leases l ON l.lease_id=p.lease_id
      JOIN test_environment e ON e.owner_lease_id=p.lease_id
      WHERE p.phase='first' AND p.kind='showboat'
        AND p.classification='private' AND p.sanitizer_result='pending'
        AND p.run_id=l.run_id AND p.run_id=e.owner_run_id
        AND e.site_id=1 AND e.state IN ('active','quiescing')
        AND l.state IN ('active','quiescing')`)
      .first<Pending>();
    if(!row)return 'idle';
    if(!/^[A-Z]+-\d+$/.test(row.task_key) ||
        !/^[a-f0-9]{40}$/.test(row.candidate_commit))
      throw new Error('test_showboat_projection_scope_invalid');
    const source=await this.bucket.get(row.object_key);
    if(!source)throw new Error('test_showboat_projection_source_missing');
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(bytes.byteLength>200_000 || await hash(bytes)!==row.source_sha256)
      throw new Error('test_showboat_projection_source_changed');
    const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes);
    if(!checkoutOutput(raw,row.candidate_commit))
      throw new Error('test_showboat_checkout_proof_missing');
    const safe=`# ${row.task_key} checkout command proof\n\n`+
      `Sanitized from the private Showboat capture. Only the checked checkout `+
      `command and its output are public.\n\n`+
      '```bash\ngit rev-parse HEAD\n```\n\n'+
      `\`\`\`output\n${row.candidate_commit}\n\`\`\`\n`;
    const publicBytes=new TextEncoder().encode(safe),publicSha=await hash(publicBytes);
    if(publicSha===row.source_sha256)
      throw new Error('test_showboat_projection_unchanged');
    const key=`shared-test/public/${encodeURIComponent(row.lease_id)}/${row.proof_id}.txt`;
    const saved=await this.bucket.put(key,publicBytes,{
      onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'text/plain'},
      customMetadata:{sha256:publicSha,evidenceClass:'public-safe'}});
    if(!saved) {
      const prior=await this.bucket.get(key);
      if(!prior || await hash(new Uint8Array(await prior.arrayBuffer()))!==publicSha)
        throw new Error('test_showboat_projection_object_conflict');
    }
    const read=await this.bucket.get(key);
    if(!read || await hash(new Uint8Array(await read.arrayBuffer()))!==publicSha)
      throw new Error('test_showboat_projection_readback_failed');
    const updated=await this.db.prepare(`UPDATE test_proof_items SET
      classification='public_safe',view_rule='public',
      sanitizer_version='showboat-checkout-allowlist-v1',
      sanitizer_result='passed',content_type='text/plain',
      public_sha256=?,public_url=?,
      projected_at=? WHERE proof_id=? AND run_id=? AND lease_id=?
        AND kind='showboat' AND classification='private'
        AND sanitizer_result='pending' AND source_sha256=?
        AND object_key=? AND public_sha256 IS NULL
        AND EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
          ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND
          e.owner_run_id=? AND e.owner_lease_id=? AND
          e.state IN ('active','quiescing') AND l.run_id=? AND
          l.state IN ('active','quiescing'))`)
      .bind(publicSha,sharedTestProofUrl(row.proof_id),at.toISOString(),
        row.proof_id,row.run_id,row.lease_id,row.source_sha256,row.object_key,
        row.run_id,row.lease_id,row.run_id).run();
    if(updated.meta.changes!==1)
      throw new Error('test_showboat_projection_fenced');
    return 'projected';
  }
}
