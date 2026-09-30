import {SharedTestCloseStore,requiredProofKinds} from './shared-test-close.ts';

interface ReadyOwner {run_id:string;lease_id:string;fence:number;}

/** Stop lease writes only after the completed demo and first proof readback. */
export class SharedTestQuiesceDriver {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async resume():Promise<'idle'|'quiesced'> {
    const kinds=requiredProofKinds.map(()=>'?').join(',');
    const row=await this.db.prepare(`SELECT l.run_id,l.lease_id,l.fence
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN agent_attempts a ON a.attempt_id=l.attempt_id
        AND a.run_id=l.run_id AND a.node_id='shared_test_demo'
      JOIN test_attestations t ON t.lease_id=l.lease_id AND t.run_id=l.run_id
      WHERE e.site_id=1 AND e.state='active' AND e.owner_run_id=l.run_id
        AND e.fence=l.fence AND l.state='active'
        AND a.state='completed' AND a.cleanup_state='destroyed'
        AND t.state='observed'
        AND EXISTS (SELECT 1 FROM test_provider_deliveries p
          JOIN test_delivery_dispatch d ON d.delivery_id=p.delivery_id
          WHERE p.lease_id=l.lease_id AND p.run_id=l.run_id
            AND p.route='test' AND p.classification='accepted'
            AND d.state='done')
        AND NOT EXISTS (SELECT 1 FROM test_delivery_dispatch d
          WHERE d.lease_id=l.lease_id AND d.state<>'done')
        AND (SELECT COUNT(DISTINCT p.kind) FROM test_proof_items p
          WHERE p.lease_id=l.lease_id AND p.run_id=l.run_id
            AND p.phase='first' AND p.kind IN (${kinds})
            AND p.classification='public_safe'
            AND p.sanitizer_result='passed'
            AND p.public_sha256 IS NOT NULL AND p.public_url IS NOT NULL
            AND p.body_marker IS NOT NULL AND p.read_at IS NOT NULL
            AND p.projected_at IS NOT NULL)=?
      LIMIT 1`).bind(...requiredProofKinds,requiredProofKinds.length)
      .first<ReadyOwner>();
    if(!row)return 'idle';
    await new SharedTestCloseStore(this.db).quiesce(row.run_id,row.lease_id,
      row.fence);
    return 'quiesced';
  }
}
