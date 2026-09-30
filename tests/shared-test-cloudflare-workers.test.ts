import {sharedTestSetupRepairRevision} from '../src/shared-test-setup-retry.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import {SharedTestCloudflareWorkers} from '../src/shared-test-cloudflare-workers.ts';
import {sharedTestServicePlans} from '../src/shared-test-service-plan.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';
import type {TestWorkerPlan} from '../src/shared-test-worker-provisioner.ts';

const leaseId='a'.repeat(64);
const base:StableStagingBase={revision:'version-1',services:[{serviceName:'portal',
  sourceCommit:'b'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100}]};
const service=sharedTestServicePlans(leaseId,base)[0];
const plan:TestWorkerPlan={resourceId:service.resourceId,runId:'run-1',leaseId,
  fence:1,kind:'test_worker',providerKey:service.canonicalHost,
  workId:service.workId,service};
const build={worker:new TextEncoder().encode('export default {fetch(){return new Response("ok")}}'),
  assets:new Map([['portal/dist/index.html',new TextEncoder().encode('<html>test</html>')]]),
  modules:new Map<string,Uint8Array>(),migrations:new Map<string,Uint8Array>(),
  sha256:service.base.buildInputSha256};

test('lease Worker upload binds only its stores and gate, then attaches its fixed host',async()=>{
  let script=false,domain=false;
  const calls:string[]=[];
  let metadata:Record<string,any>|undefined;
  const fetcher:typeof fetch=async (input,init)=>{
    const url=new URL(String(input));
    const path=url.pathname.replace(/^\/client\/v4\/accounts\/[a-f0-9]{32}/,'');
    calls.push(`${init?.method??'GET'} ${path}`);
    let result:unknown={};
    if(path.endsWith('/settings')) {
      if(!script)return new Response('missing',{status:404});
      result={tags:[`deos-test-lease:${leaseId}`,
        `deos-test-edge:${sharedTestSetupRepairRevision}`,
        `deos-test-source:${service.base.sourceCommit}`,
        `deos-test-base:${service.base.deployVersion}`,
        `deos-test-build:${service.base.buildInputSha256}`]};
    } else if(path==='/workers/domains' && init?.method==='PUT') {
      const body=JSON.parse(String(init.body));
      assert.equal(body.hostname,service.canonicalHost);
      assert.equal(body.service,service.workerName);
      domain=true;
    } else if(path==='/workers/domains') {
      result=domain?[{id:'domain-1',hostname:service.canonicalHost,
        service:service.workerName,zone_id:'e'.repeat(32)}]:[];
    } else if(path.endsWith('/assets-upload-session')) {
      const body=JSON.parse(String(init?.body));
      assert.deepEqual(Object.keys(body.manifest),['/index.html']);
      result={jwt:'upload-jwt',buckets:[[body.manifest['/index.html'].hash]]};
    } else if(path==='/workers/assets/upload') {
      assert.equal(init?.headers && (init.headers as Record<string,string>).Authorization,
        'Bearer upload-jwt');
      assert.ok(init?.body instanceof FormData);
      result={jwt:'complete-jwt'};
    } else if(path===`/workers/scripts/${service.workerName}` && init?.method==='PUT') {
      const form=init.body as FormData;
      metadata=JSON.parse(String(form.get('metadata')));
      assert.ok(form.get('edge.js'));
      assert.ok(form.get('app/worker.js'));
      script=true;
    } else throw new Error(`unexpected request ${init?.method??'GET'} ${path}`);
    return Response.json({success:true,result});
  };
  const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>{
    assert.match(sql,/test_resources/);
    if(sql.includes('AS allowed'))return {allowed:1};
    const kind=args[3];
    return {remote_id:kind==='d1_database'?
      '00000000-0000-4000-8000-000000000001':
      `deos-test-portal-artifacts-${leaseId.slice(0,32)}`,
      provider_key:kind==='d1_database'?
        `deos-test-portal-db-${leaseId.slice(0,32)}`:
        `deos-test-portal-artifacts-${leaseId.slice(0,32)}`,plan_state:'created'};
  }})})} as unknown as D1Database;
  const provider=new SharedTestCloudflareWorkers(db,'d'.repeat(32),'e'.repeat(32),
    'test-token',fetcher);
  await provider.create(plan,build);
  assert.equal((await provider.lookup(plan))?.workerName,service.workerName);
  assert.equal(metadata?.assets.jwt,'complete-jwt');
  assert.equal(metadata?.main_module,'edge.js');
  const bindings=metadata?.bindings as Array<{name:string;service?:string;id?:string}>;
  assert.ok(bindings.some(value=>value.name==='DB'&&
    value.id==='00000000-0000-4000-8000-000000000001'));
  assert.ok(bindings.some(value=>value.name==='TEST_APP_GATE'&&
    value.service==='deos-queue-consumer-ts'));
  assert.ok(!bindings.some(value=>['ROUTE_ADMIN','RETRY_ADMIN','RECENT_ISSUES'].includes(value.name)));
  assert.ok(calls.indexOf(`PUT /workers/scripts/${service.workerName}`)<
    calls.indexOf('PUT /workers/domains'));
});

test('BettaView upload sends the provider-required single-step migration object',async()=>{
  const bettaBase:StableStagingBase={revision:'version-1',services:[{
    serviceName:'bettaview',sourceCommit:'b'.repeat(40),deployVersion:'version-1',
    buildInputSha256:'c'.repeat(64),trafficPercent:100}]};
  const betta=sharedTestServicePlans(leaseId,bettaBase)[0];
  const bettaPlan:TestWorkerPlan={resourceId:betta.resourceId,runId:'run-1',leaseId,
    fence:1,kind:'test_worker',providerKey:betta.canonicalHost,
    workId:betta.workId,service:betta};
  const provider=new SharedTestCloudflareWorkers({} as D1Database,
    'd'.repeat(32),'e'.repeat(32),'test-token');
  let metadata:Record<string,unknown>|null=null;
  const privateProvider=provider as unknown as {
    store:()=>Promise<string>;uploadAssets:()=>Promise<string>;
    assertFence:()=>Promise<void>;
    api:(path:string,init:RequestInit)=>Promise<unknown>;
    upload:(plan:TestWorkerPlan,candidateBuild:typeof build & {compiledWorker?:Uint8Array},commit:string,
      phase:'preparing',existing:boolean)=>Promise<void>;
  };
  privateProvider.store=async()=> 'store-id';
  privateProvider.uploadAssets=async()=> 'asset-jwt';
  privateProvider.assertFence=async()=> {};
  privateProvider.api=async(_path,init)=>{
    metadata=JSON.parse(String((init.body as FormData).get('metadata')));
    return {};
  };
  await privateProvider.upload(bettaPlan,{...build,compiledWorker:new Uint8Array([1])},
    betta.base.sourceCommit,'preparing',false);
  assert.ok(metadata);
  assert.deepEqual((metadata as Record<string,unknown>).migrations,
    {new_tag:'v1',new_sqlite_classes:['GitHubSession']});
  const bindings=(metadata as {bindings:Array<{name:string;text?:string;
    service?:string;entrypoint?:string}>}).bindings;
  assert.equal(bindings.find(binding=>binding.name==='GITHUB_CLIENT_ID')?.text,
    'Iv23likxukpheraNrZlx');
  assert.equal(bindings.some(binding=>binding.name==='GITHUB_CLIENT_SECRET'),false);
  assert.deepEqual(bindings.find(binding=>binding.name==='TEST_GITHUB_BROKER'),{
    type:'service',name:'TEST_GITHUB_BROKER',service:'deos-queue-consumer-ts',
    entrypoint:'SharedTestGitHubBrokerEntrypoint'});
  await privateProvider.upload(bettaPlan,{...build,compiledWorker:new Uint8Array([1])},
    betta.base.sourceCommit,'preparing',true);
  assert.ok(metadata);
  assert.equal((metadata as Record<string,unknown>).migrations,undefined);
});

test('candidate edge refresh keeps the saved candidate and lease identity',async()=>{
  const provider=new SharedTestCloudflareWorkers({} as D1Database,
    'd'.repeat(32),'e'.repeat(32),'test-token');
  const tags=[`deos-test-lease:${leaseId}`,
    `deos-test-source:${service.base.sourceCommit}`,
    `deos-test-base:${service.base.deployVersion}`,
    `deos-test-build:${service.base.buildInputSha256}`,
    'deos-test-candidate:'+ 'a'.repeat(40),
    `deos-test-candidate-build:${build.sha256}`,
    'deos-test-edge:version-owned-by-edge-v1'];
  let uploaded=false;
  const controlled=provider as unknown as {api:()=>Promise<unknown>;
    assertFence:()=>Promise<void>;upload:()=>Promise<void>};
  controlled.api=async()=>({tags});
  controlled.assertFence=async()=>{};
  controlled.upload=async()=>{
    uploaded=true;
    tags.splice(tags.indexOf('deos-test-edge:version-owned-by-edge-v1'),1,
      `deos-test-edge:${sharedTestSetupRepairRevision}`);
  };
  assert.equal(await provider.ensureCandidateEdge(plan,build,'a'.repeat(40)),true);
  assert.equal(uploaded,true);
  assert.equal(await provider.ensureCandidateEdge(plan,build,'a'.repeat(40)),false);
  await assert.rejects(provider.ensureCandidateEdge(plan,build,'b'.repeat(40)),
    /identity_changed/);
});

test('a lease Worker host already assigned elsewhere is refused before upload',async()=>{
  const fetcher:typeof fetch=async input=>{
    const path=new URL(String(input)).pathname;
    if(path.endsWith('/settings'))return new Response('missing',{status:404});
    if(path.endsWith('/workers/domains'))return Response.json({success:true,
      result:[{id:'domain-1',hostname:service.canonicalHost,
        service:'someone-else',zone_id:'e'.repeat(32)}]});
    throw new Error(`unexpected ${path}`);
  };
  const provider=new SharedTestCloudflareWorkers({} as D1Database,
    'd'.repeat(32),'e'.repeat(32),'test-token',fetcher);
  await assert.rejects(provider.create(plan,build),/domain_conflict/);
});

test('cleanup accepts empty successful delete replies after fixed identity checks',async()=>{
  const calls:string[]=[];
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname.replace(/^\/client\/v4\/accounts\/[a-f0-9]{32}/,'');
    calls.push(`${init?.method??'GET'} ${path}`);
    if(init?.method==='DELETE')return new Response(null,{status:204});
    if(path.endsWith('/settings'))return Response.json({success:true,result:{tags:[
      `deos-test-lease:${leaseId}`,`deos-test-source:${service.base.sourceCommit}`,
      `deos-test-base:${service.base.deployVersion}`,
      `deos-test-build:${service.base.buildInputSha256}`]}});
    if(path==='/workers/domains')return Response.json({success:true,result:[{
      id:'domain-1',hostname:service.canonicalHost,service:service.workerName,
      zone_id:'e'.repeat(32)}]});
    throw new Error(`unexpected ${path}`);
  };
  await new SharedTestCloudflareWorkers({} as D1Database,'d'.repeat(32),
    'e'.repeat(32),'test-token',fetcher).remove(plan);
  assert.deepEqual(calls.slice(-2),[
    'DELETE /workers/domains/domain-1',
    `DELETE /workers/scripts/${service.workerName}`]);
});

test('an expired lease is refused before the first asset write',async()=>{
  let writes=0;
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(init?.method==='POST'||init?.method==='PUT')writes++;
    if(path.endsWith('/settings'))return new Response('missing',{status:404});
    if(path.endsWith('/workers/domains'))return Response.json({success:true,result:[]});
    throw new Error(`unexpected ${path}`);
  };
  const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>{
    if(sql.includes('AS allowed'))return null;
    const d1=args[3]==='d1_database';
    return {plan_state:'created',provider_key:d1?
      `deos-test-portal-db-${leaseId.slice(0,32)}`:
      `deos-test-portal-artifacts-${leaseId.slice(0,32)}`,
    remote_id:d1?'00000000-0000-4000-8000-000000000001':
      `deos-test-portal-artifacts-${leaseId.slice(0,32)}`};
  }})})} as unknown as D1Database;
  const provider=new SharedTestCloudflareWorkers(db,
    'd'.repeat(32),'e'.repeat(32),'test-token',fetcher);
  await assert.rejects(provider.create(plan,build),/write_fenced/);
  assert.equal(writes,0);
});

test('candidate update uses the active fence and retains base identity',async()=>{
  const candidate='f'.repeat(40),digest='1'.repeat(64);
  let metadata:Record<string,any>|null=null;
  let domainsWritten=0;
  const fetcher:typeof fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname.replace(/^\/client\/v4\/accounts\/[a-f0-9]{32}/,'');
    let result:unknown={};
    if(path.endsWith('/settings'))result={tags:[`deos-test-lease:${leaseId}`,
      `deos-test-source:${service.base.sourceCommit}`,
      `deos-test-base:${service.base.deployVersion}`,
      `deos-test-build:${service.base.buildInputSha256}`]};
    else if(path==='/workers/domains') {
      if(init?.method==='PUT')domainsWritten++;
      result=[{id:'domain-1',hostname:service.canonicalHost,
        service:service.workerName,zone_id:'e'.repeat(32)}];
    } else if(path.endsWith('/assets-upload-session')) {
      const body=JSON.parse(String(init?.body));
      result={jwt:'upload-jwt',buckets:[[body.manifest['/index.html'].hash]]};
    } else if(path==='/workers/assets/upload')result={jwt:'complete-jwt'};
    else if(path===`/workers/scripts/${service.workerName}`&&init?.method==='PUT')
      metadata=JSON.parse(String((init.body as FormData).get('metadata')));
    else throw new Error(`unexpected ${path}`);
    return Response.json({success:true,result});
  };
  const db={prepare:(sql:string)=>({bind:(...args:unknown[])=>({first:async()=>{
    if(sql.includes('AS allowed')) {
      assert.ok(args.includes('active'));
      return {allowed:1};
    }
    const d1=args[3]==='d1_database';
    return {plan_state:'created',provider_key:d1?
      `deos-test-portal-db-${leaseId.slice(0,32)}`:
      `deos-test-portal-artifacts-${leaseId.slice(0,32)}`,
    remote_id:d1?'00000000-0000-4000-8000-000000000001':
      `deos-test-portal-artifacts-${leaseId.slice(0,32)}`};
  }})})} as unknown as D1Database;
  await new SharedTestCloudflareWorkers(db,'d'.repeat(32),'e'.repeat(32),
    'test-token',fetcher).deployCandidate(plan,{...build,sha256:digest},candidate);
  assert.equal(domainsWritten,0);
  assert.ok(metadata);
  const saved=metadata as Record<string,any>;
  assert.ok((saved.tags as string[]).includes(`deos-test-candidate:${candidate}`));
  assert.ok((saved.tags as string[]).includes(`deos-test-source:${service.base.sourceCommit}`));
  assert.ok((saved.bindings as Array<{name:string;text:string}>).some(value=>
    value.name==='PORTAL_SOURCE_SHA'&&value.text===candidate));
});
