import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { ImplementationError, type ProofSubject } from './implementation-contract.ts';
import { ImplementationStore, type ImplementationRun } from './implementation-store.ts';
import { sha256Hex } from './implementation-hash.ts';
import { checkedPagesDeployment, checkHostedAssets, type HostedPreviewReceipt, type HostedPreviewRequest } from './implementation-hosted-preview.ts';

export type StaticPreviewEnv = Pick<Env,'DB'|'ARTIFACTS'> & {
  IMPLEMENTATION_PREVIEW_TOKEN?: string;
  IMPLEMENTATION_PREVIEW_ACCOUNT_ID?: string;
};
export interface StaticAsset { path:string; contentBase64:string; }
interface Publication { publication_id:string; state:string; deployment_id:string|null; receipt_key:string|null; receipt_sha:string|null; }
const fail = (message:string):never => {throw new ImplementationError('static_preview_invalid',message);};
export const staticPreviewOrigin = async (runId:string) => `https://review.deos-preview-${(await sha256Hex(runId)).slice(0,16)}.pages.dev`;
export function staticAssets(value:unknown) {
  if (!Array.isArray(value) || !value.length || value.length>128) fail('Preview needs 1–128 static files');
  let total=0;
  const paths=new Set<string>();
  const types:Record<string,string>={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript',mjs:'application/javascript',json:'application/json',svg:'image/svg+xml',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',ico:'image/x-icon',woff2:'font/woff2',txt:'text/plain'};
  const assets=(value as StaticAsset[]).map(file=>{
    if (!file || typeof file.path!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(file.path) ||
      file.path.length>250 || file.path.split('/').some(part=>!part || part==='.' || part==='..' || part.startsWith('.')) ||
      /(^|\/)(functions|_worker\.js|_headers|_redirects|wrangler\..*)($|\/)/.test(file.path) || paths.has(file.path) ||
      typeof file.contentBase64!=='string' || file.contentBase64.length>2_800_000) fail('Unsupported or duplicate preview file');
    const extension=file.path.split('.').pop()!;
    if (!types[extension]) fail(`Unsupported static preview extension: ${extension}`);
    const binary=atob(file.contentBase64), bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    total+=bytes.byteLength;
    if (bytes.byteLength>2_000_000 || total>8_000_000) fail('Static preview is limited to 2 MB per file and 8 MB total');
    paths.add(file.path);
    // Match Wrangler's Pages asset key contract, including extension.
    const key=bytesToHex(blake3(new TextEncoder().encode(file.contentBase64+extension))).slice(0,32);
    return {...file,bytes,key,contentType:types[extension]};
  });
  if (!paths.has('index.html')) fail('Static preview requires index.html');
  return assets.sort((a,b)=>a.path.localeCompare(b.path));
}

/** Publishes static files only, in a service-selected per-run preview project.
 * No repository script executes with provider credentials. No production branch,
 * Worker code, bindings, project name or account can be supplied by an agent. */
export class ImplementationStaticPreview {
  readonly store:ImplementationStore;
  readonly env:StaticPreviewEnv;
  readonly fetcher:typeof fetch;
  constructor(env:StaticPreviewEnv, fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.fetcher=fetcher;
    this.store=new ImplementationStore(env.DB,env.ARTIFACTS);
  }
  async publish(work:ImplementationRun,attemptId:string,subject:ProofSubject,value:unknown):Promise<HostedPreviewReceipt> {
    const token=this.env.IMPLEMENTATION_PREVIEW_TOKEN, account=this.env.IMPLEMENTATION_PREVIEW_ACCOUNT_ID;
    if (!token || !account) throw new ImplementationError('static_preview_unconfigured','The trusted static preview service is not configured');
    const assets=staticAssets(value);
    const bundle=assets.map(({path,contentBase64})=>({path,contentBase64}));
    const saved=await this.store.put(work.run_id,'static-preview-bundle.json',JSON.stringify(bundle));
    const id=await sha256Hex(JSON.stringify({runId:work.run_id,subject,bundleSha:saved.sha256}));
    const project=`deos-preview-${(await sha256Hex(work.run_id)).slice(0,16)}`;
    const branch='review', marker=`deos-preview:${id}`;
    const api=async(path:string,init:RequestInit={},credential=token):Promise<any>=>{
      const response=await this.fetcher(`https://api.cloudflare.com/client/v4${path}`,{
        ...init,headers:{...init.headers,Authorization:`Bearer ${credential}`},redirect:'manual',signal:AbortSignal.timeout(20_000)});
      const text=await response.text();
      if (!response.ok) throw Object.assign(new ImplementationError('static_preview_provider',
        `Pages ${init.method??'GET'} ${path}: HTTP ${response.status} ${text.replaceAll(token,'[redacted]').replaceAll(credential,'[redacted]')}`),{status:response.status});
      const body=JSON.parse(text);
      if (body.success!==true) throw new ImplementationError('static_preview_provider',`Pages ${path}: ${JSON.stringify(body.errors).replaceAll(token,'[redacted]').replaceAll(credential,'[redacted]')}`);
      return body.result;
    };
    const root=`/accounts/${account}/pages/projects/${project}`;
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_preview_publications
      (publication_id,run_id,attempt_id,tree_sha,bundle_key,bundle_sha,state,created_at)
      VALUES (?,?,?,?,?,?,'uploading',?)`).bind(id,work.run_id,attemptId,subject.treeSha,saved.key,saved.sha256,new Date().toISOString()).run();
    const read=()=>this.env.DB.prepare('SELECT * FROM implementation_preview_publications WHERE publication_id=?').bind(id).first<Publication>();
    let row=(await read())!;
    if (row.state==='ready') return this.store.read<HostedPreviewReceipt>(row.receipt_key!,row.receipt_sha!);
    let projectInfo:any;
    try {projectInfo=await api(root);} catch(error) {
      if ((error as {status?:number}).status!==404) throw error;
      try {projectInfo=await api(`/accounts/${account}/pages/projects`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:project,production_branch:'release-disabled'})});}
      catch(createError) {
        // Resolve a concurrent create or lost success by the fixed project name.
        try {projectInfo=await api(root);} catch(readError) {throw new AggregateError([createError,readError],'Preview project creation could not be reconciled',{cause:createError});}
      }
    }
    if (projectInfo.name!==project || projectInfo.production_branch!=='release-disabled' || projectInfo.source)
      fail('The preview project is not the reserved direct-upload project');
    if (row.state==='uploading') {
      const {jwt}=await api(`${root}/upload-token`);
      await api('/pages/assets/upload',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(assets.map(file=>({key:file.key,value:file.contentBase64,metadata:{contentType:file.contentType},base64:true})))},jwt);
      await api('/pages/assets/upsert-hashes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hashes:assets.map(file=>file.key)})},jwt);
      const claimed=await this.env.DB.prepare("UPDATE implementation_preview_publications SET state='creating' WHERE publication_id=? AND state='uploading'").bind(id).run();
      if (claimed.meta.changes===1) {
        const form=new FormData();form.set('branch',branch);form.set('commit_hash',subject.treeSha);form.set('commit_message',marker);
        form.set('manifest',JSON.stringify(Object.fromEntries(assets.map(file=>[`/${file.path}`,file.key]))));
        try {
          const deployment=await api(`${root}/deployments`,{method:'POST',body:form});
          await this.env.DB.prepare('UPDATE implementation_preview_publications SET deployment_id=? WHERE publication_id=?').bind(deployment.id,id).run();
        } catch(error) {
          // A definite rejection did not create a deployment; transport ambiguity
          // remains creating and is read back, never blindly submitted again.
          const status=(error as {status?:number}).status;
          if (status && status>=400 && status<500) await this.env.DB.prepare("UPDATE implementation_preview_publications SET state='uploading' WHERE publication_id=? AND deployment_id IS NULL").bind(id).run();
          throw error;
        }
      }
      row=(await read())!;
    }
    if (!row.deployment_id) {
      let found:any=null;
      for(let page=1;page<=10;page++) {
        const deployments=await api(`${root}/deployments?page=${page}&per_page=100`);
        found=deployments.find((item:any)=>item.deployment_trigger?.metadata?.commit_message===marker && item.deployment_trigger?.metadata?.branch===branch);
        if(found || deployments.length<100)break;
      }
      if (!found) throw new ImplementationError('static_preview_pending','Preview creation has no confirmed response yet; retry this same publish_preview request to read back its result');
      await this.env.DB.prepare('UPDATE implementation_preview_publications SET deployment_id=? WHERE publication_id=? AND deployment_id IS NULL').bind(found.id,id).run();
      row=(await read())!;
    }
    const provider=await api(`${root}/deployments/${row.deployment_id}`);
    if(provider.latest_stage?.status!=='success') throw new ImplementationError('static_preview_pending',`Preview ${row.deployment_id} is ${provider.latest_stage?.name}: ${provider.latest_stage?.status}; retry the same request to read it back`);
    const descriptors=await Promise.all(assets.map(async file=>({path:file.path,bytes:file.bytes.length,
      sha256:bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(file.bytes))))})));
    const request:HostedPreviewRequest={version:1,runId:work.run_id,inputSha:work.input_sha,candidateSha:id,treeSha:subject.treeSha,
      requestedBy:'deos-static-preview',accountId:account,projectId:projectInfo.id,projectName:project,deploymentId:row.deployment_id!,branch,
      build:{treeSha:subject.treeSha,baseSha:subject.testedBaseSha,command:'Saved static build output',logSha256:saved.sha256},assets:descriptors};
    const deployment=checkedPagesDeployment(provider,request);
    let checked:HostedPreviewReceipt['assets'];
    try {
      checked=await checkHostedAssets(deployment.url,descriptors,this.fetcher);
      await checkHostedAssets(await staticPreviewOrigin(work.run_id),descriptors,this.fetcher);
    } catch(error) {
      // Pages can finish deployment before its new HTTPS hostname is ready.
      // Keep the saved deployment and the full original failure for read-back.
      throw new ImplementationError('static_preview_pending',
        `Preview ${row.deployment_id} was deployed but its served files are not confirmed yet; retry this same publish_preview request to read it back: ${String(error)}`,
        {cause:error});
    }
    const receipt:HostedPreviewReceipt={version:1,registrationId:id,provenance:'service_deployed_static_preview',request,subject,
      // This alias is exclusive to this run and stable for its one browser.
      // The immutable deployment URL remains the human-facing review URL.
      origin:await staticPreviewOrigin(work.run_id),deployment,assets:checked,checkedAt:new Date().toISOString()};
    const stored=await this.store.put(work.run_id,'hosted-preview.json',JSON.stringify(receipt));
    await this.env.DB.batch([
      this.env.DB.prepare('INSERT OR IGNORE INTO implementation_hosted_previews VALUES (?,?,?,?,?,?,?,?)')
        .bind(id,work.run_id,work.input_sha,id,subject.treeSha,stored.key,stored.sha256,receipt.checkedAt),
      this.env.DB.prepare("UPDATE implementation_preview_publications SET state='ready',receipt_key=?,receipt_sha=? WHERE publication_id=?")
        .bind(stored.key,stored.sha256,id),
    ]);
    return receipt;
  }
}
