import type {Page} from '@cloudflare/puppeteer';

/** Values stay inside the trusted coordinator. Only the fixed summary leaves it. */
export async function auditTestBrowserPage(page:Page,origin:string,credentials:string[]) {
  if(new URL(page.url()).origin!==origin)throw new Error('test_browser_audit_origin');
  const observation=await page.evaluate(()=>{
    const stores=[['local',localStorage],['session',sessionStorage]] as const;
    let bytes=0;
    const storage=stores.flatMap(([kind,store])=>{
      if(store.length>256)throw new Error('test_browser_audit_storage_limit');
      return Array.from({length:store.length},(_,index)=>{
        const key=store.key(index)!,value=store.getItem(key)??'';
        bytes+=key.length+value.length;
        if(bytes>1_000_000)throw new Error('test_browser_audit_storage_limit');
        return {kind,key,value};
      });
    });
    const entries=performance.getEntriesByType('resource');
    if(entries.length>2000)throw new Error('test_browser_audit_resource_limit');
    return {storage,resources:entries.map(entry=>({name:entry.name,
      initiatorType:(entry as PerformanceResourceTiming).initiatorType})),
      timeOrigin:performance.timeOrigin};
  });
  const protectedValues=credentials.filter(value=>value.length>=8);
  const origins=[...new Set(observation.resources.map(entry=>new URL(entry.name).origin))].sort();
  const linearRequests=observation.resources.filter(entry=>{
    const host=new URL(entry.name).hostname;
    return host==='linear.app'||host.endsWith('.linear.app');
  }).length;
  return {version:1,observedAt:new Date().toISOString(),origin,
    network:{scope:'Completed resource entries in the current document only',
      since:new Date(observation.timeOrigin).toISOString(),resourceCount:observation.resources.length,
      origins,linearRequests},
    storage:{scope:'Current localStorage and sessionStorage; values are never returned',
      entries:observation.storage.length,
      credentialNamedKeys:observation.storage.filter(item=>/token|secret|credential|authorization/i.test(item.key)).length,
      knownCredentialsChecked:protectedValues.length,
      knownCredentialPresent:observation.storage.some(item=>protectedValues.some(value=>
        item.key.includes(value)||item.value.includes(value)))}};
}
