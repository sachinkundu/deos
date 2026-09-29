import {CloudflareTestBrowserProvider} from './shared-test-browser-provider.ts';
import {withSharedTestBrowserLock} from './shared-test-browser-lock.ts';

/** Keep only a currently owned, ready browser alive between agent calls. */
export async function maintainSharedTestBrowser(env:Pick<Env,'DB'|'IMPLEMENTATION_BROWSER'>,
  at=new Date()):Promise<void> {
  const row=await env.DB.prepare(`SELECT b.lease_id,b.service_name,b.session_id,
    b.run_id,b.fence,b.updated_at FROM test_browser_sessions b
    JOIN test_environment e ON e.owner_lease_id=b.lease_id
      AND e.owner_run_id=b.run_id AND e.fence=b.fence
    WHERE e.site_id=1 AND e.state='active' AND e.heartbeat_due_at>?
      AND b.state='ready' AND b.session_id IS NOT NULL
    ORDER BY b.updated_at LIMIT 1`)
    .bind(at.toISOString()).first<{lease_id:string;service_name:string;
      session_id:string;run_id:string;fence:number;updated_at:string}>();
  if(!row || Date.parse(row.updated_at)>at.getTime()-60_000)return;
  const maintained=await withSharedTestBrowserLock(env.DB,row.lease_id,row.service_name,async()=>{
    await new CloudflareTestBrowserProvider(env.IMPLEMENTATION_BROWSER).keepAlive(row.session_id);
    return true;
  },()=>false);
  if(!maintained)return;
  const changed=await env.DB.prepare(`UPDATE test_browser_sessions SET updated_at=?
    WHERE lease_id=? AND service_name=? AND state='ready' AND session_id=?
      AND EXISTS (SELECT 1 FROM test_environment WHERE site_id=1
        AND state='active' AND owner_run_id=? AND owner_lease_id=?
        AND fence=? AND heartbeat_due_at>?)`)
    .bind(at.toISOString(),row.lease_id,row.service_name,row.session_id,
      row.run_id,row.lease_id,row.fence,at.toISOString()).run();
  if(changed.meta.changes!==1)
    throw new Error('test_browser_keepalive_owner_changed');
}
