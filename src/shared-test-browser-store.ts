import {SharedTestLeaseStore} from './shared-test-lease.ts';
import type {SharedTestServicePlan} from './shared-test-service-plan.ts';

export interface TestBrowserRow {
  lease_id:string;service_name:string;run_id:string;attempt_id:string;
  fence:number;origin:string;state:'planned'|'creating'|'ready'|'retiring'|
    'absent'|'uncertain';operation_id:string;inventory_json:string|null;
  create_window:string|null;session_id:string|null;prepared_until:string|null;
  absent_at:string|null;
}

export interface TestBrowserScope {
  runId:string;attemptId:string;leaseId:string;fence:number;
  plan:SharedTestServicePlan;
}

/** A browser session is an owned external resource, not an in-memory handle. */
export class SharedTestBrowserStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  private origin(scope:TestBrowserScope):string {
    const {plan,leaseId}=scope;
    if(plan.workerName!==`deos-test-${plan.serviceName}-${leaseId.slice(0,32)}` ||
        plan.canonicalHost!==`${plan.serviceName}-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`)
      throw new Error('test_browser_plan_invalid');
    return `https://${plan.canonicalHost}`;
  }

  async row(leaseId:string,serviceName:string):Promise<TestBrowserRow|null> {
    return this.db.prepare(`SELECT * FROM test_browser_sessions
      WHERE lease_id=? AND service_name=?`)
      .bind(leaseId,serviceName).first<TestBrowserRow>();
  }

  async plan(scope:TestBrowserScope,at=new Date()):Promise<TestBrowserRow> {
    const origin=this.origin(scope),now=at.toISOString();
    await new SharedTestLeaseStore(this.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence,at);
    const operationId=`test-browser:${scope.leaseId}:${scope.plan.serviceName}`;
    await this.db.prepare(`INSERT OR IGNORE INTO test_browser_sessions
      (lease_id,service_name,run_id,attempt_id,fence,origin,state,
       operation_id,created_at,updated_at)
      SELECT ?,?,?,?,?,?,'planned',?,?,? WHERE EXISTS
        (SELECT 1 FROM test_environment WHERE site_id=1 AND state='active'
          AND owner_run_id=? AND owner_lease_id=? AND fence=?
          AND heartbeat_due_at>?)`)
      .bind(scope.leaseId,scope.plan.serviceName,scope.runId,scope.attemptId,
        scope.fence,origin,operationId,now,now,scope.runId,scope.leaseId,
        scope.fence,now).run();
    const row=await this.row(scope.leaseId,scope.plan.serviceName);
    if(!row || row.run_id!==scope.runId || row.attempt_id!==scope.attemptId ||
        row.fence!==scope.fence || row.origin!==origin ||
        row.operation_id!==operationId || row.state==='absent')
      throw new Error('test_browser_plan_changed');
    return row;
  }

  async begin(scope:TestBrowserScope,inventory:readonly string[],at=new Date()):Promise<void> {
    if(inventory.some(id=>typeof id!=='string' || !id) ||
        new Set(inventory).size!==inventory.length)
      throw new Error('test_browser_inventory_invalid');
    const now=at.toISOString();
    const result=await this.db.prepare(`UPDATE test_browser_sessions SET
      state='creating',inventory_json=?,create_window=?,updated_at=?
      WHERE lease_id=? AND service_name=? AND run_id=? AND attempt_id=?
        AND fence=? AND state='planned' AND create_window IS NULL
        AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(JSON.stringify(inventory),now,now,scope.leaseId,scope.plan.serviceName,
        scope.runId,scope.attemptId,scope.fence,scope.runId,scope.leaseId,
        scope.fence,now).run();
    if(result.meta.changes!==1)throw new Error('test_browser_create_fenced');
  }

  async recordSession(scope:TestBrowserScope,sessionId:string,at=new Date()):Promise<void> {
    if(!sessionId)throw new Error('test_browser_session_invalid');
    const now=at.toISOString();
    const result=await this.db.prepare(`UPDATE test_browser_sessions
      SET session_id=?,updated_at=? WHERE lease_id=?
        AND service_name=? AND run_id=? AND attempt_id=? AND fence=?
        AND state='creating' AND session_id IS NULL
        AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
          AND state='active' AND owner_run_id=? AND owner_lease_id=?
          AND fence=? AND heartbeat_due_at>?)`)
      .bind(sessionId,now,scope.leaseId,scope.plan.serviceName,scope.runId,
        scope.attemptId,scope.fence,scope.runId,scope.leaseId,
        scope.fence,now).run();
    if(result.meta.changes!==1)throw new Error('test_browser_create_write_incomplete');
  }

  async recordUncertain(scope:TestBrowserScope,sessionId:string,
    at=new Date()):Promise<void> {
    if(!sessionId)throw new Error('test_browser_session_invalid');
    const result=await this.db.prepare(`UPDATE test_browser_sessions
      SET state='uncertain',session_id=COALESCE(session_id,?),updated_at=?
      WHERE lease_id=? AND service_name=? AND run_id=? AND attempt_id=?
        AND fence=? AND state IN ('creating','uncertain')
        AND (session_id IS NULL OR session_id=?)`)
      .bind(sessionId,at.toISOString(),scope.leaseId,scope.plan.serviceName,
        scope.runId,scope.attemptId,scope.fence,sessionId).run();
    if(result.meta.changes!==1)throw new Error('test_browser_uncertain_write_incomplete');
  }

  async ready(scope:TestBrowserScope,sessionId:string,preparedUntil:string,
    at=new Date()):Promise<void> {
    const now=at.toISOString();
    const result=await this.db.prepare(`UPDATE test_browser_sessions SET
      state='ready',prepared_until=?,updated_at=? WHERE lease_id=? AND service_name=?
        AND run_id=? AND attempt_id=? AND fence=? AND state='creating'
        AND session_id=? AND EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='active' AND owner_run_id=?
            AND owner_lease_id=? AND fence=? AND heartbeat_due_at>?)`)
      .bind(preparedUntil,now,scope.leaseId,scope.plan.serviceName,scope.runId,
        scope.attemptId,scope.fence,sessionId,scope.runId,scope.leaseId,
        scope.fence,now).run();
    if(result.meta.changes!==1)throw new Error('test_browser_ready_fenced');
  }

  async refreshed(scope:TestBrowserScope,sessionId:string,preparedUntil:string,
    at=new Date()):Promise<void> {
    const now=at.toISOString();
    const result=await this.db.prepare(`UPDATE test_browser_sessions SET
      prepared_until=?,updated_at=? WHERE lease_id=? AND service_name=?
        AND run_id=? AND attempt_id=? AND fence=? AND state='ready'
        AND session_id=? AND EXISTS (SELECT 1 FROM test_environment
          WHERE site_id=1 AND state='active' AND owner_run_id=?
            AND owner_lease_id=? AND fence=? AND heartbeat_due_at>?)`)
      .bind(preparedUntil,now,scope.leaseId,scope.plan.serviceName,
        scope.runId,scope.attemptId,scope.fence,sessionId,scope.runId,
        scope.leaseId,scope.fence,now).run();
    if(result.meta.changes!==1)throw new Error('test_browser_refresh_fenced');
  }

  async retire(leaseId:string,serviceName:string,at=new Date()):Promise<TestBrowserRow|null> {
    const row=await this.row(leaseId,serviceName);
    if(!row || row.state==='absent')return row;
    await this.db.prepare(`UPDATE test_browser_sessions SET state='retiring',
      updated_at=? WHERE lease_id=? AND service_name=?
        AND state IN ('planned','creating','ready','uncertain','retiring')`)
      .bind(at.toISOString(),leaseId,serviceName).run();
    return this.row(leaseId,serviceName);
  }

  async absent(leaseId:string,serviceName:string,at=new Date()):Promise<void> {
    const now=at.toISOString();
    const result=await this.db.prepare(`UPDATE test_browser_sessions SET
      state='absent',absent_at=?,updated_at=? WHERE lease_id=?
        AND service_name=? AND state='retiring'`)
      .bind(now,now,leaseId,serviceName).run();
    if(result.meta.changes!==1)throw new Error('test_browser_absence_write_incomplete');
  }
}
