import type {TestWorkerCleanupProvider} from './shared-test-resource-cleanup.ts';
import type {TestWorkerIdentity,TestWorkerPlan} from './shared-test-worker-provisioner.ts';
import type {SharedTestBuildStore} from './shared-test-build-store.ts';
import {sharedTestEdgeWrapper} from './shared-test-edge-wrapper.ts';

type VerifiedBuild=Awaited<ReturnType<SharedTestBuildStore['read']>>;
type Asset={hash:string;bytes:Uint8Array;type:string};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const encoder=new TextEncoder();

function base64(bytes:Uint8Array):string {
  let binary='';
  for(let i=0;i<bytes.length;i+=32768)
    binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(binary);
}

function hex(bytes:ArrayBuffer):string {
  return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

function contentType(path:string):string {
  if(path.endsWith('.html'))return 'text/html; charset=utf-8';
  if(path.endsWith('.js'))return 'application/javascript; charset=utf-8';
  if(path.endsWith('.css'))return 'text/css; charset=utf-8';
  if(path.endsWith('.json'))return 'application/json';
  if(path.endsWith('.svg'))return 'image/svg+xml';
  if(path.endsWith('.png'))return 'image/png';
  if(path.endsWith('.ico'))return 'image/x-icon';
  return 'application/null';
}

async function assets(build:VerifiedBuild,service:string):Promise<{
  manifest:Record<string,{hash:string;size:number}>;byHash:Map<string,Asset>}> {
  const prefix=service==='portal'?'portal/dist/':'portal/bettaview/dist/';
  const manifest:Record<string,{hash:string;size:number}>={};
  const byHash=new Map<string,Asset>();
  for(const [path,bytes] of build.assets) {
    if(!path.startsWith(prefix))throw new Error('shared_test_asset_path_invalid');
    const relative=path.slice(prefix.length);
    if(!relative || relative.startsWith('/') || relative.split('/').includes('..'))
      throw new Error('shared_test_asset_path_invalid');
    const extension=relative.includes('.')?relative.slice(relative.lastIndexOf('.')+1):'';
    // Cloudflare's direct-upload example hashes base64 bytes plus extension.
    const hash=hex(await crypto.subtle.digest('SHA-256',
      encoder.encode(base64(bytes)+extension))).slice(0,32);
    manifest[`/${relative}`]={hash,size:bytes.length};
    byHash.set(hash,{hash,bytes,type:contentType(relative)});
  }
  if(!manifest['/index.html'])throw new Error('shared_test_index_asset_missing');
  return {manifest,byHash};
}

/** The coordinator alone owns this credential and only writes fixed lease names. */
export class SharedTestCloudflareWorkers implements TestWorkerCleanupProvider {
  readonly db:D1Database;
  readonly accountId:string;
  readonly zoneId:string;
  readonly token:string;
  readonly fetcher:typeof fetch;
  constructor(db:D1Database,accountId:string,zoneId:string,token:string,
    fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    if(!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-f0-9]{32}$/.test(zoneId) || !token)
      throw new Error('shared_test_worker_provider_unconfigured');
    this.db=db;this.accountId=accountId;this.zoneId=zoneId;
    this.token=token;this.fetcher=fetcher;
  }

  private async api(path:string,init:RequestInit={},missing=false,
    bearer=this.token):Promise<unknown> {
    const response=await this.fetcher(`https://api.cloudflare.com/client/v4/accounts/${this.accountId}${path}`,{
      ...init,headers:{...init.headers,Authorization:`Bearer ${bearer}`},
      redirect:'manual',signal:AbortSignal.timeout(30_000),
    });
    const raw=await response.text();
    if(missing&&response.status===404)return null;
    if(!response.ok)throw new Error(`Cloudflare ${init.method??'GET'} ${path}: `+
      `HTTP ${response.status} ${raw.replaceAll(this.token,'[redacted]').replaceAll(bearer,'[redacted]')}`);
    let envelope:{success?:boolean;result?:unknown;errors?:unknown};
    try {envelope=JSON.parse(raw) as typeof envelope;}
    catch(error){throw new Error(`Cloudflare ${init.method??'GET'} ${path}: invalid JSON`,{cause:error});}
    if(envelope.success!==true)throw new Error(`Cloudflare ${init.method??'GET'} ${path}: `+
      JSON.stringify(envelope.errors).replaceAll(this.token,'[redacted]').replaceAll(bearer,'[redacted]'));
    return envelope.result;
  }

  private root(plan:TestWorkerPlan):string {
    if(plan.service.workerName!==`deos-test-${plan.service.serviceName}-${plan.leaseId.slice(0,32)}` ||
      plan.providerKey!==plan.service.canonicalHost ||
      !/^[a-f0-9]{64}$/.test(plan.leaseId) ||
      !['portal','bettaview'].includes(plan.service.serviceName))
      throw new Error('shared_test_worker_plan_invalid');
    return `/workers/scripts/${plan.service.workerName}`;
  }

  private async assertFence(plan:TestWorkerPlan):Promise<void> {
    const row=await this.db.prepare(`SELECT 1 AS allowed FROM test_resources r
      JOIN test_environment e ON e.owner_lease_id=r.lease_id
        AND e.owner_run_id=r.run_id WHERE r.resource_id=? AND r.run_id=?
        AND r.lease_id=? AND r.create_fence=? AND r.work_id=?
        AND r.provider_key=? AND r.plan_state IN ('creating','uncertain','created')
        AND e.site_id=1 AND e.state='preparing' AND e.fence=?
        AND e.heartbeat_due_at>?`)
      .bind(plan.resourceId,plan.runId,plan.leaseId,plan.fence,
        plan.workId,plan.providerKey,plan.fence,new Date().toISOString())
      .first<{allowed:number}>();
    if(row?.allowed!==1)throw new Error('shared_test_worker_write_fenced');
  }

  private async domains():Promise<Array<{id:string;hostname:string;service:string;zone_id:string}>> {
    const value=await this.api('/workers/domains');
    if(!Array.isArray(value))throw new Error('shared_test_worker_domains_invalid');
    return value as Array<{id:string;hostname:string;service:string;zone_id:string}>;
  }

  async lookup(plan:TestWorkerPlan):Promise<TestWorkerIdentity|null> {
    const root=this.root(plan);
    const settings=await this.api(`${root}/settings`,{},true) as {tags?:unknown}|null;
    const matches=(await this.domains()).filter(value=>value.hostname===plan.service.canonicalHost);
    if(matches.length>1 || matches.some(value=>value.service!==plan.service.workerName ||
      value.zone_id!==this.zoneId))throw new Error('shared_test_worker_domain_conflict');
    if(!settings){
      if(matches.length)throw new Error('shared_test_worker_domain_without_script');
      return null;
    }
    const tags=settings.tags;
    if(!Array.isArray(tags) ||
      ![`deos-test-lease:${plan.leaseId}`,`deos-test-source:${plan.service.base.sourceCommit}`,
        `deos-test-base:${plan.service.base.deployVersion}`,
        `deos-test-build:${plan.service.base.buildInputSha256}`].every(tag=>tags.includes(tag)))
      throw new Error('shared_test_worker_script_identity_changed');
    return {workerName:plan.service.workerName,
      sourceCommit:plan.service.base.sourceCommit,
      baseVersionId:plan.service.base.deployVersion,
      buildInputSha256:plan.service.base.buildInputSha256};
  }

  /** Safe after a lost domain-attach reply: only the exact saved host is used. */
  async complete(plan:TestWorkerPlan):Promise<void> {
    this.root(plan);
    const matches=(await this.domains()).filter(value=>value.hostname===plan.service.canonicalHost);
    if(matches.length>1 || matches.some(value=>value.service!==plan.service.workerName ||
      value.zone_id!==this.zoneId))throw new Error('shared_test_worker_domain_conflict');
    if(matches.length===0) {
      await this.assertFence(plan);
      await this.api('/workers/domains',{method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({hostname:plan.service.canonicalHost,
          service:plan.service.workerName,zone_id:this.zoneId})});
    }
    const confirmed=(await this.domains()).filter(value=>
      value.hostname===plan.service.canonicalHost && value.service===plan.service.workerName &&
      value.zone_id===this.zoneId);
    if(confirmed.length!==1)throw new Error('shared_test_worker_domain_unconfirmed');
  }

  private async store(plan:TestWorkerPlan,kind:string):Promise<string> {
    const suffix=plan.leaseId.slice(0,32);
    const name=kind==='d1_database'?`deos-test-portal-db-${suffix}`:
      `deos-test-portal-artifacts-${suffix}`;
    const row=await this.db.prepare(`SELECT remote_id,provider_key,plan_state FROM test_resources
      WHERE lease_id=? AND run_id=? AND create_fence=? AND kind=?`)
      .bind(plan.leaseId,plan.runId,plan.fence,kind)
      .first<{remote_id:string|null;provider_key:string;plan_state:string}>();
    if(!row || row.provider_key!==name || row.plan_state!=='created' || !row.remote_id)
      throw new Error(`shared_test_worker_store_missing:${kind}`);
    if(kind==='d1_database'&&!uuid.test(row.remote_id))
      throw new Error('shared_test_worker_d1_identity_invalid');
    if(kind==='r2_bucket'&&row.remote_id!==name)
      throw new Error('shared_test_worker_r2_identity_invalid');
    return row.remote_id;
  }

  private async uploadAssets(plan:TestWorkerPlan,build:VerifiedBuild):Promise<string> {
    const {manifest,byHash}=await assets(build,plan.service.serviceName);
    await this.assertFence(plan);
    const session=await this.api(`${this.root(plan)}/assets-upload-session`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({manifest}),
    }) as {jwt?:unknown;buckets?:unknown};
    if(typeof session.jwt!=='string' || !Array.isArray(session.buckets))
      throw new Error('shared_test_asset_session_invalid');
    let completion=session.jwt;
    for(const bucket of session.buckets) {
      if(!Array.isArray(bucket) || bucket.some(hash=>typeof hash!=='string' || !byHash.has(hash)))
        throw new Error('shared_test_asset_upload_bucket_invalid');
      const form=new FormData();
      for(const hash of bucket as string[]) {
        const asset=byHash.get(hash)!;
        form.set(hash,new Blob([base64(asset.bytes)],{type:asset.type}),hash);
      }
      await this.assertFence(plan);
      const result=await this.api('/workers/assets/upload?base64=true',
        {method:'POST',body:form},false,session.jwt) as {jwt?:unknown};
      if(typeof result.jwt==='string')completion=result.jwt;
    }
    if(typeof completion!=='string' || !completion)
      throw new Error('shared_test_asset_completion_missing');
    return completion;
  }

  async create(plan:TestWorkerPlan,build:VerifiedBuild):Promise<void> {
    this.root(plan);
    if(build.sha256!==plan.service.base.buildInputSha256)
      throw new Error('shared_test_worker_build_mismatch');
    if(await this.lookup(plan))throw new Error('shared_test_worker_already_exists');
    const d1=await this.store(plan,'d1_database');
    const r2=await this.store(plan,'r2_bucket');
    const portal=plan.service.serviceName==='portal';
    const bindings:Record<string,unknown>[]=[
      {type:'plain_text',name:'TEST_CANONICAL_HOST',text:plan.service.canonicalHost},
      {type:'plain_text',name:portal?'PORTAL_CANONICAL_HOST':'BETTAVIEW_CANONICAL_HOST',
        text:plan.service.canonicalHost},
      {type:'plain_text',name:portal?'PORTAL_SITE':'BETTAVIEW_SITE',text:'Test'},
      {type:'plain_text',name:portal?'PORTAL_SOURCE_SHA':'BETTAVIEW_SOURCE_SHA',
        text:plan.service.base.sourceCommit},
      {type:'plain_text',name:portal?'PORTAL_BUILD_INPUT_SHA256':'BETTAVIEW_BUILD_INPUT_SHA256',
        text:build.sha256},
      {type:'plain_text',name:'TEST_BASE_VERSION_ID',text:plan.service.base.deployVersion},
      {type:'assets',name:'ASSETS'},
      {type:'version_metadata',name:'CF_VERSION_METADATA'},
      {type:'service',name:'TEST_APP_GATE',service:'deos-queue-consumer-ts',
        entrypoint:'SharedTestAppGate'},
    ];
    if(portal)bindings.push(
      {type:'plain_text',name:'PORTAL_SOURCE_BRANCH',text:'main'},
      {type:'d1',name:'DB',id:d1},
      {type:'r2_bucket',name:'ARTIFACTS',bucket_name:r2});
    else bindings.push(
      {type:'service',name:'DEOS_PORTAL',service:`deos-test-portal-${plan.leaseId.slice(0,32)}`},
      {type:'durable_object_namespace',name:'GITHUB_SESSIONS',class_name:'GitHubSession'});
    const jwt=await this.uploadAssets(plan,build);
    const form=new FormData();
    form.set('metadata',JSON.stringify({main_module:'edge.js',
      compatibility_date:portal?'2026-08-26':'2026-08-29',
      compatibility_flags:['nodejs_compat'],
      bindings,assets:{jwt,config:{html_handling:'none',run_worker_first:true}},
      ...(portal?{}:{migrations:[{tag:'v1',new_sqlite_classes:['GitHubSession']}]}),
      tags:[`deos-test-lease:${plan.leaseId}`,
        `deos-test-source:${plan.service.base.sourceCommit}`,
        `deos-test-base:${plan.service.base.deployVersion}`,
        `deos-test-build:${plan.service.base.buildInputSha256}`]}));
    form.set('edge.js',new Blob([sharedTestEdgeWrapper(plan.service.serviceName)],
      {type:'application/javascript+module'}),'edge.js');
    form.set(portal?'app/worker.js':'app/index.js',
      new Blob([new Uint8Array(build.worker)],{type:'application/javascript+module'}),
      portal?'app/worker.js':'app/index.js');
    if(!portal)for(const [path,bytes] of build.modules) {
      if(path==='portal/bettaview/worker/index.js')continue;
      const name='app/'+path.slice('portal/bettaview/worker/'.length);
      form.set(name,new Blob([new Uint8Array(bytes)],
        {type:'application/javascript+module'}),name);
    }
    await this.assertFence(plan);
    await this.api(this.root(plan),{method:'PUT',body:form});
    await this.complete(plan);
  }

  async remove(plan:TestWorkerPlan):Promise<void> {
    const found=await this.lookup(plan);
    if(!found)throw new Error('shared_test_worker_remove_missing');
    const domains=(await this.domains()).filter(value=>value.hostname===plan.service.canonicalHost);
    if(domains.length===1)await this.api(`/workers/domains/${domains[0].id}`,{method:'DELETE'});
    await this.api(this.root(plan),{method:'DELETE'});
  }
}
