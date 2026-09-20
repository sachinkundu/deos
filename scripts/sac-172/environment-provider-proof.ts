// Real provider capability probe. Durable local allocation state permits cleanup
// after interruption. No DEOS production data is modified by this script.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {ImplementationTestDatabase,ImplementationTestBucket,seedRun,seedAttempt} from '../../tests/helpers/implementation-fixture.ts';
import {ImplementationEnvironment} from '../../src/implementation-environment.ts';
import {ImplementationStore} from '../../src/implementation-store.ts';
import {implementationPolicy} from '../../src/implementation-contract.ts';

const directory=resolve(process.argv[2]??'/tmp/deos-environment-provider-proof');
await mkdir(directory,{recursive:true,mode:0o700});
process.loadEnvFile('/Users/sachin/code/deos/.env');
const token=process.env.CLOUDFLARE_API_TOKEN??process.env.CLOUDFLARE_TOKEN;
if(!token)throw new Error('CLOUDFLARE_API_TOKEN is missing');
const account='c68856288112af7698f5be52ea94b96e';
const db=new ImplementationTestDatabase(join(directory,'state.sqlite'));
class DiskBucket extends ImplementationTestBucket {
  async put(key:string,value:string|Uint8Array) {
    const path=join(directory,'artifacts',createHash('sha256').update(key).digest('hex'));
    await mkdir(join(directory,'artifacts'),{recursive:true,mode:0o700});await writeFile(path,value,{mode:0o600});return {};
  }
  async get(key:string) {
    let bytes:Uint8Array;
    try {bytes=await readFile(join(directory,'artifacts',createHash('sha256').update(key).digest('hex')));}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
    return {arrayBuffer:async()=>new Uint8Array(bytes).buffer,text:async()=>new TextDecoder().decode(bytes)};
  }
}
const bucket=new DiskBucket(),store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
let identity=db.sqlite.prepare('SELECT run_id FROM orchestration_runs LIMIT 1').get() as {run_id:string}|undefined;
if(!identity) {
  const runId=`provider-probe-${crypto.randomUUID()}`;seedRun(db,runId,runId);seedAttempt(db,'probe',runId);identity={run_id:runId};
  await store.allocate({version:1,runId,repository:'sachinkundu/deos',change:'environment-provider-probe',branch:'codex/temporary-cloudflare-environments',
    approvedDesignSha:'a'.repeat(40),testedBaseSha:'b'.repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
    {userId:'supervisor',revision:1},'environment-provider-probe',1);
  db.sqlite.prepare(`INSERT INTO implementation_tries (attempt_id,run_id,try_sequence,kind,sandbox_id,status,tested_base_sha,created_at,updated_at)
    VALUES ('probe',?,1,'build','probe','running',?,'now','now')`).run(runId,'b'.repeat(40));
}
const service=new ImplementationEnvironment({DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_TOKEN:token,IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:account} as never);
const work=await store.requireRun(identity.run_id);
const subject={change:work.change_id,approvedDesignSha:work.approved_design_sha,testedBaseSha:work.tested_base_sha,treeSha:'c'.repeat(40)};
const events:unknown[]=[];
const record=async(value:unknown)=>{events.push(value);await writeFile(join(directory,'evidence.json'),JSON.stringify(events,null,2));console.log(JSON.stringify(value));};
let primary:unknown;
try {
  // Read the authoritative live attempt inventory; never use it as app storage.
  const active=await service.api(`/accounts/${account}/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query`,service.json('POST',{
    sql:"SELECT attempt_id,node_id,state FROM agent_attempts WHERE state IN ('pending','starting','running','collecting')",params:[]}));
  await record({event:'production_read_only_preflight',activeAttempts:active});
  if(process.argv.includes('--cleanup-only')) {
    await record({event:'cleanup_only'});
  } else {
    const receipt=await service.publish(work,'probe',subject,{config:{d1:['DB'],r2:['BUCKET']},code:`export default {async fetch(request,env){
      if(request.method==='POST'){await env.DB.prepare('INSERT INTO probe VALUES (?,?)').bind('one','fixture').run();await env.BUCKET.put('one','real-r2-fixture');return Response.json({saved:true});}
      if(request.method==='DELETE'){await env.DB.prepare('DELETE FROM probe WHERE id=?').bind('one').run();await env.BUCKET.delete('one');return Response.json({deleted:true});}
      const row=await env.DB.prepare('SELECT * FROM probe WHERE id=?').bind('one').first();const body=await env.BUCKET.get('one');return Response.json({row,text:body?await body.text():null});}}`});
    await record({event:'published',receipt});
    await record(await service.inspect(work.run_id,'probe',{operation:'migrate',id:'001',statements:['CREATE TABLE probe(id TEXT PRIMARY KEY,value TEXT)']}));
    const results:any[]=[];
    for(const operation of [
      {operation:'request',method:'POST',path:'/'},
      {operation:'query',sql:'SELECT * FROM probe'},
      {operation:'object',key:'one'},
      {operation:'request',method:'GET',path:'/'},
      {operation:'request',method:'DELETE',path:'/'},
      {operation:'query',sql:'SELECT * FROM probe'},
      {operation:'object',key:'one'},
    ]) {const value=await service.inspect(work.run_id,'probe',operation);results.push(value.result);await record(value);}
    assert.equal(results[0].status,200);
    assert.equal(results[1].results[0].value,'fixture');
    assert.equal(Buffer.from(results[2].contentBase64,'base64').toString(),'real-r2-fixture');
    assert.equal(JSON.parse(results[3].body).text,'real-r2-fixture');
    assert.equal(results[4].status,200);assert.deepEqual(results[5].results,[]);assert.equal(results[6].absent,true);
    await record({event:'assertions_passed',checks:['remote D1 insert/read/delete','remote R2 put/get/delete','app reaches both bindings']});
  }
}catch(error){primary=error;await record({event:'failure',message:String(error),stack:(error as Error).stack});}
finally {
  db.sqlite.prepare("UPDATE agent_attempts SET state='completed' WHERE attempt_id='probe'").run();
  try {await service.cleanupRun(work.run_id);await record({event:'cleanup',rows:db.sqlite.prepare('SELECT name,state,cleanup_receipt FROM implementation_environments').all()});}
  catch(error){await record({event:'cleanup_failure',message:String(error),stack:(error as Error).stack});primary=primary?new AggregateError([primary,error],'Probe and cleanup failed',{cause:primary}):error;}
  db.close();
}
if(primary)throw primary;
