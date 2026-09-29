import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket} from './helpers/implementation-fixture.ts';
import {snapshotBlockedSetup} from '../src/shared-test-setup-snapshot.ts';

test('blocked setup preserves database and binary object bytes before owned cleanup',async()=>{
  const lease='a'.repeat(64),suffix=lease.slice(0,32),id='11111111-1111-4111-8111-111111111111';
  const bucket=new ImplementationTestBucket();let active=false,foreign=false;
  const resources=[{kind:'d1_database',provider_key:`deos-test-portal-db-${suffix}`,remote_id:id},
    {kind:'r2_bucket',provider_key:`deos-test-portal-artifacts-${suffix}`,remote_id:`deos-test-portal-artifacts-${suffix}`}];
  const db={prepare:(sql:string)=>({bind:()=>({first:async()=>active?null:{ready:1},
    all:async()=>({results:resources})})})};
  const env={DB:db,ARTIFACTS:bucket,IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID:'b'.repeat(32),
    IMPLEMENTATION_ENVIRONMENT_TOKEN:'private-token'} as unknown as Env;
  let requests=0;
  const provider=async(input:RequestInfo|URL,init?:RequestInit)=>{
    requests++;const path=new URL(String(input)).pathname;
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer private-token');
    if(path.endsWith('/d1/database/'+id))return Response.json({success:true,result:{uuid:id,
      name:foreign?'production':resources[0].provider_key}});
    if(path.endsWith('/query')) {
      const sql=JSON.parse(String(init?.body)).sql;
      assert.match(sql,/^SELECT /);
      return Response.json({success:true,result:[{success:true,results:sql.includes('sqlite_master')
        ?[{name:'accounts',sql:'CREATE TABLE accounts(id TEXT)'}]:[{id:'saved-setting'}]}]});
    }
    if(path.endsWith('/objects'))return Response.json({success:true,result:[{key:'private.bin',size:4}]});
    assert.ok(path.endsWith('/objects/private.bin'));
    return new Response(new Uint8Array([0,255,7,128]));
  };
  const saved=await snapshotBlockedSetup(env,'run',lease,provider);
  assert.equal(saved?.snapshots.length,2);
  assert.equal(bucket.objects.size,2);
  assert.ok([...bucket.objects.values()].some(value=>Buffer.from(value).equals(Buffer.from([0,255,7,128]))));
  const before=requests;active=true;
  await assert.rejects(snapshotBlockedSetup(env,'run',lease,provider),/not_quiescent/);
  assert.equal(requests,before);
  active=false;foreign=true;
  await assert.rejects(snapshotBlockedSetup(env,'run',lease,provider),/identity_changed/);
  assert.equal(bucket.objects.size,2);
});
