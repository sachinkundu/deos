import {sha256Hex} from './implementation-hash.ts';
import {sharedTestAffectedServices,sharedTestCandidateReady} from './shared-test-candidate-ready.ts';
import {sharedTestProofUrl} from './shared-test-proof-url.ts';

type StructuredKind='d1_read'|'provider_receipt'|'github_receipt';
interface Lease {
  run_id:string;lease_id:string;task_id:string;task_key:string;
  task_title:string;team_id:string;repository:string;branch:string;
  pull_request_number:number;
  candidate_commit:string;patch_sha256:string;fence:number;state:string;
  base_manifest_id:string;base_traffic_revision:string;base_json:string;
}
interface Delivery {
  delivery_id:string;payload_sha256:string;provider_time_ms:number;
  classification:string;route:string;received_at:string;result_json:string|null;
  dispatch_state:string;
}
interface Service {
  service_name:string;candidate_commit:string;running_version_id:string;
  first_read_at:string;second_read_at:string;fence:number;
}
interface Existing {
  proof_id:string;source_sha256:string;public_sha256:string|null;
  classification:string;sanitizer_result:string|null;public_url:string|null;
}

/** Fixed-field receipts omit raw IDs and provider replies from public JSON. */
export class SharedTestStructuredProofStore {
  readonly db:D1Database;
  readonly bucket:R2Bucket;
  constructor(db:D1Database,bucket:R2Bucket) {this.db=db;this.bucket=bucket;}

  private async lease(runId:string,leaseId:string):Promise<Lease> {
    const row=await this.db.prepare(`SELECT l.run_id,l.lease_id,l.task_id,
      l.task_key,l.task_title,l.team_id,l.repository,l.branch,l.pull_request_number,
      l.candidate_commit,l.patch_sha256,l.fence,l.state,l.base_manifest_id,
      l.base_traffic_revision,l.base_json FROM test_leases l
      JOIN test_environment e ON e.owner_lease_id=l.lease_id
      WHERE l.run_id=? AND l.lease_id=? AND e.owner_run_id=?
        AND e.state IN ('active','quiescing')`)
      .bind(runId,leaseId,runId).first<Lease>();
    if(!row || !/^[A-Z]+-\d+$/.test(row.task_key) ||
        !/^[a-f0-9]{40}$/.test(row.candidate_commit))
      throw new Error('test_structured_proof_lease_missing');
    return row;
  }

  private async save(kind:StructuredKind,lease:Lease,raw:unknown,safe:unknown,
    at=new Date()):Promise<string> {
    const rawText=JSON.stringify(raw),safeText=JSON.stringify(safe);
    const sourceSha=await sha256Hex(rawText),publicSha=await sha256Hex(safeText);
    if(sourceSha===publicSha || rawText.length>100_000 || safeText.length>20_000)
      throw new Error('test_structured_proof_content_invalid');
    const prior=await this.db.prepare(`SELECT proof_id,source_sha256,public_sha256,
      classification,sanitizer_result,public_url FROM test_proof_items
      WHERE run_id=? AND lease_id=? AND phase='first' AND kind=?`)
      .bind(lease.run_id,lease.lease_id,kind).first<Existing>();
    if(prior) {
      if(prior.source_sha256!==sourceSha || prior.public_sha256!==publicSha ||
          prior.classification!=='public_safe' ||
          prior.sanitizer_result!=='passed' ||
          prior.public_url!==sharedTestProofUrl(prior.proof_id))
        throw new Error('test_structured_proof_changed');
      return prior.proof_id;
    }
    const proofId=crypto.randomUUID();
    const root=`shared-test`,leaseKey=encodeURIComponent(lease.lease_id);
    const rawKey=`${root}/raw/${leaseKey}/${proofId}.json`;
    const publicKey=`${root}/public/${leaseKey}/${proofId}.json`;
    const rawSaved=await this.bucket.put(rawKey,rawText,{
      onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/json'},
      customMetadata:{sha256:sourceSha,evidenceClass:'private-capture'}});
    const rawRead=await this.bucket.get(rawKey);
    if(!rawSaved || !rawRead || await sha256Hex(await rawRead.text())!==sourceSha)
      throw new Error('test_structured_proof_raw_readback_failed');
    const safeSaved=await this.bucket.put(publicKey,safeText,{
      onlyIf:{etagDoesNotMatch:'*'},
      httpMetadata:{contentType:'application/json'},
      customMetadata:{sha256:publicSha,evidenceClass:'public-safe'}});
    const safeRead=await this.bucket.get(publicKey);
    if(!safeSaved || !safeRead || await sha256Hex(await safeRead.text())!==publicSha)
      throw new Error('test_structured_proof_public_readback_failed');
    const now=at.toISOString();
    const inserted=await this.db.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
       capture_recipe,sanitizer_version,sanitizer_result,source_sha256,
       object_key,content_type,byte_count,public_sha256,public_url,projected_at)
      SELECT ?,?,?,'first',?,'public_safe','public',?,
        'structured-allowlist-v1','passed',?,?,'application/json',?,?,?,?
      WHERE EXISTS (SELECT 1 FROM test_environment e JOIN test_leases l
        ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND
          e.owner_run_id=? AND e.owner_lease_id=? AND
          e.state IN ('active','quiescing') AND l.run_id=? AND l.state IN
          ('active','quiescing'))`)
      .bind(proofId,lease.run_id,lease.lease_id,kind,
        JSON.stringify({version:1,kind}),sourceSha,rawKey,
        new TextEncoder().encode(rawText).byteLength,publicSha,
        sharedTestProofUrl(proofId),now,lease.run_id,lease.lease_id,
        lease.run_id).run();
    if(inserted.meta.changes!==1)
      throw new Error('test_structured_proof_write_fenced');
    return proofId;
  }

  async saveD1Read(runId:string,leaseId:string,
    at=new Date()):Promise<string> {
    const lease=await this.lease(runId,leaseId);
    const affected=await sharedTestAffectedServices(this.db,lease);
    const names=new Set(affected.map(plan=>plan.serviceName));
    const services=(await this.db.prepare(`SELECT service_name,candidate_commit,
      running_version_id,first_read_at,second_read_at,fence
      FROM test_candidate_service_readbacks WHERE lease_id=?
      ORDER BY service_name`).bind(leaseId).all<Service>()).results;
    const selected=services.filter(service=>names.has(service.service_name));
    const sourceFence=selected[0]?.fence;
    if(selected.length!==names.size || selected.some(service=>
        service.candidate_commit!==lease.candidate_commit ||
        !service.first_read_at || !service.second_read_at ||
        service.fence!==sourceFence) || !Number.isSafeInteger(sourceFence))
      throw new Error('test_d1_proof_candidate_readback_missing');
    if(lease.state==='active' ? sourceFence!==lease.fence :
        lease.state!=='quiescing' || sourceFence>=lease.fence ||
        !(await this.db.prepare(`SELECT 1 AS found FROM test_lease_fence_epochs
          WHERE lease_id=? AND run_id=? AND fence=?`)
          .bind(leaseId,runId,sourceFence).first<{found:number}>()))
      throw new Error('test_d1_proof_candidate_fence_invalid');
    if(!await sharedTestCandidateReady(this.db,{...lease,fence:sourceFence}))
      throw new Error('test_d1_proof_candidate_readback_missing');
    const delivery=await this.delivery(lease);
    const raw={lease,services:selected,delivery};
    const safe={version:1,source:'DEOS D1 readback',task:lease.task_key,
      title:lease.task_title,candidateCommit:lease.candidate_commit,
      baseManifest:lease.base_manifest_id,
      services:selected.map(item=>({service:item.service_name,
        runningVersion:item.running_version_id,
        firstReadAt:item.first_read_at,secondReadAt:item.second_read_at})),
      providerDelivery:'test route, completed'};
    return this.save('d1_read',lease,raw,safe,at);
  }

  private async delivery(lease:Lease):Promise<Delivery> {
    const rows=(await this.db.prepare(`SELECT p.delivery_id,p.payload_sha256,
      p.provider_time_ms,p.classification,p.route,p.received_at,p.result_json,
      d.state AS dispatch_state FROM test_provider_deliveries p
      JOIN test_delivery_dispatch d ON d.delivery_id=p.delivery_id
      JOIN test_expected_events x ON x.expectation_id=p.expectation_id
        AND x.run_id=p.run_id AND x.lease_id=p.lease_id
        AND x.task_id=p.task_id AND x.team_id=p.team_id
        AND x.claimed_delivery_id=p.delivery_id
      WHERE p.run_id=? AND p.lease_id=? AND p.route='test'
        AND p.task_id=? AND p.team_id=?
        AND p.provider_time_ms BETWEEN x.valid_from_ms AND x.valid_until_ms
        AND x.kind='Issue' AND x.action='update'
        AND d.run_id=? AND d.lease_id=?
        AND d.expectation_id=x.expectation_id AND d.state='done'
      ORDER BY p.received_at,p.delivery_id`)
      .bind(lease.run_id,lease.lease_id,lease.task_id,lease.team_id,
        lease.run_id,lease.lease_id).all<Delivery>()).results;
    if(rows.length!==1)throw new Error('test_provider_proof_delivery_missing_or_duplicate');
    if(rows[0].classification!=='accepted' ||
        !Number.isSafeInteger(rows[0].provider_time_ms) ||
        rows[0].provider_time_ms<=0)
      throw new Error('test_provider_proof_delivery_invalid');
    return rows[0];
  }

  async saveProviderReceipt(runId:string,leaseId:string,
    at=new Date()):Promise<string> {
    const lease=await this.lease(runId,leaseId);
    const delivery=await this.delivery(lease);
    const safe={version:1,source:'Linear signed webhook',task:lease.task_key,
      classification:delivery.classification,route:delivery.route,
      dispatch:delivery.dispatch_state,
      providerTimeMs:delivery.provider_time_ms,
      receivedAt:delivery.received_at};
    return this.save('provider_receipt',lease,{lease,delivery},safe,at);
  }

  async saveGitHubReceipt(runId:string,leaseId:string,
    pull:{number:number;state:string;draft?:boolean;head:{sha:string;ref:string};
      base:{ref:string;repo:{full_name:string}}},at=new Date()):Promise<string> {
    const lease=await this.lease(runId,leaseId);
    if(pull.number!==lease.pull_request_number || pull.state!=='open' ||
        !pull.draft || pull.head.sha!==lease.candidate_commit ||
        pull.head.ref!==lease.branch ||
        pull.base.repo.full_name!==lease.repository || pull.base.ref!=='main')
      throw new Error('test_github_proof_pull_changed');
    const safe={version:1,source:'GitHub PR readback',
      repository:lease.repository,pullRequest:pull.number,
      candidateCommit:pull.head.sha,branch:pull.head.ref,
      baseBranch:pull.base.ref,state:pull.state,draft:pull.draft};
    const checkedPull={number:pull.number,state:pull.state,draft:pull.draft,
      head:{sha:pull.head.sha,ref:pull.head.ref},
      base:{ref:pull.base.ref,repo:{full_name:pull.base.repo.full_name}}};
    return this.save('github_receipt',lease,{lease,pull:checkedPull},safe,at);
  }
}
