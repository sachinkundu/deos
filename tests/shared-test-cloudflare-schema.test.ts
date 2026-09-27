import assert from 'node:assert/strict';
import test from 'node:test';
import {SharedTestCloudflareSchema} from '../src/shared-test-cloudflare-schema.ts';

const leaseId='a'.repeat(64),databaseId='11111111-1111-4111-8111-111111111111';
const input={runId:'run-1',leaseId,fence:1,databaseId,
  databaseName:`deos-test-portal-db-${leaseId.slice(0,32)}`};
const migrations=new Map([
  ['migrations/0001_initial.sql',new TextEncoder().encode('CREATE TABLE example(id TEXT);')],
  ['migrations/0002_second.sql',new TextEncoder().encode('ALTER TABLE example ADD COLUMN value TEXT;')],
]);

test('applies pinned schema only to the exact lease database and reconciles readback',async()=>{
  const applied:string[]=[];let writes=0;
  const fetcher=async(url:RequestInfo|URL,init?:RequestInit)=>{
    assert.match(String(url),new RegExp(databaseId));
    if (init?.method==='GET') return Response.json({success:true,
      result:{uuid:databaseId,name:input.databaseName}});
    const sql=(JSON.parse(String(init?.body)) as {sql:string;params?:string[]}).sql;
    if (sql.startsWith('SELECT name FROM d1_migrations WHERE')) {
      const name=(JSON.parse(String(init?.body)) as {params:string[]}).params[0];
      return Response.json({success:true,result:[{success:true,
        results:applied.includes(name)?[{name}]:[]}]});
    }
    if (sql.startsWith('SELECT name FROM d1_migrations ORDER'))
      return Response.json({success:true,result:[{success:true,
        results:[...applied].sort().map(name=>({name}))}]});
    const name=sql.match(/INSERT INTO d1_migrations\(name\) VALUES \('([^']+)'\)/)?.[1];
    if (name) {writes++;applied.push(name);}
    return Response.json({success:true,result:[{success:true,results:[]}]});
  };
  const provider=new SharedTestCloudflareSchema('b'.repeat(32),'token',
    fetcher as typeof fetch);
  await provider.apply(input,migrations);
  await provider.apply(input,migrations);
  assert.equal(writes,2);
  assert.deepEqual(applied,['0001_initial.sql','0002_second.sql']);
});

test('a changed Cloudflare database identity blocks every schema write',async()=>{
  let calls=0;
  const fetcher=async()=>{calls++;return Response.json({success:true,
    result:{uuid:databaseId,name:'some-other-database'}});};
  const provider=new SharedTestCloudflareSchema('b'.repeat(32),'token',
    fetcher as typeof fetch);
  await assert.rejects(provider.apply(input,migrations),/database_identity_changed/);
  assert.equal(calls,1);
});

test('a D1 SQL failure retains its provider message',async()=>{
  const fetcher=async(_url:RequestInfo|URL,init?:RequestInit)=>init?.method==='GET'
    ? Response.json({success:true,result:{uuid:databaseId,name:input.databaseName}})
    : Response.json({success:true,result:[{success:false,
      error:'duplicate column from Cloudflare'}]});
  const provider=new SharedTestCloudflareSchema('b'.repeat(32),'token',
    fetcher as typeof fetch);
  await assert.rejects(provider.apply(input,migrations),/duplicate column from Cloudflare/);
});
