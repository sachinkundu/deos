import {sha256Hex} from './implementation-hash.ts';
import {SharedTestPrBodyWriter} from './shared-test-pr-body.ts';

interface ReportClosure {
  lease_id:string;
  run_id:string;
  close_revision:number;
  cleanup_sha256:string;
  absence_sha256:string;
  receipt_json:string;
  report_state:'pending'|'complete';
  report_object_key:string|null;
  report_sha256:string|null;
  report_url:string|null;
}

interface ReportLease {
  task_key:string;
  task_title:string;
  repository:string;
  pull_request_number:number;
  candidate_commit:string;
  base_manifest_id:string;
}

interface ReportProof {kind:string;public_url:string;public_sha256:string;}

export class SharedTestReportStore {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  readonly bodyWriter:SharedTestPrBodyWriter;
  constructor(db:D1Database,bucket:R2Bucket,bodyWriter:SharedTestPrBodyWriter) {
    this.db=db;this.bucket=bucket;this.bodyWriter=bodyWriter;
  }

  async publish(runId:string,leaseId:string,at=new Date()):Promise<string> {
    const closure=await this.db.prepare(`SELECT * FROM test_lease_closures
      WHERE run_id=? AND lease_id=?`).bind(runId,leaseId).first<ReportClosure>();
    const lease=await this.db.prepare(`SELECT task_key,task_title,repository,
      pull_request_number,candidate_commit,base_manifest_id FROM test_leases
      WHERE run_id=? AND lease_id=? AND state='closed'`)
      .bind(runId,leaseId).first<ReportLease>();
    if (!closure || !lease?.pull_request_number) throw new Error('test_report_close_missing');
    const proof=(await this.db.prepare(`SELECT kind,public_url,public_sha256
      FROM test_proof_items WHERE run_id=? AND lease_id=? AND classification='public_safe'
        AND sanitizer_result='passed' AND public_url IS NOT NULL
      ORDER BY kind,proof_id`).bind(runId,leaseId).all<ReportProof>()).results;
    const reportUrl=`https://test-deos.voxdez.com/reports/${encodeURIComponent(leaseId)}`;
    const key=`shared-test/reports/${encodeURIComponent(leaseId)}/close.json`;
    const report={version:1,task:{key:lease.task_key,title:lease.task_title},
      runId,leaseId,repository:lease.repository,pullRequestNumber:lease.pull_request_number,
      candidateCommit:lease.candidate_commit,baseManifestId:lease.base_manifest_id,
      closeRevision:closure.close_revision,cleanupSha256:closure.cleanup_sha256,
      absenceSha256:closure.absence_sha256,proof};
    const serialized=JSON.stringify(report);
    const hash=await sha256Hex(serialized);
    if (closure.report_object_key && (closure.report_object_key!==key ||
        closure.report_sha256!==hash || closure.report_url!==reportUrl))
      throw new Error('test_report_identity_conflict');
    await this.bucket.put(key,serialized,{onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/json'}});
    const saved=await this.bucket.get(key);
    if (!saved || await sha256Hex(await saved.text())!==hash)
      throw new Error('test_report_readback_failed');
    await this.db.prepare(`UPDATE test_lease_closures SET report_object_key=?,
      report_sha256=?,report_url=? WHERE lease_id=? AND run_id=? AND report_state='pending'
      AND (report_object_key IS NULL OR (report_object_key=? AND report_sha256=?
        AND report_url=?))`)
      .bind(key,hash,reportUrl,leaseId,runId,key,hash,reportUrl).run();
    const bodySection=[`### ${lease.task_key} shared test proof`,
      `${lease.task_title} passed the shared test and closed at revision ${closure.close_revision}.`,
      ...proof.map(item=>`- [${item.kind}](${item.public_url})`),
      `- [Final close report](${reportUrl})`].join('\n');
    await this.bodyWriter.writeSection({repository:lease.repository,
      pullRequestNumber:lease.pull_request_number,workId:`test-report:${leaseId}`,
      runId,leaseId,marker:`deos-test-proof:${leaseId}`,section:bodySection},at);
    const completed=await this.db.prepare(`UPDATE test_lease_closures SET report_state='complete',
      body_read_at=? WHERE lease_id=? AND run_id=? AND report_object_key=?
      AND report_sha256=? AND report_url=? AND report_state='pending'`)
      .bind(at.toISOString(),leaseId,runId,key,hash,reportUrl).run();
    if (completed.meta.changes!==1 && closure.report_state!=='complete')
      throw new Error('test_report_completion_race');
    return reportUrl;
  }
}
