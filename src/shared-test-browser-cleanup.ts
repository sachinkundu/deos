import {SharedTestBrowserStore} from './shared-test-browser-store.ts';
import type {TestBrowserProvider} from './shared-test-browser-provider.ts';

/** Browser absence must be observed before the site can become free. */
export class SharedTestBrowserCleanup {
  readonly store:SharedTestBrowserStore;
  readonly provider:Pick<TestBrowserProvider,'inventory'|'close'>;
  constructor(store:SharedTestBrowserStore,
    provider:Pick<TestBrowserProvider,'inventory'|'close'>) {
    this.store=store;this.provider=provider;
  }

  async resume(leaseId:string,runId:string,at=new Date()):Promise<void> {
    const rows=(await this.store.db.prepare(`SELECT lease_id,service_name,
      run_id FROM test_browser_sessions WHERE lease_id=? AND run_id=?
        AND state<>'absent' ORDER BY service_name`)
      .bind(leaseId,runId).all<{lease_id:string;service_name:string;
        run_id:string}>()).results;
    for(const item of rows) {
      const row=await this.store.retire(item.lease_id,item.service_name,at);
      if(!row || row.run_id!==runId || row.state!=='retiring')
        throw new Error('test_browser_cleanup_scope_changed');
      if(row.session_id) {
        const before=await this.provider.inventory();
        if(before.includes(row.session_id))await this.provider.close(row.session_id);
        const first=await this.provider.inventory();
        const second=await this.provider.inventory();
        if(first.includes(row.session_id) || second.includes(row.session_id))
          throw new Error('test_browser_session_remains');
      } else if(row.create_window) {
        // A lost create reply has no stable provider name. Wait past the
        // acquisition window, then refuse to claim another browser's session.
        if(at.getTime()-Date.parse(row.create_window)<10*60_000)
          throw new Error('test_browser_create_outcome_pending');
        if(!row.inventory_json)throw new Error('test_browser_inventory_missing');
        const prior:unknown=JSON.parse(row.inventory_json);
        if(!Array.isArray(prior) || prior.some(id=>typeof id!=='string'))
          throw new Error('test_browser_inventory_invalid');
        const first=await this.provider.inventory(),second=await this.provider.inventory();
        if(first.some(id=>!prior.includes(id)) || second.some(id=>!prior.includes(id)))
          throw new Error('test_browser_create_outcome_uncertain');
      }
      await this.store.absent(item.lease_id,item.service_name,at);
    }
  }
}
