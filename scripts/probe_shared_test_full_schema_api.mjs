/** Applies the whole pinned SQL sequence to a disposable lease-shaped D1. */
import {readFileSync,readdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {SharedTestCloudflareSchema} from '../src/shared-test-cloudflare-schema.ts';

const account='c68856288112af7698f5be52ea94b96e';
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
const token=process.env.CLOUDFLARE_API_TOKEN ?? readFileSync('/Users/sachin/code/deos/.env','utf8')
  .split('\n').find(line=>line.startsWith('CLOUDFLARE_TOKEN='))
  ?.slice('CLOUDFLARE_TOKEN='.length).trim().replace(/^["']|["']$/g,'');
if(!token)throw new Error('Cloudflare token unavailable');
const leaseId=randomBytes(32).toString('hex');
const name=`deos-test-portal-db-${leaseId.slice(0,32)}`;

async function api(method,path,payload) {
  const response=await fetch(root+path,{method,headers:{Authorization:`Bearer ${token}`,
    ...(payload===undefined?{}:{'Content-Type':'application/json'})},
    body:payload===undefined?undefined:JSON.stringify(payload),
    signal:AbortSignal.timeout(30_000)});
  const raw=await response.text();
  if(!response.ok)throw new Error(`Cloudflare ${method} ${path}: `+
    `HTTP ${response.status} ${raw.replaceAll(token,'[redacted]')}`);
  const result=JSON.parse(raw);
  if(result.success!==true)throw new Error(`Cloudflare ${method} ${path}: `+
    JSON.stringify(result.errors).replaceAll(token,'[redacted]'));
  return result.result;
}

let databaseId;
try {
  const created=await api('POST','',{name});
  if(created.name!==name)throw new Error('D1 create name changed');
  databaseId=created.uuid;
  console.log('create','confirmed');
  const migrations=new Map(readdirSync('migrations').filter(file=>file.endsWith('.sql'))
    .sort().map(file=>[`migrations/${file}`,new Uint8Array(readFileSync(`migrations/${file}`))]));
  await new SharedTestCloudflareSchema(account,token).apply({runId:'probe',leaseId,
    fence:1,databaseId,databaseName:name},migrations,async()=>{});
  console.log('full_schema_readback',`${migrations.size}_migrations_confirmed`);
} finally {
  if(databaseId) {
    await api('DELETE',`/${databaseId}`);
    for(let read=0;read<2;read++) {
      const matches=await api('GET',`?name=${name}`);
      if(matches.length)throw new Error('Disposable D1 remains after delete');
    }
    console.log('delete_absence','confirmed_twice');
  }
}
