// Production allocator against local SQLite/R2 fixtures and the real Cloudflare
// browser provider exposed only through a loopback Wrangler diagnostic.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {ImplementationBrowserAllocator, type BrowserProvider} from '../../src/implementation-browser.ts';
import {ImplementationStore} from '../../src/implementation-store.ts';
import {implementationPolicy} from '../../src/implementation-contract.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from '../../tests/helpers/implementation-fixture.ts';
const request = JSON.parse(await (await import('node:fs/promises')).readFile(process.argv[2],'utf8'));
const endpoint=new URL(request.endpoint);
if(endpoint.hostname!=='127.0.0.1')throw new Error('Use the loopback diagnostic endpoint');
const call=async(action:string,id?:string)=>{
  const response=await fetch(endpoint,{method:'POST',body:JSON.stringify({action,id})});
  if(!response.ok)throw new Error(await response.text());
  return response.json() as Promise<any>;
};
const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
const owned:string[]=[];
const provider:BrowserProvider={
  inventory:()=>call('inventory'),history:id=>call('history',id),
  capacity:async()=>({available:true,retryAfterMs:1000}),
  create:async()=>{const result=await call('create');owned.push(result.id);return {...result,disconnect:async()=>{}};},
  close:async id=>{await call('close',id);},keepAlive:async()=>{},
};
let primaryError: unknown;
try {
  seedRun(db);seedAttempt(db,'browser-recovery');
  const work=await store.allocate({version:1,runId:'run-1',repository:'test/fixture',change:'sample',branch:'test/fixture',
    approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
    requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'PROBE',1);
  await store.beginTry(work,{attempt_id:'browser-recovery',sandbox_id:'fixture',visit_sequence:1},'build');
  const allocator=new ImplementationBrowserAllocator(store,provider,'isolated-probe');
  const first=await allocator.acquire('run-1','browser-recovery','https://example.com');
  const firstPage=await call('reset',first.provider_resource_id!);
  await provider.close(first.provider_resource_id!);
  for(let i=0;i<10 && (await provider.inventory()).includes(first.provider_resource_id!);i++)
    await new Promise(resolve=>setTimeout(resolve,500));
  assert.ok(!(await provider.inventory()).includes(first.provider_resource_id!));
  const failure=await allocator.commandFailure(first,new Error('Target closed (deliberately injected session closure)'));
  await store.error('run-1','browser-recovery','probe.browser.closed',failure);
  const second=await allocator.acquire('run-1','browser-recovery','https://example.com',[],true);
  assert.notEqual(first.provider_resource_id,second.provider_resource_id);
  const recoveredPage=await call('reset',second.provider_resource_id!);
  assert.equal(recoveredPage.documentStatus,200);assert.equal(recoveredPage.title,'Example Domain');
  await allocator.cleanup(first);
  assert.equal((await store.resource('browser-recovery','browser'))!.provider_resource_id,second.provider_resource_id);
  await allocator.cleanup(second);
  const receipt={checkedAt:new Date().toISOString(),kind:'real Cloudflare browser lifecycle with local storage fixtures',
    firstSession:first.provider_resource_id,replacementSession:second.provider_resource_id,firstPage,recoveredPage,
    providerHistory:await provider.history(first.provider_resource_id!),
    replacement:JSON.parse(second.metadata_json).replacement,
    cleanup:(await store.resource('browser-recovery','browser'))!.status,workflowStarted:false};
  await writeFile(request.output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
} catch(error) {primaryError=error;throw error;}
finally {
  try {
    if(owned.length) {
      const live=await provider.inventory();
      for(const id of owned)if(live.includes(id))await provider.close(id);
    }
  } catch(error) {
    throw new AggregateError(primaryError ? [primaryError,error] : [error],
      'Browser diagnostic cleanup failed', {cause:primaryError ?? error});
  } finally {db.close();}
}
