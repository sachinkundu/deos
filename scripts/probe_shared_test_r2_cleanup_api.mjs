/** Disposable R2 cleanup probe for nested object keys and absence readback. */
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {SharedTestCloudflareStores} from '../src/shared-test-cloudflare-stores.ts';

const account='c68856288112af7698f5be52ea94b96e';
const token=process.env.CLOUDFLARE_API_TOKEN ?? readFileSync('/Users/sachin/code/deos/.env','utf8')
  .split('\n').find(line=>line.startsWith('CLOUDFLARE_TOKEN='))
  ?.slice('CLOUDFLARE_TOKEN='.length).trim().replace(/^["']|["']$/g,'');
if(!token)throw new Error('Cloudflare token unavailable');
const name=`deos-test-r2-probe-${randomBytes(6).toString('hex')}`;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${name}`;

async function call(url,init={}) {
  const response=await fetch(url,{...init,headers:{...init.headers,
    Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30_000)});
  const raw=await response.text();
  if(!response.ok)throw new Error(`Cloudflare ${init.method??'GET'} ${url}: `+
    `HTTP ${response.status} ${raw.replaceAll(token,'[redacted]')}`);
  const body=JSON.parse(raw);
  if(body.success!==true)throw new Error(`Cloudflare ${init.method??'GET'} ${url}: `+
    JSON.stringify(body.errors).replaceAll(token,'[redacted]'));
  return body.result;
}

let created=false;
try {
  const bucket=await call(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});
  if(bucket.name!==name)throw new Error('R2 bucket identity changed');
  created=true;
  console.log('bucket_create','confirmed');
  const object=await call(`${root}/objects/nested/check.txt`,{
    method:'PUT',headers:{'Content-Type':'text/plain'},body:'probe'});
  if(object?.key!=='nested/check.txt')throw new Error('R2 object key changed');
  console.log('nested_object_upload','confirmed');
  const provider=new SharedTestCloudflareStores(account,token);
  const plan={resourceId:'probe',runId:'probe',leaseId:'probe',fence:1,
    kind:'r2_bucket',providerKey:name,workId:'probe'};
  await provider.remove(plan,name);
  created=false;
  console.log('object_and_bucket_cleanup','confirmed');
  for(let read=0;read<2;read++) {
    if(await provider.lookup(plan)!==null)throw new Error('R2 bucket remains');
  }
  console.log('delete_absence','confirmed_twice');
} finally {
  if(created) {
    const provider=new SharedTestCloudflareStores(account,token);
    const plan={resourceId:'probe',runId:'probe',leaseId:'probe',fence:1,
      kind:'r2_bucket',providerKey:name,workId:'probe'};
    await provider.remove(plan,name);
  }
}
