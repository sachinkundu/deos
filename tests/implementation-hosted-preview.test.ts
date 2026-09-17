import assert from 'node:assert/strict';
import test from 'node:test';
import { ImplementationHostedPreview, validateHostedPreviewRequest, checkedPagesDeployment, hostedPreviewOrigin, checkHostedAssets } from '../src/implementation-hosted-preview.ts';
import { ImplementationStore } from '../src/implementation-store.ts';
import { implementationPolicy } from '../src/implementation-contract.ts';
import { sha256Hex } from '../src/implementation-hash.ts';
import { ImplementationDemoService } from '../src/implementation-demo.ts';
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from './helpers/implementation-fixture.ts';

async function fixture() {
  const db = new ImplementationTestDatabase(), bucket = new ImplementationTestBucket();
  seedRun(db);
  const store = new ImplementationStore(db as unknown as D1Database, bucket as unknown as R2Bucket);
  const work = await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
    approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,
    approvedFiles:[{path:'openspec/changes/sample/specs/calculator/spec.md',content:'### Requirement: Show the calculator',sha256:'2'.repeat(64)}],issue:{},receipts:{},
    requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1}, 'SAC-172', 1);
  const candidate = await store.put('run-1','candidate.json',JSON.stringify({kind:'build',treeSha:'c'.repeat(40)}));
  db.sqlite.prepare('UPDATE implementation_runs SET candidate_key=?,candidate_sha=?,tree_sha=?').run(candidate.key,candidate.sha256,'c'.repeat(40));
  db.sqlite.prepare("UPDATE orchestration_runs SET status='failed',current_node='implementation_failed'").run();
  const html = '<!doctype html><title>Calculator</title><output>3</output>';
  const request = {version:1 as const,runId:'run-1',inputSha:work.input_sha,candidateSha:candidate.sha256,treeSha:'c'.repeat(40),requestedBy:'maintainer',
    accountId:'d'.repeat(32),projectId:'e'.repeat(32),projectName:'calculator',deploymentId:'f'.repeat(32),branch:'review',
    build:{treeSha:'c'.repeat(40),baseSha:'b'.repeat(40),command:'npm run build',logSha256:'1'.repeat(64)},
    assets:[{path:'index.html',bytes:new TextEncoder().encode(html).length,sha256:await sha256Hex(html)}]};
  const deployment = {id:request.deploymentId,project_id:request.projectId,project_name:request.projectName,environment:'preview',short_id:'a1b2c3d4',
    latest_stage:{name:'deploy',status:'success'},created_on:'2026-09-16T00:00:00Z',deployment_trigger:{metadata:{branch:'review'}},
    url:'https://a1b2c3d4.calculator.pages.dev',env_vars:{SECRET:{value:'must-not-be-saved'}},build_config:{web_analytics_token:'must-not-be-saved'}};
  const requests: Array<{url:string;init:RequestInit|undefined}> = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url=String(input); requests.push({url,init});
    if (init?.redirect === 'error') throw new TypeError('Workers does not support redirect: error');
    return url.startsWith('https://api.cloudflare.com/') ? Response.json({success:true,result:deployment}) : new Response(html);
  }) as typeof fetch;
  const env={DB:db as unknown as D1Database,ARTIFACTS:bucket as unknown as R2Bucket,IMPLEMENTATION_PAGES_READ_TOKEN:'private-pages-token'};
  return {db,bucket,store,request,deployment,html,requests,env,fetcher,service:new ImplementationHostedPreview(env,fetcher)};
}

test('maintainer registration reads the provider and actual assets, retains an immutable receipt and changes no workflow state', async()=>{
  const f=await fixture();
  try {
    const first=await f.service.register(f.request), again=await f.service.register(f.request);
    assert.deepEqual(again,first);
    assert.equal(first.provenance,'maintainer_deployed_static_preview');
    assert.equal(first.assets[0].sha256,f.request.assets[0].sha256);
    assert.equal(f.requests[0].init?.headers && (f.requests[0].init.headers as Record<string,string>).Authorization,'Bearer private-pages-token');
    assert.equal(f.requests[1].url,`${first.origin}/`);
    assert.equal((f.requests[1].init?.headers as Record<string,string>).Authorization,undefined);
    const rows=f.db.sqlite.prepare('SELECT * FROM implementation_hosted_previews').all();assert.equal(rows.length,1);
    assert.throws(()=>f.db.sqlite.prepare("UPDATE implementation_hosted_previews SET tree_sha='changed'").run(),/immutable/);
    const saved=await f.service.latest(await f.store.requireRun('run-1'));assert.deepEqual(saved,first);
    for (const value of f.bucket.objects.values()) assert.doesNotMatch(new TextDecoder().decode(value),/private-pages-token|must-not-be-saved/);
    assert.deepEqual(f.db.sqlite.prepare('SELECT status,current_node FROM orchestration_runs').get(),Object.assign(Object.create(null),{status:'failed',current_node:'implementation_failed'}));
    assert.equal(hostedPreviewOrigin(first,first.subject),first.origin);
    assert.equal(hostedPreviewOrigin(first,{...first.subject,treeSha:'9'.repeat(40)}),first.origin);
    assert.equal(hostedPreviewOrigin(first,{...first.subject,testedBaseSha:'9'.repeat(40)}),first.origin);
    assert.throws(()=>hostedPreviewOrigin(null,first.subject),/No checked/);
    assert.equal(await f.service.latest({...await f.store.requireRun('run-1'),run_id:'other'}),null);
    assert.equal(await f.service.latest({...await f.store.requireRun('run-1'),input_sha:'0'.repeat(64)}),null);
  } finally {f.db.close();}
});

test('registration rejects stale code, active runs, malformed paths, production and aliases before author access', async()=>{
  const f=await fixture();
  try {
    for (const field of ['inputSha','candidateSha'] as const)
      await assert.rejects(f.service.register({...f.request,[field]:'0'.repeat(64)}),/saved candidate/);
    await assert.rejects(f.service.register({...f.request,treeSha:'9'.repeat(40),build:{...f.request.build,treeSha:'9'.repeat(40)}}),/saved candidate/);
    await assert.rejects(new ImplementationHostedPreview({...f.env,IMPLEMENTATION_PAGES_READ_TOKEN:undefined},f.fetcher).register(f.request),/not configured/);
    seedAttempt(f.db,'active');
    await assert.rejects(f.service.register(f.request),/no active attempt/);
    assert.equal(f.requests.length,0);
    for (const path of ['../index.html','//other/index.html','assets/../index.html','index.html?x','index.html#x','index%2ehtml'])
      assert.throws(()=>validateHostedPreviewRequest({...f.request,assets:[{...f.request.assets[0],path}]}),/static asset/);
    assert.throws(()=>validateHostedPreviewRequest({...f.request,token:'secret'}),/Unexpected/);
    assert.throws(()=>validateHostedPreviewRequest({...f.request,assets:[...f.request.assets,...f.request.assets]}),/duplicate/);
    assert.throws(()=>checkedPagesDeployment({...f.deployment,environment:'production'},f.request),/successful preview/);
    assert.throws(()=>checkedPagesDeployment({...f.deployment,url:'https://review.calculator.pages.dev'},f.request),/immutable/);
    assert.throws(()=>checkedPagesDeployment({...f.deployment,project_id:'0'.repeat(32)},f.request),/successful preview/);
    assert.throws(()=>checkedPagesDeployment({...f.deployment,latest_stage:{name:'deploy',status:'failure'}},f.request),/successful preview/);
    assert.throws(()=>checkedPagesDeployment({...f.deployment,deployment_trigger:{metadata:{branch:'main'}}},f.request),/successful preview/);
  } finally {f.db.close();}
});

test('changed bytes, redirects, provider failure and a run starting during read-back never grant a hosted preview', async()=>{
  for (const mode of ['bytes','redirect','provider-redirect','provider','race']) {
    const f=await fixture();
    try {
      const fetcher = (async(input:RequestInfo|URL,init?:RequestInit)=>{
        if(String(input).startsWith('https://api.cloudflare.com/')) {
          if(mode==='provider-redirect') {
            assert.equal(init?.redirect,'manual');
            return new Response('Redirect response is not JSON',{status:302,headers:{Location:'https://elsewhere.example/'}});
          }
          if(mode==='provider')return Response.json({success:false,errors:[{code:9109,message:'permission denied'}]},{status:403});
          return f.fetcher(input,init);
        }
        if(mode==='race')seedAttempt(f.db,'racing');
        return mode==='bytes'?new Response(f.html.replace('3','4')):mode==='redirect'?new Response(null,{status:302,headers:{Location:'https://elsewhere.example/'}}):new Response(f.html);
      }) as typeof fetch;
      await assert.rejects(new ImplementationHostedPreview(f.env,fetcher).register(f.request),
        mode==='bytes'?/does not match/:mode==='redirect'?/HTTP 302/:mode==='provider-redirect'?/HTTP 302; redirects are not allowed/:mode==='provider'?/9109.*permission denied/:/Run changed/);
      assert.equal(f.db.sqlite.prepare('SELECT count(*) n FROM implementation_hosted_previews').get()!.n,0);
    } finally {f.db.close();}
  }
});

test('demo planning gets the checked hosted receipt and actual browser capability without treating registration as demo proof',async()=>{
  const f=await fixture();
  try {
    const receipt=await f.service.register(f.request);
    const run=f.db.sqlite.prepare('SELECT * FROM orchestration_runs').get();
    const output=await new ImplementationDemoService(f.env.DB,f.env.ARTIFACTS).materialize(run as never,{reviewKind:'demo_plan'} as never,
      {context:JSON.stringify({issue:{}})} as never);
    const context=JSON.parse(output.context).demo;
    const hosted=context.sources.find((source:{path:string})=>source.path==='context/hosted-preview.json');
    assert.equal(JSON.parse(hosted.content).registrationId,receipt.registrationId);
    assert.equal(hosted.sha256,await sha256Hex(hosted.content));
    assert.equal(context.evidence.length,0,'Registration does not fabricate browser or provider-originated proof');
    const runtime=JSON.parse(context.sources.find((source:{path:string})=>source.path==='context/runtime-capabilities.json').content);
    assert.match(runtime.browser.navigation,/target: hosted/);
    assert.equal(runtime.browser.sessionsPerAttempt,1);
  } finally {f.db.close();}
});

test('Pages clean-URL redirects stay on the immutable origin and still require exact bytes',async()=>{
  const origin='https://a1b2c3d4.calculator.pages.dev', html='<h1>Probe</h1>';
  const assets=[{path:'probe.html',bytes:Buffer.byteLength(html),sha256:await sha256Hex(html)}];
  const seen:string[]=[];
  const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
    seen.push(String(input));assert.equal(init?.redirect,'manual');
    assert.equal((init?.headers as Record<string,string>).Authorization,undefined);
    return String(input).endsWith('.html')?new Response(null,{status:308,headers:{Location:'/probe'}}):new Response(html);
  }) as typeof fetch;
  const result=await checkHostedAssets(origin,assets,fetcher);
  assert.deepEqual(seen,[origin+'/probe.html',origin+'/probe']);assert.equal(result[0].url,origin+'/probe');
  let calls=0;
  await assert.rejects(checkHostedAssets(origin,assets,(async()=>{calls++;return new Response(null,{status:308,headers:{Location:'/loop'}});}) as typeof fetch),/excessive redirect/);
  assert.equal(calls,4);
  await assert.rejects(checkHostedAssets(origin,assets,(async(input:RequestInfo|URL)=>String(input).endsWith('.html')
    ?new Response(null,{status:308,headers:{Location:'/probe'}}):new Response('<h1>Wrong</h1>')) as typeof fetch),/does not match|exceeds/);
});
