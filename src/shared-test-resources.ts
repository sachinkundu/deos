export interface SharedTestResourcePlan {
  resourceId:string;
  runId:string;
  leaseId:string;
  fence:number;
  kind:string;
  providerKey:string;
  workId:string;
}

interface ResourceRow {
  resource_id:string;
  run_id:string;
  lease_id:string;
  create_fence:number;
  kind:string;
  plan_state:'planned'|'creating'|'created'|'uncertain'|'absent';
  provider_key:string;
  remote_id:string|null;
  work_id:string;
  recovery_ref:string|null;
}

function samePlan(row:ResourceRow,plan:SharedTestResourcePlan):boolean {
  return row.resource_id===plan.resourceId && row.run_id===plan.runId &&
    row.lease_id===plan.leaseId && row.create_fence===plan.fence &&
    row.kind===plan.kind && row.provider_key===plan.providerKey && row.work_id===plan.workId;
}

export class SharedTestResourceStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async plan(value:SharedTestResourcePlan,at=new Date()):Promise<ResourceRow> {
    if (!value.resourceId || !value.runId || !value.leaseId ||
        !Number.isSafeInteger(value.fence) || value.fence<1 || !value.kind ||
        !value.providerKey || !value.workId)
      throw new Error('invalid_test_resource_plan');
    const active=await this.db.prepare(`SELECT 1 AS allowed FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id WHERE e.site_id=1
        AND e.state IN ('preparing','active') AND e.owner_run_id=?
        AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
        AND l.run_id=? AND l.fence=?`)
      .bind(value.runId,value.leaseId,value.fence,at.toISOString(),value.runId,value.fence)
      .first<{allowed:number}>();
    if (active?.allowed!==1) throw new Error('test_resource_plan_fenced_or_conflict');
    await this.db.prepare(`INSERT OR IGNORE INTO test_resources
      (resource_id,run_id,lease_id,create_fence,kind,plan_state,provider_key,
       work_id,created_at,updated_at)
      SELECT ?,?,?,?,?,'planned',?,?,?,? WHERE EXISTS (SELECT 1 FROM test_environment e
        JOIN test_leases l ON l.lease_id=e.owner_lease_id
        WHERE e.site_id=1 AND e.state IN ('preparing','active') AND e.owner_run_id=?
          AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
          AND l.run_id=? AND l.fence=?)`)
      .bind(value.resourceId,value.runId,value.leaseId,value.fence,value.kind,
        value.providerKey,value.workId,at.toISOString(),at.toISOString(),
        value.runId,value.leaseId,value.fence,at.toISOString(),value.runId,value.fence).run();
    const row=await this.db.prepare('SELECT * FROM test_resources WHERE resource_id=?')
      .bind(value.resourceId).first<ResourceRow>();
    if (!row || !samePlan(row,value)) throw new Error('test_resource_plan_fenced_or_conflict');
    return row;
  }

  async beginCreate(value:SharedTestResourcePlan,at=new Date()):Promise<ResourceRow> {
    const existing=await this.plan(value,at);
    if (existing.plan_state==='created' || existing.plan_state==='uncertain' ||
        existing.plan_state==='creating') return existing;
    if (existing.plan_state!=='planned') throw new Error('test_resource_create_after_absence');
    const result=await this.db.prepare(`UPDATE test_resources SET plan_state='creating',updated_at=?
      WHERE resource_id=? AND plan_state='planned' AND create_fence=?
      AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1 AND owner_run_id=?
        AND owner_lease_id=? AND fence=? AND state IN ('preparing','active')
        AND heartbeat_due_at>?)`)
      .bind(at.toISOString(),value.resourceId,value.fence,value.runId,value.leaseId,
        value.fence,at.toISOString()).run();
    if (result.meta.changes!==1) throw new Error('test_resource_create_fenced');
    return {...existing,plan_state:'creating'};
  }

  async created(value:SharedTestResourcePlan,remoteId:string,at=new Date()):Promise<void> {
    if (!remoteId) throw new Error('test_resource_remote_id_missing');
    const result=await this.db.prepare(`UPDATE test_resources SET plan_state='created',
      remote_id=?,updated_at=? WHERE resource_id=? AND run_id=? AND lease_id=?
      AND create_fence=? AND provider_key=? AND work_id=?
      AND (plan_state IN ('creating','uncertain') OR
        (plan_state='created' AND remote_id=?))
      AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1 AND owner_run_id=?
        AND owner_lease_id=? AND fence=? AND state IN ('preparing','active'))`)
      .bind(remoteId,at.toISOString(),value.resourceId,value.runId,value.leaseId,
        value.fence,value.providerKey,value.workId,remoteId,value.runId,value.leaseId,
        value.fence).run();
    if (result.meta.changes!==1) throw new Error('test_resource_created_fenced');
  }

  async uncertain(value:SharedTestResourcePlan,recoveryRef:string,at=new Date()):Promise<void> {
    if (!recoveryRef) throw new Error('test_resource_recovery_ref_missing');
    const result=await this.db.prepare(`UPDATE test_resources SET plan_state='uncertain',
      recovery_ref=?,updated_at=? WHERE resource_id=? AND run_id=? AND lease_id=?
      AND create_fence=? AND provider_key=? AND work_id=? AND plan_state='creating'`)
      .bind(recoveryRef,at.toISOString(),value.resourceId,value.runId,value.leaseId,
        value.fence,value.providerKey,value.workId).run();
    if (result.meta.changes!==1) throw new Error('test_resource_uncertain_conflict');
  }

  async cleanupScope(input:{resourceId:string;runId:string;leaseId:string;fence:number}):Promise<ResourceRow> {
    const row=await this.db.prepare(`SELECT r.* FROM test_resources r JOIN test_environment e
      ON e.owner_lease_id=r.lease_id AND e.owner_run_id=r.run_id
      JOIN test_lease_fence_epochs old ON old.lease_id=r.lease_id AND old.fence=r.create_fence
      JOIN test_lease_fence_epochs current ON current.lease_id=r.lease_id AND current.fence=e.fence
      WHERE r.resource_id=? AND r.run_id=? AND r.lease_id=? AND e.site_id=1
        AND e.fence=? AND e.state IN ('quiescing','cleaning')`)
      .bind(input.resourceId,input.runId,input.leaseId,input.fence).first<ResourceRow>();
    if (!row) throw new Error('test_resource_cleanup_fenced');
    return row;
  }

  async absent(input:{resourceId:string;runId:string;leaseId:string;fence:number;
    removeWorkId:string;providerAbsent:boolean},at=new Date()):Promise<void> {
    const row=await this.cleanupScope(input);
    if (!input.providerAbsent || !input.removeWorkId) throw new Error('test_resource_absence_unproved');
    if (row.plan_state==='absent') {
      const prior=await this.db.prepare(`SELECT remove_work_id,remove_state,read_state
        FROM test_cleanup_checks WHERE lease_id=? AND resource_id=?`)
        .bind(input.leaseId,input.resourceId)
        .first<{remove_work_id:string;remove_state:string;read_state:string}>();
      if (prior?.remove_work_id===input.removeWorkId && prior.remove_state==='done' &&
          prior.read_state==='absent') return;
      throw new Error('test_resource_absence_conflict');
    }
    const results=await this.db.batch([
      this.db.prepare(`UPDATE test_resources SET plan_state='absent',cleanup_state='absent',
        absent_at=?,updated_at=? WHERE resource_id=? AND run_id=? AND lease_id=?
        AND create_fence=? AND EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND owner_lease_id=? AND fence=? AND state IN ('quiescing','cleaning'))`)
        .bind(at.toISOString(),at.toISOString(),input.resourceId,input.runId,input.leaseId,
          row.create_fence,input.leaseId,input.fence),
      this.db.prepare(`INSERT OR IGNORE INTO test_cleanup_checks
        (lease_id,resource_id,remove_work_id,remove_state,read_state,checked_at)
        SELECT ?,?,?,'done','absent',? WHERE EXISTS (SELECT 1 FROM test_resources
          WHERE resource_id=? AND lease_id=? AND plan_state='absent')`)
        .bind(input.leaseId,input.resourceId,input.removeWorkId,at.toISOString(),
          input.resourceId,input.leaseId),
    ]);
    if (results[0].meta.changes!==1 || results[1].meta.changes!==1)
      throw new Error('test_resource_absence_write_incomplete');
  }
}
