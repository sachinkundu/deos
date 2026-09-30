/** Disposable provider contract probe. No custom domain or application data. */
import {readFileSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';

const account='c68856288112af7698f5be52ea94b96e';
const name=`deos-test-worker-probe-${randomBytes(6).toString('hex')}`;
const root=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const token=process.env.CLOUDFLARE_API_TOKEN ?? readFileSync('/Users/sachin/code/deos/.env','utf8')
  .split('\n').find(line=>line.startsWith('CLOUDFLARE_TOKEN='))
  ?.slice('CLOUDFLARE_TOKEN='.length).trim().replace(/^["']|["']$/g,'');
if(!token)throw new Error('Cloudflare token unavailable');

async function api(path,init={},bearer=token,missing=false) {
  const response=await fetch(root+path,{...init,headers:{...init.headers,
    Authorization:`Bearer ${bearer}`},signal:AbortSignal.timeout(30_000)});
  if(missing&&response.status===404)return null;
  const raw=await response.text();
  if(!response.ok)throw new Error(`Cloudflare ${init.method??'GET'} ${path}: `+
    `HTTP ${response.status} ${raw.replaceAll(token,'[redacted]').replaceAll(bearer,'[redacted]')}`);
  const body=JSON.parse(raw);
  if(body.success!==true)throw new Error(`Cloudflare ${init.method??'GET'} ${path}: `+
    JSON.stringify(body.errors).replaceAll(token,'[redacted]').replaceAll(bearer,'[redacted]'));
  return body.result;
}

try {
  const content=Buffer.from('<html>probe</html>');
  const hash=createHash('sha256').update(content.toString('base64')+'html')
    .digest('hex').slice(0,32);
  const session=await api(`/workers/scripts/${name}/assets-upload-session`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({manifest:{'/index.html':{hash,size:content.length}}}),
  });
  if(typeof session?.jwt!=='string'||!Array.isArray(session.buckets))
    throw new Error('Asset session contract changed');
  console.log('asset_session','confirmed');
  let completion=session.jwt;
  for(const bucket of session.buckets) {
    if(JSON.stringify(bucket)!==JSON.stringify([hash]))
      throw new Error('Asset upload bucket changed');
    const form=new FormData();
    form.set(hash,new Blob([content.toString('base64')],
      {type:'text/html; charset=utf-8'}),hash);
    const uploaded=await api('/workers/assets/upload?base64=true',
      {method:'POST',body:form},session.jwt);
    if(typeof uploaded?.jwt==='string')completion=uploaded.jwt;
  }
  console.log('asset_completion','confirmed');
  const form=new FormData();
  form.set('metadata',JSON.stringify({main_module:'edge.js',
    compatibility_date:'2026-08-26',
    bindings:[{type:'assets',name:'ASSETS'},
      {type:'version_metadata',name:'CF_VERSION_METADATA'}],
    assets:{jwt:completion,config:{html_handling:'none',run_worker_first:true}},
    tags:[`deos-test-probe:${name}`]}));
  form.set('edge.js',new Blob([`export default {fetch(request,env) {
    return Response.json({probe:true,versionId:env.CF_VERSION_METADATA?.id??null});
  }};`],{type:'application/javascript+module'}),'edge.js');
  await api(`/workers/scripts/${name}`,{method:'PUT',body:form});
  console.log('worker_upload','confirmed');
  const settings=await api(`/workers/scripts/${name}/settings`);
  if(!settings?.tags?.includes(`deos-test-probe:${name}`))
    throw new Error('Worker settings tag readback changed');
  console.log('settings_tag_readback','confirmed');
} finally {
  const existing=await api(`/workers/scripts/${name}/settings`,{},token,true);
  if(existing!==null) {
    await api(`/workers/scripts/${name}`,{method:'DELETE'});
    for(let read=0;read<2;read++) {
      const missing=await api(`/workers/scripts/${name}/settings`,{},token,true);
      if(missing!==null)throw new Error('Probe Worker still exists after delete');
    }
    console.log('delete_absence','confirmed_twice');
  }
}
