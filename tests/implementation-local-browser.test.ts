import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationStore} from '../src/implementation-store.ts';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {localBrowserTarget,ownedBrowserDestination,checkedLocalCapture} from '../src/implementation-local-browser.ts';
import {sha256Hex} from '../src/implementation-hash.ts';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from './helpers/implementation-fixture.ts';

async function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  seedRun(db);seedAttempt(db,'attempt');
  const store=new ImplementationStore(db as never,bucket as never);
  const subject={change:'sample',approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),treeSha:'c'.repeat(40)};
  const input={version:1 as const,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
    approvedDesignSha:subject.approvedDesignSha,testedBaseSha:subject.testedBaseSha,
    policy:{...implementationPolicy,safeAdapters:['temporary-environment-v1']},approvedFiles:[],issue:{},receipts:{},
    requirements:{kinds:[],reasons:[],blockedProviders:[]}};
  const work=await store.allocate(input,{userId:'human',revision:1},'SAC-172',1);
  await store.beginTry(work,{attempt_id:'attempt',sandbox_id:'impl-attempt',visit_sequence:1},'build');
  const name=`deos-tmp-${(await sha256Hex('run-1:attempt')).slice(0,24)}`;
  const origin=`https://${name}.fixture.workers.dev`;
  db.sqlite.prepare(`INSERT INTO implementation_environments
    (attempt_id,run_id,name,account_id,config_json,state,origin,receipt_sha,created_at,updated_at)
    VALUES ('attempt','run-1',?,?,'{"d1":[],"r2":[]}','ready',?,?,'now','now')`)
    .run(name,'a'.repeat(32),origin,'e'.repeat(64));
  const env={DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_TOKEN:'fixture-only',IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'a'.repeat(32)} as unknown as Env;
  return {db,bucket,store,subject,input,work,origin,env};
}

test('local browser uses owned targets; destroyed environments, another attempt and host lookalikes are denied',async()=>{
  const f=await fixture();
  try {
    assert.equal((await localBrowserTarget(f.env,f.work,f.input,'attempt',f.subject,'local')).origin,'http://127.0.0.1:8787');
    assert.equal((await localBrowserTarget(f.env,f.work,f.input,'attempt',f.subject,'remote')).origin,f.origin);
    assert.equal(await ownedBrowserDestination(f.env,'run-1','attempt',new URL(f.origin+'/api/snippets')),true);
    for (const url of [f.origin.replace('https:','http:'),f.origin+':8443',f.origin+'.evil.example','https://api.cloudflare.com/',f.origin.replace('https://','https://user@')])
      assert.equal(await ownedBrowserDestination(f.env,'run-1','attempt',new URL(url)),false);
    assert.equal(await ownedBrowserDestination(f.env,'run-1','other',new URL(f.origin)),false);
    f.db.sqlite.prepare("UPDATE implementation_environments SET state='destroyed'").run();
    assert.equal(await ownedBrowserDestination(f.env,'run-1','attempt',new URL(f.origin)),false);
    await assert.rejects(localBrowserTarget(f.env,f.work,f.input,'attempt',f.subject,'remote'),/Publish/);
  } finally {f.db.close();}
});

test('trusted local capture keeps immutable subject-bound R2 proof without allocating a service browser or relay',async()=>{
  const f=await fixture();
  const dir=await mkdtemp(join(tmpdir(),'local-browser-broker-'));
  try {
    const source=(await readFile('src/implementation-broker.ts','utf8'))
      .replace('import { getSandbox } from "@cloudflare/sandbox";', 'const getSandbox = (): never => { throw new Error("Local capture must not allocate a Sandbox"); };')
      .replaceAll(/from "\.\/(.*?)"/g,(_match,path)=>`from ${JSON.stringify(pathToFileURL(resolve('src',path)).href)}`);
    const file=join(dir,'broker.ts');await writeFile(file,source);
    const {ImplementationBroker}=await import(pathToFileURL(file).href);
    const broker=new ImplementationBroker(f.env);
    const claims={runId:'run-1',attemptId:'attempt',actions:['implementation.tools']} as never;
    const bytes=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),Buffer.alloc(24)]);
    const capture={url:'http://127.0.0.1:8787/',documentStatus:200,transport:'sandbox-local-chromium',imageBase64:bytes.toString('base64')};
    const request={action:'local_browser_capture',target:'local',subject:f.subject,capture,caption:'Observed state',captureId:'collection:one:1'};
    const response=await broker.handle(claims,request);assert.equal(response.status,200,await response.clone().text());
    const result=await response.json() as any;assert.equal(result.proof.kind,'browser_image');
    assert.equal(result.proof.treeSha,f.subject.treeSha);
    assert.deepEqual(Buffer.from(f.bucket.objects.get(result.proof.path) ?? []),bytes);
    assert.equal(await f.store.resource('attempt','browser'),null);assert.equal(await f.store.resource('attempt','preview'),null);
    assert.throws(()=>checkedLocalCapture({...capture,url:'http://127.0.0.1:8790/'},'http://127.0.0.1:8787'),/assigned/);
    assert.throws(()=>checkedLocalCapture({...capture,documentStatus:530},'http://127.0.0.1:8787'),/successful/);
    assert.throws(()=>checkedLocalCapture({...capture,imageBase64:'bm90LWltYWdl'},'http://127.0.0.1:8787'),/PNG/);
    const stale=await broker.handle(claims,{...request,subject:{...f.subject,approvedDesignSha:'9'.repeat(40)}});assert.equal(stale.status,400);
    f.db.sqlite.prepare("UPDATE agent_attempts SET state='completed'").run();
    assert.equal((await broker.handle(claims,request)).status,400);
  } finally {f.db.close();await rm(dir,{recursive:true,force:true});}
});
