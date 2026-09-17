import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ImplementationStaticPreview,staticAssets,staticPreviewOrigin} from '../src/implementation-static-preview.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';
// @ts-ignore Runtime module is also exercised in the built container.
import {collectStaticAssets} from '../container/implementation-static-assets.mjs';

test('static collection is bounded to the dedicated build directory and rejects symlink escapes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'deos-static-'));
  try {
    await mkdir(join(root,'dist'));await writeFile(join(root,'dist/index.html'),'<h1>Actual build</h1>');
    const files=await collectStaticAssets(root,'dist');assert.equal(files.length,1);
    assert.equal(Buffer.from(files[0].contentBase64,'base64').toString(),'<h1>Actual build</h1>');
    await assert.rejects(collectStaticAssets(root,'.'),/dedicated/);
    await symlink('/etc/passwd',join(root,'dist/leak.txt'));
    await assert.rejects(collectStaticAssets(root,'dist'),/symlinks/);
    assert.throws(()=>staticAssets([{path:'../index.html',contentBase64:'YQ=='}]),/Unsupported/);
    assert.throws(()=>staticAssets([{path:'_worker.js',contentBase64:'YQ=='}]),/Unsupported/);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('trusted publication deploys only to a run-owned preview, reconciles a lost response and preserves immutable review URLs',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'author');
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  try {
    const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
      approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
      requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
    const subject={change:'sample',approvedDesignSha:work.approved_design_sha,testedBaseSha:work.tested_base_sha,treeSha:'c'.repeat(40)};
    const origin=await staticPreviewOrigin(work.run_id),project=new URL(origin).hostname.split('.')[1];
    const html='<h1>Review this build</h1>',files=[{path:'index.html',contentBase64:btoa(html)}];
    let posts=0,deployment:any=null;
    const api=(value:unknown)=>Response.json({success:true,result:value});
    const publisher=new ImplementationStaticPreview({DB:db,ARTIFACTS:bucket,IMPLEMENTATION_PREVIEW_TOKEN:'private-provider-token',IMPLEMENTATION_PREVIEW_ACCOUNT_ID:'a'.repeat(32)} as never,
      async(url,init)=>{
        const u=new URL(String(url));
        if(u.host==='1234abcd.'+project+'.pages.dev' || u.origin===origin)return new Response(html);
        assert.equal(u.origin,'https://api.cloudflare.com');
        if(u.pathname.endsWith('/upload-token'))return api({jwt:'asset-token'});
        if(u.pathname==='/client/v4/pages/assets/upload') {
          assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer asset-token');
          assert.equal(JSON.parse(String(init!.body))[0].value,btoa(html));return api({});
        }
        if(u.pathname.endsWith('/upsert-hashes'))return api({});
        if(u.pathname.endsWith('/deployments') && init?.method==='POST') {
          posts++;const form=init.body as FormData;
          assert.equal(form.get('branch'),'review');assert.equal(form.has('_worker.js'),false);
          deployment={id:'d'.repeat(32),project_id:'e'.repeat(32),project_name:project,environment:'preview',short_id:'1234abcd',
            latest_stage:{name:'deploy',status:'success'},created_on:'2026-09-16T13:00:00Z',url:`https://1234abcd.${project}.pages.dev`,
            deployment_trigger:{metadata:{branch:'review',commit_message:form.get('commit_message')}}};
          throw new Error('Lost successful deployment response');
        }
        if(u.pathname.endsWith('/deployments'))return api(deployment?[deployment]:[]);
        if(u.pathname.includes('/deployments/'))return api(deployment);
        return api({id:'e'.repeat(32),name:project,production_branch:'release-disabled'});
      });
    await assert.rejects(publisher.publish(work,'author',subject,files),/Lost successful/);
    const receipt=await publisher.publish(work,'author',subject,files);
    assert.equal(posts,1);assert.equal(receipt.origin,origin);assert.equal(receipt.subject.treeSha,subject.treeSha);
    assert.equal(receipt.deployment.url,`https://1234abcd.${project}.pages.dev`);
    assert.doesNotMatch(JSON.stringify(receipt),/private-provider-token|asset-token/);
    assert.deepEqual(await publisher.publish(work,'author',subject,files),receipt);assert.equal(posts,1);
  }finally{db.close();}
});
