import {requiredProofKinds} from './shared-test-close.ts';
import {SharedTestPrBodyWriter} from './shared-test-pr-body.ts';
import {sharedTestProofOrigin,sharedTestProofUrl} from './shared-test-proof-url.ts';

interface ProofRow {
  proof_id:string;kind:string;public_sha256:string;public_url:string;
  content_type:string;body_marker:string|null;read_at:string|null;
}
interface LeaseRow {
  run_id:string;lease_id:string;task_key:string;repository:string;
  branch:string;pull_request_number:number;candidate_commit:string;
}

async function sha256(bytes:Uint8Array):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0'))
    .join('');
}

/** First-set PR proof must be attached and read back before any owned delete. */
export class SharedTestFirstProofPublisher {
  readonly db:D1Database;
  readonly writer:SharedTestPrBodyWriter;
  readonly fetcher:typeof fetch;
  constructor(db:D1Database,writer:SharedTestPrBodyWriter,
    fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.db=db;this.writer=writer;this.fetcher=fetcher;
  }

  async publish(runId:string,leaseId:string,at=new Date()):Promise<void> {
    const lease=await this.db.prepare(`SELECT l.run_id,l.lease_id,l.task_key,
      l.repository,l.branch,l.pull_request_number,l.candidate_commit
      FROM test_leases l JOIN test_environment e ON e.owner_lease_id=l.lease_id
      WHERE l.run_id=? AND l.lease_id=? AND e.owner_run_id=?
        AND e.state IN ('active','quiescing')`)
      .bind(runId,leaseId,runId).first<LeaseRow>();
    if(!lease?.pull_request_number || !/^[A-Z]+-\d+$/.test(lease.task_key))
      throw new Error('test_first_proof_lease_missing');
    const items=(await this.db.prepare(`SELECT proof_id,kind,public_sha256,
      public_url,content_type,body_marker,read_at FROM test_proof_items
      WHERE run_id=? AND lease_id=? AND phase='first'
        AND classification='public_safe' AND sanitizer_result='passed'
        AND public_sha256 IS NOT NULL AND public_url IS NOT NULL
      ORDER BY kind,proof_id`).bind(runId,leaseId).all<ProofRow>()).results;
    const selected:ProofRow[]=[];
    for(const kind of requiredProofKinds) {
      const matches=items.filter(item=>item.kind===kind);
      if(matches.length!==1)throw new Error(`test_first_proof_${kind}_missing_or_duplicate`);
      const item=matches[0];
      if(item.public_url!==sharedTestProofUrl(item.proof_id) ||
          new URL(item.public_url).origin!==sharedTestProofOrigin ||
          !/^[a-f0-9]{64}$/.test(item.public_sha256))
        throw new Error('test_first_proof_link_invalid');
      selected.push(item);
    }
    const marker=`deos-test-proof:${leaseId}`;
    const section=[`### ${lease.task_key} shared test proof`,
      ...selected.map(item=>['app_screen','linear_screen'].includes(item.kind)
        ? `![${item.kind}](${item.public_url})`
        : `- [${item.kind}](${item.public_url})`),
      'Close report: pending.'].join('\n');
    await this.writer.writeSection({repository:lease.repository,
      pullRequestNumber:lease.pull_request_number,workId:`test-first-proof:${leaseId}`,
      runId,leaseId,marker,section},at);
    // A PR body link is not proof that its target exists. Fetch the same public
    // URL a reviewer sees, without Access or provider credentials.
    for(const item of selected) {
      const response=await this.fetcher(item.public_url,{method:'GET',
        redirect:'manual',signal:AbortSignal.timeout(20_000)});
      if(!response.ok || response.status!==200)
        throw new Error(`test_first_proof_http_${item.kind}_${response.status}`);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(await sha256(bytes)!==item.public_sha256)
        throw new Error(`test_first_proof_hash_${item.kind}`);
      const result=await this.db.prepare(`UPDATE test_proof_items SET body_marker=?,
        read_at=? WHERE proof_id=? AND run_id=? AND lease_id=?
          AND kind=? AND classification='public_safe'
          AND sanitizer_result='passed' AND public_sha256=? AND public_url=?
          AND (body_marker IS NULL OR body_marker=?)`)
        .bind(marker,at.toISOString(),item.proof_id,runId,leaseId,item.kind,
          item.public_sha256,item.public_url,marker).run();
      if(result.meta.changes!==1)
        throw new Error(`test_first_proof_readback_write_${item.kind}`);
    }
  }
}
