import assert from 'node:assert/strict';
import test from 'node:test';
import {SharedTestCloudflareStores} from '../src/shared-test-cloudflare-stores.ts';

const account='a'.repeat(32);
const common={resourceId:'r',runId:'run',leaseId:'lease',fence:1,workId:'work'};
const d1={...common,kind:'d1_database' as const,providerKey:'deos-test-portal-db-abc'};
const r2={...common,kind:'r2_bucket' as const,providerKey:'deos-test-portal-artifacts-abc'};

test('Cloudflare store calls use exact names and keep the credential out of errors',async()=>{
  const requests:Array<{url:string;method:string;body:string|null}>=[];
  const fetcher=async(input:RequestInfo|URL,init?:RequestInit)=>{
    const url=String(input),method=init?.method??'GET';
    requests.push({url,method,body:init?.body?.toString()??null});
    assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer narrow-secret');
    if (url.includes('/d1/database?'))
      return Response.json({success:true,result:[]});
    if (url.includes('/r2/buckets/') && method==='GET')
      return Response.json({success:false,errors:[]},{status:404});
    if (url.endsWith('/d1/database'))
      return Response.json({success:true,result:{name:d1.providerKey,uuid:'db-uuid'}});
    return Response.json({success:true,result:{name:r2.providerKey}});
  };
  const provider=new SharedTestCloudflareStores(account,'narrow-secret',fetcher as typeof fetch);
  assert.equal(await provider.lookup(d1),null);
  assert.equal(await provider.lookup(r2),null);
  assert.equal(await provider.create(d1),'db-uuid');
  assert.equal(await provider.create(r2),r2.providerKey);
  assert.deepEqual(requests.map(request=>request.method),['GET','GET','POST','POST']);
  assert.equal(JSON.parse(requests[2].body!).name,d1.providerKey);
  assert.equal(JSON.parse(requests[3].body!).name,r2.providerKey);
});
