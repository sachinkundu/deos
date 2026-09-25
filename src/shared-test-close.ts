import {sha256Hex} from './implementation-hash.ts';

const requiredProofKinds=['app_screen','linear_screen','showboat','d1_read',
  'provider_receipt','github_receipt'] as const;

interface OwnerRow {
  state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
  revision:number;
}

export class SharedTestCloseStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  private async owner(runId:string,leaseId:string):Promise<OwnerRow> {
    const row=await this.db.prepare(`SELECT state,owner_run_id,owner_lease_id,fence,revision
      FROM test_environment WHERE site_id=1`).first<OwnerRow>();
    if (!row || row.owner_run_id!==runId || row.owner_lease_id!==leaseId)
      throw new Error('shared_test_close_owner_mismatch');
    return row;
  }

  async quiesce(runId:string,leaseId:string,fence:number,at=new Date()):Promise<number> {
    const env=await this.owner(runId,leaseId);
    if (env.state==='quiescing' || env.state==='cleaning') return env.fence;
    if (!['preparing','active'].includes(env.state) || env.fence!==fence)
      throw new Error('shared_test_quiesce_fenced');
    const now=at.toISOString();
    const results=await this.db.batch([
      this.db.prepare(`UPDATE test_environment SET saved_phase=state,state='quiescing',
        fence=fence+1,heartbeat_due_at=NULL,cleanup_driver='workflow',
        revision=revision+1,updated_at=? WHERE site_id=1 AND state IN ('preparing','active')
          AND owner_run_id=? AND owner_lease_id=? AND fence=? AND revision=?`)
        .bind(now,runId,leaseId,fence,env.revision),
      this.db.prepare(`UPDATE test_leases SET state='quiescing' WHERE lease_id=? AND run_id=?
        AND state IN ('preparing','active') AND EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='quiescing' AND owner_lease_id=? AND fence=?)`)
        .bind(leaseId,runId,leaseId,fence+1),
      this.db.prepare(`INSERT OR IGNORE INTO test_lease_fence_epochs
        (lease_id,fence,run_id,reason,transition_revision,created_at)
        SELECT ?,e.fence,?,'normal_quiesce',e.revision,? FROM test_environment e
        WHERE e.site_id=1 AND e.state='quiescing' AND e.owner_lease_id=? AND e.fence=?`)
        .bind(leaseId,runId,now,leaseId,fence+1),
      this.db.prepare(`UPDATE test_expected_events SET state='disabled' WHERE lease_id=?
        AND run_id=? AND state IN ('planned','live','claimed')`).bind(leaseId,runId),
      this.db.prepare(`UPDATE test_app_sessions SET revoked_at=? WHERE lease_id=?
        AND run_id=? AND revoked_at IS NULL`).bind(now,leaseId,runId),
    ]);
    if (results[0].meta.changes!==1 || results[1].meta.changes!==1 ||
        results[2].meta.changes!==1)
      throw new Error('shared_test_quiesce_write_incomplete');
    return fence+1;
  }

  async cleaning(runId:string,leaseId:string,fence:number,at=new Date()):Promise<void> {
    const result=await this.db.batch([
      this.db.prepare(`UPDATE test_environment SET state='cleaning',saved_phase='cleaning',
        revision=revision+1,updated_at=? WHERE site_id=1 AND state='quiescing'
        AND owner_run_id=? AND owner_lease_id=? AND fence=?
        AND NOT EXISTS (SELECT 1 FROM test_delivery_dispatch WHERE lease_id=? AND state<>'done')
        AND NOT EXISTS (SELECT 1 FROM test_expected_events WHERE lease_id=? AND state<>'disabled')
        AND NOT EXISTS (SELECT 1 FROM test_operations WHERE lease_id=?
          AND kind='linear_marker_remove' AND state<>'done')
        AND EXISTS (SELECT 1 FROM test_proof_items WHERE lease_id=?
          AND body_marker IS NOT NULL AND read_at IS NOT NULL AND projected_at IS NOT NULL)`)
        .bind(at.toISOString(),runId,leaseId,fence,leaseId,leaseId,leaseId,leaseId),
      this.db.prepare(`UPDATE test_leases SET state='cleaning' WHERE lease_id=? AND run_id=?
        AND state='quiescing' AND EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='cleaning' AND owner_lease_id=? AND fence=?)`)
        .bind(leaseId,runId,leaseId,fence),
    ]);
    if (result[0].meta.changes!==1 || result[1].meta.changes!==1)
      throw new Error('shared_test_cleaning_not_ready');
  }

  async close(runId:string,leaseId:string,fence:number,at=new Date()):Promise<{
    leaseId:string;runId:string;closeRevision:number;cleanupSha256:string;absenceSha256:string}> {
    const prior=await this.db.prepare(`SELECT receipt_json FROM test_lease_closures
      WHERE lease_id=? AND run_id=?`).bind(leaseId,runId).first<{receipt_json:string}>();
    if (prior) return JSON.parse(prior.receipt_json);
    const env=await this.owner(runId,leaseId);
    if (env.state!=='cleaning' || env.fence!==fence)
      throw new Error('shared_test_close_not_cleaning');
    const resources=(await this.db.prepare(`SELECT resource_id,kind,provider_key,plan_state,
      absent_at FROM test_resources WHERE lease_id=? AND run_id=? ORDER BY resource_id`)
      .bind(leaseId,runId).all<Record<string,unknown>>()).results;
    const checks=(await this.db.prepare(`SELECT resource_id,remove_work_id,remove_state,
      read_state FROM test_cleanup_checks WHERE lease_id=? ORDER BY resource_id`)
      .bind(leaseId).all<Record<string,unknown>>()).results;
    const cleanupSha256=await sha256Hex(JSON.stringify(resources));
    const absenceSha256=await sha256Hex(JSON.stringify(checks));
    const closeRevision=env.revision+1,now=at.toISOString();
    const receipt={leaseId,runId,closeRevision,cleanupSha256,absenceSha256};
    const attestation=await this.db.prepare(`SELECT attestation_id FROM test_attestations
      WHERE run_id=? AND lease_id=? AND state='observed'`)
      .bind(runId,leaseId).first<{attestation_id:string}>();
    if (!attestation) throw new Error('shared_test_close_attestation_missing');
    const proofSql=requiredProofKinds.map(()=>'?').join(',');
    const proofRows=(await this.db.prepare(`SELECT DISTINCT kind FROM test_proof_items
      WHERE lease_id=? AND kind IN (${proofSql}) AND classification='public_safe'
        AND sanitizer_result='passed' AND public_sha256 IS NOT NULL
        AND public_url IS NOT NULL AND body_marker IS NOT NULL
        AND read_at IS NOT NULL AND projected_at IS NOT NULL`)
      .bind(leaseId,...requiredProofKinds).all<{kind:string}>()).results;
    if (proofRows.length!==requiredProofKinds.length) throw new Error('shared_test_close_proof_missing');
    const ready=await this.db.prepare(`SELECT 1 AS ready FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id
      WHERE e.site_id=1 AND e.state='cleaning' AND e.owner_run_id=?
        AND e.owner_lease_id=? AND e.fence=? AND e.revision=?
        AND l.run_id=? AND l.state='cleaning'
        AND EXISTS (SELECT 1 FROM test_provider_deliveries p
          JOIN test_delivery_dispatch d ON d.delivery_id=p.delivery_id
          WHERE p.lease_id=? AND p.run_id=? AND p.route='test' AND d.state='done')
        AND NOT EXISTS (SELECT 1 FROM test_delivery_dispatch
          WHERE lease_id=? AND state<>'done')
        AND NOT EXISTS (SELECT 1 FROM test_expected_events
          WHERE lease_id=? AND state<>'disabled')
        AND NOT EXISTS (SELECT 1 FROM test_operations
          WHERE lease_id=? AND state NOT IN ('done','absent'))
        AND NOT EXISTS (SELECT 1 FROM test_resources r WHERE r.lease_id=?
          AND (r.plan_state<>'absent' OR r.absent_at IS NULL OR NOT EXISTS
            (SELECT 1 FROM test_cleanup_checks c WHERE c.lease_id=r.lease_id
              AND c.resource_id=r.resource_id AND c.remove_state='done'
              AND c.read_state='absent')))
        AND NOT EXISTS (SELECT 1 FROM test_app_sessions
          WHERE lease_id=? AND revoked_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_access_identities
          WHERE lease_id=? AND absent_at IS NULL)`)
      .bind(runId,leaseId,fence,env.revision,runId,leaseId,runId,leaseId,
        leaseId,leaseId,leaseId,leaseId,leaseId).first<{ready:number}>();
    if (ready?.ready!==1) throw new Error('shared_test_close_absence_missing');
    const results=await this.db.batch([
      this.db.prepare(`UPDATE test_environment SET state='free',saved_phase=NULL,
        owner_run_id=NULL,owner_lease_id=NULL,heartbeat_due_at=NULL,
        cleanup_driver=NULL,hold_reason=NULL,last_lease_id=?,revision=revision+1,
        updated_at=? WHERE site_id=1 AND state='cleaning' AND owner_run_id=?
        AND owner_lease_id=? AND fence=? AND revision=?`)
        .bind(leaseId,now,runId,leaseId,fence,env.revision),
      this.db.prepare(`UPDATE test_leases SET state='closed',closed_at=?
        WHERE lease_id=? AND run_id=? AND state='cleaning'
        AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='free' AND last_lease_id=?)`)
        .bind(now,leaseId,runId,leaseId),
      this.db.prepare(`UPDATE test_attestations SET state='complete',completed_at=?,
        close_revision=? WHERE attestation_id=? AND run_id=? AND lease_id=?
        AND state='observed' AND EXISTS (SELECT 1 FROM test_leases WHERE lease_id=?
          AND state='closed')`)
        .bind(now,closeRevision,attestation.attestation_id,runId,leaseId,leaseId),
      this.db.prepare(`INSERT INTO test_lease_closures
        (lease_id,run_id,close_revision,attestation_id,cleanup_sha256,
         absence_sha256,committed_at,receipt_json,report_state)
        SELECT ?,?,?,?,?,?,?,?,'pending' WHERE EXISTS (SELECT 1 FROM test_attestations
          WHERE attestation_id=? AND state='complete' AND close_revision=?)`)
        .bind(leaseId,runId,closeRevision,attestation.attestation_id,cleanupSha256,
          absenceSha256,now,JSON.stringify(receipt),attestation.attestation_id,closeRevision),
    ]);
    if (results.some(result=>result.meta.changes!==1))
      throw new Error('shared_test_close_transaction_incomplete');
    return receipt;
  }
}
