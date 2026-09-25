export interface SharedTestQueueBody {
  kind:'shared_test_delivery';
  delivery_id:string;
  run_id:string;
  lease_id:string;
  expectation_id:string;
  work_id:string;
}

function validBody(value:unknown):value is SharedTestQueueBody {
  if (!value || typeof value!=='object') return false;
  const body=value as Record<string,unknown>;
  return body.kind==='shared_test_delivery' &&
    ['delivery_id','run_id','lease_id','expectation_id','work_id']
      .every(key=>typeof body[key]==='string' && (body[key] as string).length>0);
}

interface ClaimedDelivery {
  delivery_id:string;
  run_id:string;
  lease_id:string;
  expectation_id:string;
  queue_work_id:string;
  state:string;
  claim_token:string|null;
  task_id:string;
  team_id:string;
  provider_time_ms:number;
  candidate_commit:string;
  patch_sha256:string;
  repository:string;
  pull_request_number:number|null;
  base_manifest_id:string;
  base_traffic_revision:string;
  manifest_revision:number;
}

export async function processSharedTestDelivery(db:D1Database,raw:unknown,at=new Date()):Promise<void> {
  if (!validBody(raw)) throw new Error('invalid_shared_test_queue_body');
  const body=raw;
  const token=crypto.randomUUID(),now=at.toISOString();
  const due=new Date(at.getTime()+120_000).toISOString();
  const claim=await db.prepare(`UPDATE test_delivery_dispatch SET state='claimed',
    claim_token=?,claim_due_at=?,updated_at=? WHERE delivery_id=? AND run_id=?
    AND lease_id=? AND expectation_id=? AND queue_work_id=?
    AND (state='pending' OR (state='claimed' AND claim_due_at<=?))
    AND EXISTS (SELECT 1 FROM test_provider_deliveries p WHERE p.delivery_id=?
      AND p.route='test' AND p.run_id=? AND p.lease_id=? AND p.expectation_id=?)`)
    .bind(token,due,now,body.delivery_id,body.run_id,body.lease_id,
      body.expectation_id,body.work_id,now,body.delivery_id,body.run_id,
      body.lease_id,body.expectation_id).run();
  if (claim.meta.changes!==1) {
    const prior=await db.prepare(`SELECT state FROM test_delivery_dispatch
      WHERE delivery_id=? AND run_id=? AND lease_id=? AND expectation_id=?
        AND queue_work_id=?`).bind(body.delivery_id,body.run_id,body.lease_id,
          body.expectation_id,body.work_id).first<{state:string}>();
    if (prior?.state==='done' || prior?.state==='claimed') return;
    throw new Error('shared_test_queue_claim_missing');
  }
  const row=await db.prepare(`SELECT d.delivery_id,d.run_id,d.lease_id,d.expectation_id,
    d.queue_work_id,d.state,d.claim_token,p.task_id,p.team_id,p.provider_time_ms,
    l.candidate_commit,l.patch_sha256,l.repository,l.pull_request_number,
    l.base_manifest_id,l.base_traffic_revision,m.revision AS manifest_revision
    FROM test_delivery_dispatch d JOIN test_provider_deliveries p
      ON p.delivery_id=d.delivery_id AND p.route='test'
    JOIN test_expected_events x ON x.expectation_id=d.expectation_id
      AND x.claimed_delivery_id=d.delivery_id AND x.state='claimed'
    JOIN test_leases l ON l.lease_id=d.lease_id AND l.run_id=d.run_id
      AND l.task_id=p.task_id AND l.team_id=p.team_id
    JOIN staging_release_manifests m ON m.manifest_id=l.base_manifest_id
    WHERE d.delivery_id=? AND d.claim_token=? AND d.state='claimed'`)
    .bind(body.delivery_id,token).first<ClaimedDelivery>();
  if (!row || row.queue_work_id!==body.work_id || row.expectation_id!==body.expectation_id ||
      row.run_id!==body.run_id || row.lease_id!==body.lease_id ||
      !row.pull_request_number)
    throw new Error('shared_test_queue_scope_mismatch');
  const result=JSON.stringify({kind:'provider_event_observed',deliveryId:row.delivery_id,
    taskId:row.task_id,teamId:row.team_id,runId:row.run_id,leaseId:row.lease_id,
    candidateCommit:row.candidate_commit,patchSha256:row.patch_sha256,
    repository:row.repository,pullRequestNumber:row.pull_request_number,
    baseManifestId:row.base_manifest_id,baseTrafficRevision:row.base_traffic_revision,
    providerTimeMs:row.provider_time_ms});
  const attestId=`test-attestation:${row.lease_id}`;
  const results=await db.batch([
    db.prepare(`INSERT OR IGNORE INTO test_attestations
      (attestation_id,task_id,run_id,lease_id,repository,candidate_commit,
       patch_sha256,manifest_id,manifest_revision,pull_request_number,
       base_manifest_id,state,observed_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,'observed',? WHERE EXISTS
        (SELECT 1 FROM test_delivery_dispatch WHERE delivery_id=?
          AND state='claimed' AND claim_token=?)`)
      .bind(attestId,row.task_id,row.run_id,row.lease_id,row.repository,
        row.candidate_commit,row.patch_sha256,row.base_manifest_id,row.manifest_revision,
        row.pull_request_number,row.base_manifest_id,now,row.delivery_id,token),
    db.prepare(`UPDATE test_provider_deliveries SET result_json=? WHERE delivery_id=?
      AND route='test' AND run_id=? AND lease_id=? AND expectation_id=?`)
      .bind(result,row.delivery_id,row.run_id,row.lease_id,row.expectation_id),
    db.prepare(`UPDATE test_delivery_dispatch SET state='done',result_json=?,
      claim_token=NULL,claim_due_at=NULL,updated_at=? WHERE delivery_id=?
      AND state='claimed' AND claim_token=?`)
      .bind(result,now,row.delivery_id,token),
  ]);
  if (results[1].meta.changes!==1 || results[2].meta.changes!==1)
    throw new Error('shared_test_queue_result_incomplete');
}

export async function processSharedTestBatch(batch:MessageBatch<unknown>,db:D1Database):Promise<void> {
  for (const message of batch.messages) await processSharedTestDelivery(db,message.body);
}
