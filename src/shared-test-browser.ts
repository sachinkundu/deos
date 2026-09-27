import {SharedTestAppLauncher} from './shared-test-app-launcher.ts';
import {SharedTestBrowserStore,type TestBrowserScope,type TestBrowserRow} from './shared-test-browser-store.ts';
import type {TestBrowserProvider,TestBrowserOperation} from './shared-test-browser-provider.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';

/** Lease-scoped browser with a durable creation record and no agent secret. */
export class SharedTestBrowser {
  readonly store:SharedTestBrowserStore;
  readonly provider:TestBrowserProvider;
  readonly launcher:SharedTestAppLauncher;
  readonly verifyCandidate:(scope:TestBrowserScope)=>Promise<boolean>;
  constructor(store:SharedTestBrowserStore,provider:TestBrowserProvider,
    launcher:SharedTestAppLauncher,
    verifyCandidate:(scope:TestBrowserScope)=>Promise<boolean>) {
    this.store=store;this.provider=provider;
    this.launcher=launcher;this.verifyCandidate=verifyCandidate;
  }

  private async lock(operationId:string):Promise<void> {
    const now=new Date(),until=new Date(now.getTime()+180_000);
    const result=await this.store.db.prepare(`INSERT INTO implementation_browser_leases
      (account_id,operation_id,expires_at) VALUES ('service-browser',?,?)
      ON CONFLICT(account_id) DO UPDATE SET operation_id=excluded.operation_id,
        expires_at=excluded.expires_at
      WHERE implementation_browser_leases.expires_at<=?`)
      .bind(operationId,until.toISOString(),now.toISOString()).run();
    if(result.meta.changes!==1)throw new Error('test_browser_capacity_busy');
  }

  private async unlock(operationId:string):Promise<void> {
    await this.store.db.prepare(`DELETE FROM implementation_browser_leases
      WHERE account_id='service-browser' AND operation_id=?`)
      .bind(operationId).run();
  }

  async open(scope:TestBrowserScope):Promise<TestBrowserRow> {
    if(!await this.verifyCandidate(scope))
      throw new Error('test_browser_candidate_not_running');
    let row=await this.store.plan(scope);
    if(row.state==='ready') {
      if(!row.session_id || !(await this.provider.inventory()).includes(row.session_id))
        throw new Error('test_browser_session_disappeared');
      if(!row.prepared_until || Date.parse(row.prepared_until)-Date.now()<120_000)
        await this.refresh(scope,row);
      return row;
    }
    if(!['planned','creating'].includes(row.state))
      throw new Error('test_browser_reconciliation_required');
    if(row.state==='creating' && !row.session_id)
      throw new Error('test_browser_create_outcome_uncertain');
    if(row.state==='planned') {
      const capacity=await this.provider.capacity();
      if(!capacity.available)
        throw new Error(`test_browser_capacity_wait:${capacity.retryAfterMs}`);
    } else if(!row.session_id ||
        !(await this.provider.inventory()).includes(row.session_id))
      throw new Error('test_browser_session_disappeared');
    const lockId=crypto.randomUUID();
    await this.lock(lockId);
    let primary:unknown;
    try {
      await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
        scope.attemptId,scope.leaseId,scope.fence);
      if(row.state==='planned') {
        const before=await this.provider.inventory();
        await this.store.begin(scope,before);
        let created:{id:string;disconnect():Promise<void>};
        try {created=await this.provider.create(scope.plan.canonicalHost);}
        catch(error){throw new Error('test_browser_provider_create_failed',{cause:error});}
        let recordError:unknown;
        try {await this.store.recordSession(scope,created.id);}
        catch(error) {
          recordError=error;
          try {await this.store.recordUncertain(scope,created.id);}
          catch(diagnostic) {
            recordError=new AggregateError([error,diagnostic],
              'Test browser create and identity write failed',{cause:error});
          }
        }
        try {await created.disconnect();}
        catch(error) {
          if(recordError)throw new AggregateError([recordError,error],
            'Test browser identity write and disconnect failed',{cause:recordError});
          throw error;
        }
        if(recordError)throw recordError;
        row=(await this.store.row(scope.leaseId,scope.plan.serviceName))!;
      }
      if(!row.session_id)throw new Error('test_browser_session_missing');
      const launch=await this.launcher.launch(scope);
      await this.provider.prepare(row.session_id,launch.origin,launch.cookie,
        this.launcher.clientId,this.launcher.clientSecret);
      await this.store.ready(scope,row.session_id,launch.expiresAt);
      return (await this.store.row(scope.leaseId,scope.plan.serviceName))!;
    }catch(error){primary=error;throw error;}
    finally {
      try {await this.unlock(lockId);}
      catch(error) {
        if(primary)throw new AggregateError([primary,error],
          'Test browser operation and lock release failed',{cause:primary});
        throw error;
      }
    }
  }

  private async refresh(scope:TestBrowserScope,row:TestBrowserRow):Promise<void> {
    if(!row.session_id)throw new Error('test_browser_session_missing');
    await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence);
    const launch=await this.launcher.launch(scope);
    await this.provider.prepare(row.session_id,launch.origin,launch.cookie,
      this.launcher.clientId,this.launcher.clientSecret);
    await this.store.refreshed(scope,row.session_id,launch.expiresAt);
  }

  async command(scope:TestBrowserScope,input:TestBrowserOperation):Promise<{
    url:string;title?:string;content?:string;documentStatus?:number}> {
    if(!['navigate','state','click','fill','press','wait','viewport'].includes(input.operation))
      throw new Error('test_browser_operation_invalid');
    if(!await this.verifyCandidate(scope))
      throw new Error('test_browser_candidate_not_running');
    await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence);
    const row=await this.store.row(scope.leaseId,scope.plan.serviceName);
    if(!row || row.state!=='ready' || !row.session_id ||
        row.run_id!==scope.runId || row.attempt_id!==scope.attemptId ||
        row.fence!==scope.fence ||
        row.origin!==`https://${scope.plan.canonicalHost}`)
      throw new Error('test_browser_session_fenced');
    if(!row.prepared_until || Date.parse(row.prepared_until)-Date.now()<120_000)
      await this.refresh(scope,row);
    const result=await this.provider.command(row.session_id,row.origin,input);
    if('image' in result || result.content && result.content.length>200_000)
      throw new Error('test_browser_result_invalid');
    await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence);
    return {url:result.url,...('title' in result?{title:result.title}:{}),
      ...('content' in result?{content:result.content}:{}),
      ...(result.documentStatus!==undefined?
        {documentStatus:result.documentStatus}:{})};
  }

  async capture(scope:TestBrowserScope):Promise<{image:Uint8Array;url:string}> {
    if(!await this.verifyCandidate(scope))
      throw new Error('test_browser_candidate_not_running');
    await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence);
    const row=await this.store.row(scope.leaseId,scope.plan.serviceName);
    if(!row || row.state!=='ready' || !row.session_id ||
        row.run_id!==scope.runId || row.attempt_id!==scope.attemptId ||
        row.fence!==scope.fence || row.origin!==`https://${scope.plan.canonicalHost}`)
      throw new Error('test_browser_session_fenced');
    if(!row.prepared_until || Date.parse(row.prepared_until)-Date.now()<120_000)
      await this.refresh(scope,row);
    const result=await this.provider.capture(row.session_id,row.origin);
    if(result.image.byteLength<100 || result.image.byteLength>8_000_000 ||
        new URL(result.url).origin!==row.origin)
      throw new Error('test_browser_capture_invalid');
    await new SharedTestLeaseStore(this.store.db).assertWrite(scope.runId,
      scope.attemptId,scope.leaseId,scope.fence);
    return result;
  }
}
