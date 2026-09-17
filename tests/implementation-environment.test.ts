import assert from 'node:assert/strict';
import test from 'node:test';
import { ImplementationEnvironment, environmentBundle, environmentConfig } from '../src/implementation-environment.ts';
import { ImplementationStore } from '../src/implementation-store.ts';
import { implementationPolicy } from '../src/implementation-contract.ts';
import { ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt } from './helpers/implementation-fixture.ts';
import { environmentWorker } from '../src/implementation-environment-worker.ts';

export async function environmentFixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();seedRun(db);seedAttempt(db,'author');
  const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  const work=await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',branch:'deos/agent/SAC-172/run-1',
    approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
    requirements:{kinds:[],reasons:[],blockedProviders:[]}}, {userId:'human',revision:1},'SAC-172',1);
  db.sqlite.prepare(`INSERT INTO implementation_tries (attempt_id,run_id,try_sequence,kind,sandbox_id,status,tested_base_sha,created_at,updated_at)
    VALUES ('author','run-1',1,'build','impl-author','running',?,'now','now')`).run(work.tested_base_sha);
  const subject={change:'sample',approvedDesignSha:work.approved_design_sha,testedBaseSha:work.tested_base_sha,treeSha:'c'.repeat(40)};
  return {db,bucket,store,work,subject};
}
const bundle={code:'export default {fetch(){return new Response("fixture")}}',config:{d1:['DB'],r2:['BUCKET']}};

test('temporary environment contract rejects account/resource/secret overrides and duplicate bindings',()=>{
  assert.throws(()=>environmentConfig({d1:['DB'],r2:['DB']}),/distinct/);
  assert.throws(()=>environmentConfig({d1:['DB','OTHER']}),/At most/);
  assert.throws(()=>environmentConfig({r2:['ASSETS']}),/At most/);
  assert.throws(()=>environmentBundle({...bundle,account:'production'}),/Submit/);
  assert.throws(()=>environmentBundle({...bundle,config:{...bundle.config,databaseId:'production'}}),/Only/);
  assert.deepEqual(environmentBundle(bundle).config,bundle.config);
});

test('real SQLite intent survives lost creation/upload, ownership is scoped and cleanup confirms all provider absences',async()=>{
  const {db,bucket,work,subject}=await environmentFixture();
  let database:any=null,r2:any=null,worker:any=null,creates=0,uploads=0,lostUpload=true,purges=0;
  const calls:string[]=[];
  const api=(result:unknown)=>Response.json({success:true,result});
  const missing=()=>new Response('{"success":false}',{status:404});
  const service=new ImplementationEnvironment({DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_TOKEN:'provider-secret',IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'a'.repeat(32)} as never,
    async(url,init)=>{
      const u=new URL(String(url)),method=init?.method??'GET';calls.push(`${method} ${u.pathname}`);
      if(u.hostname.endsWith('.workers.dev')) {
        assert.notEqual((init!.headers as Record<string,string>).Authorization,'Bearer provider-secret');
        if(u.pathname.endsWith('/health'))return Response.json({digest:worker.digest,retiring:worker.retiring,d1:worker.bindings.some((b:any)=>b.type==='d1'),r2:worker.bindings.some((b:any)=>b.type==='r2_bucket')});
        if(u.pathname.endsWith('/purge')){purges++;return Response.json({empty:true});}
        return Response.json({results:[{count:1}]});
      }
      assert.equal(u.origin,'https://api.cloudflare.com');
      assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer provider-secret');
      if(u.pathname.endsWith('/d1/database')&&method==='GET')return api(database?[database]:[]);
      if(u.pathname.endsWith('/d1/database')&&method==='POST') {
        creates++;database={name:JSON.parse(String(init!.body)).name,uuid:'db-fixture'};
        throw new Error('Original lost D1 create response');
      }
      if(u.pathname.endsWith('/db-fixture')&&method==='DELETE'){database=null;return api({});}
      if(u.pathname.endsWith('/r2/buckets')&&method==='POST'){r2=JSON.parse(String(init!.body));return api(r2);}
      if(u.pathname.includes('/r2/buckets/')){if(method==='DELETE'){r2=null;return api({});}return r2?api(r2):missing();}
      if(u.pathname.endsWith('/workers/subdomain'))return api({subdomain:'tests'});
      if(u.pathname.endsWith('/settings'))return worker?api({tags:worker.tags}):missing();
      if(u.pathname.endsWith('/deployments'))return api({deployments:[{versions:[{version_id:'version-fixture',percentage:100}]}]});
      if(u.pathname.endsWith('/subdomain'))return api({enabled:true});
      if(method==='PUT') {
        uploads++;const form=init!.body as FormData,meta=JSON.parse(String(form.get('metadata')));
        assert.equal(meta.main_module,'control.mjs');
        assert.deepEqual(meta.bindings.filter((b:any)=>b.type==='d1').map((b:any)=>b.id),uploads===1?['db-fixture']:[]);
        worker={...meta,digest:meta.tags[1].slice('deos-bundle:'.length),retiring:!form.has('app.mjs')};
        if(lostUpload){lostUpload=false;throw new Error('Original lost Worker upload response');}
        return api({});
      }
      if(method==='DELETE'){worker=null;return api({});}
      throw new Error(`Unexpected fake provider call ${method} ${u.pathname}`);
    });
  try {
    await assert.rejects(service.publish(work,'author',subject,bundle),/Original lost Worker/);
    const receipt=await service.publish(work,'author',subject,bundle);
    assert.equal(creates,1);assert.equal(uploads,1);assert.equal(receipt.target,'remote');
    assert.equal((await service.row('author'))?.state,'ready');
    assert.doesNotMatch(JSON.stringify(receipt),/provider-secret|__DEOS_CONTROL/);
    await assert.rejects(service.origin('another-run','author'),/ownership/);
    await assert.rejects(service.publish(work,'author',subject,{...bundle,config:{d1:['OTHER'],r2:['BUCKET']}}),/Bindings are fixed/);
    await assert.rejects(service.inspect(work.run_id,'author',{operation:'query',sql:'SELECT 1; DELETE FROM snippets'}),/one SELECT/);
    await assert.rejects(service.inspect(work.run_id,'author',{operation:'request',method:'GET',path:'//production.example/'}),/this app/);
    await assert.rejects(service.cleanup((await service.row('author'))!),/active/);
    db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='author'").run();
    await service.cleanupRun(work.run_id);
    assert.equal(purges,1);assert.equal(database,null);assert.equal(r2,null);assert.equal(worker,null);
    const row=db.sqlite.prepare('SELECT state,cleanup_receipt FROM implementation_environments').get()!;
    assert.equal(row.state,'destroyed');assert.deepEqual(JSON.parse(String(row.cleanup_receipt)).absent,{d1:true,r2:true,worker:true});
    const before=calls.length;await service.cleanupRun(work.run_id);assert.equal(calls.length,before);
    assert.ok(bucket.objects.size>0,'durable evidence survives app cleanup');
  }finally{db.close();}
});

test('trusted management route enforces authentication and idempotent atomic D1 migrations',async()=>{
  const {db}=await environmentFixture();
  try {
    const source=environmentWorker({d1:['DB'],r2:[]},'fixture');
    const {default:worker}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    const env={DB:db,__DEOS_CONTROL:'local-management-token'};
    assert.equal((await worker.fetch(new Request('https://app/__deos/health'),env,{})).status,404);
    const call=(body:unknown)=>worker.fetch(new Request('https://app/__deos/migrate',{method:'POST',headers:{Authorization:'Bearer local-management-token'},body:JSON.stringify(body)}),env,{});
    const migration={id:'001',digest:'abc',statements:['CREATE TABLE sample (id TEXT PRIMARY KEY)','INSERT INTO sample VALUES (\'one\')']};
    assert.equal((await (await call(migration)).json()).reused,false);
    assert.equal((await (await call(migration)).json()).reused,true);
    assert.equal((await call({...migration,digest:'changed'})).status,409);
    await assert.rejects(call({id:'002',digest:'bad',statements:["INSERT INTO sample VALUES ('two')",'INSERT INTO missing VALUES (1)']}),/no such table/);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS count FROM sample').get()!.count,1);
    assert.equal(db.sqlite.prepare("SELECT count(*) AS count FROM __deos_migrations WHERE id='002'").get()!.count,0);
  }finally{db.close();}
});

test('ambiguous creation is quarantined without duplicate creation or false cleanup; definite denial retains the original error',async()=>{
  for(const status of [500,403]) {
    const {db,bucket,work,subject}=await environmentFixture();let creates=0;
    const service=new ImplementationEnvironment({DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_TOKEN:'provider-secret',IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'a'.repeat(32)} as never,
      async(_url,init)=>{
        if(init?.method==='POST'){creates++;return new Response(JSON.stringify({success:false,errors:[{message:'original provider failure provider-secret'}]}),{status});}
        return Response.json({success:true,result:[]});
      });
    try {
      await assert.rejects(service.publish(work,'author',subject,bundle),error=>{
        assert.match(String(error),/original provider failure \[redacted\]/);assert.doesNotMatch(String(error),/provider-secret/);return true;
      });
      if(status===500) {
        await assert.rejects(service.publish(work,'author',subject,bundle),/creation outcome is uncertain/);
        assert.equal(creates,1);
      }
      db.sqlite.prepare("UPDATE agent_attempts SET state='failed' WHERE attempt_id='author'").run();
      if(status===500) {
        await assert.rejects(service.cleanupRun(work.run_id),/creation is still uncertain/);
        assert.equal((await service.row('author'))?.state,'retiring');
      } else {
        await service.cleanupRun(work.run_id);
        assert.equal((await service.row('author'))?.state,'destroyed');
      }
    }finally{db.close();}
  }
});
