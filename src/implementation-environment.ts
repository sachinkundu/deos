import { ImplementationError, type ProofSubject } from './implementation-contract.ts';
import { ImplementationStore, type ImplementationRun } from './implementation-store.ts';
import { sha256Hex } from './implementation-hash.ts';
import { staticAssets } from './implementation-static-preview.ts';
import { environmentWorker } from './implementation-environment-worker.ts';

export type EnvironmentEnv = Pick<Env,'DB'|'ARTIFACTS'> & {
  IMPLEMENTATION_ENVIRONMENT_TOKEN?: string;
  IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID?: string;
};
interface Config { d1:string[]; r2:string[]; }
interface Resources { d1?:{creating:boolean;id?:string;uncertain?:boolean}; r2?:{creating:boolean;confirmed?:boolean;uncertain?:boolean}; worker?:{creating:boolean}; }
export interface EnvironmentRow {
  attempt_id:string; run_id:string; name:string; account_id:string; config_json:string;
  resources_json:string; state:'allocating'|'ready'|'retiring'|'destroyed'; origin:string|null;
  bundle_key:string|null; bundle_sha:string|null; receipt_key:string|null; receipt_sha:string|null;
}
const fail=(message:string):never=>{throw new ImplementationError('environment_invalid',message);};
const now=()=>new Date().toISOString();
const object=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))fail('Expected an environment request');
  return value as Record<string,unknown>;
};
export function environmentConfig(value:unknown):Config {
  const q=object(value);
  if(Object.keys(q).some(k=>!['d1','r2'].includes(k)))fail('Only D1 and R2 binding names may be requested');
  const names=(key:string)=>{
    const values=q[key]??[];
    if(!Array.isArray(values)||values.length>1||values.some(v=>typeof v!=='string'||!/^[A-Z][A-Z0-9_]{0,31}$/.test(v)||v==='ASSETS'))
      fail('At most one D1 and one R2 binding are supported; use uppercase binding names');
    return values as string[];
  };
  const config={d1:names('d1'),r2:names('r2')};
  if(new Set([...config.d1,...config.r2]).size!==config.d1.length+config.r2.length)fail('Binding names must be distinct');
  return config;
}
export function environmentBundle(value:unknown) {
  const q=object(value);
  if(Object.keys(q).some(k=>!['code','assets','config'].includes(k))||typeof q.code!=='string'||!q.code.trim()||new TextEncoder().encode(q.code).length>2_000_000)
    fail('Submit a bundled JavaScript module up to 2 MB, optional static assets and binding names');
  const config=environmentConfig(q.config);
  const assets=q.assets===undefined?[]:staticAssets(q.assets);
  // Embedded assets are bounded below the module upload budget for this adapter.
  if(assets.reduce((n,a)=>n+a.contentBase64.length,0)>3_000_000)fail('Temporary Worker assets are limited to 3 MB encoded');
  return {code:q.code as string,config,assets:assets.map(({path,contentBase64,contentType})=>({path,contentBase64,contentType}))};
}

export class ImplementationEnvironment {
  readonly env:EnvironmentEnv; readonly store:ImplementationStore; readonly fetcher:typeof fetch;
  constructor(env:EnvironmentEnv,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.store=new ImplementationStore(env.DB,env.ARTIFACTS);this.fetcher=fetcher;
  }
  credentials() {
    const token=this.env.IMPLEMENTATION_ENVIRONMENT_TOKEN,account=this.env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID;
    if(!token||!account||!/^[a-f0-9]{32}$/.test(account))throw new ImplementationError('environment_unconfigured','Temporary Cloudflare environments are not configured');
    return {token,account};
  }
  async api(path:string,init:RequestInit={},missing=false):Promise<any> {
    const {token}=this.credentials();
    const response=await this.fetcher(`https://api.cloudflare.com/client/v4${path}`,{...init,
      headers:{...init.headers,Authorization:`Bearer ${token}`,'User-Agent':'deos-temporary-environment'},redirect:'manual',signal:AbortSignal.timeout(20_000)});
    const text=await response.text();
    if(missing&&response.status===404)return null;
    if(!response.ok)throw Object.assign(new ImplementationError('environment_provider',
      `Cloudflare ${init.method??'GET'} ${path}: HTTP ${response.status} ${text.replaceAll(token,'[redacted]')}`),{status:response.status});
    const body=JSON.parse(text);
    if(body.success!==true)throw new ImplementationError('environment_provider',`Cloudflare ${path}: ${JSON.stringify(body.errors).replaceAll(token,'[redacted]')}`);
    return body.result;
  }
  json(method:string,value:unknown):RequestInit {return {method,headers:{'Content-Type':'application/json'},body:JSON.stringify(value)};}
  row(attemptId:string) {return this.env.DB.prepare('SELECT * FROM implementation_environments WHERE attempt_id=?').bind(attemptId).first<EnvironmentRow>();}
  async owned(runId:string,attemptId:string) {
    const row=await this.row(attemptId);
    if(!row||row.run_id!==runId||row.account_id!==this.credentials().account||!/^[a-z0-9-]+$/.test(row.name)||
      row.name!==`deos-tmp-${(await sha256Hex(`${runId}:${attemptId}`)).slice(0,24)}`)fail('Environment ownership does not match this run and attempt');
    return row!;
  }
  async locked<T>(row:EnvironmentRow,fn:()=>Promise<T>):Promise<T> {
    const lease=crypto.randomUUID();
    const claim=await this.env.DB.prepare(`UPDATE implementation_environments SET lease_id=?,lease_until=?
      WHERE attempt_id=? AND (lease_id IS NULL OR lease_until<?)`)
      .bind(lease,new Date(Date.now()+900_000).toISOString(),row.attempt_id,now()).run();
    if(claim.meta.changes!==1)throw new ImplementationError('environment_busy','Environment operation is in progress; retry the same request later');
    let failure:unknown;
    try {Object.assign(row,await this.owned(row.run_id,row.attempt_id));return await fn();}
    catch(error){failure=error;throw error;}
    finally {
      try {await this.env.DB.prepare('UPDATE implementation_environments SET lease_id=NULL,lease_until=NULL WHERE attempt_id=? AND lease_id=?').bind(row.attempt_id,lease).run();}
      catch(error){if(failure)throw new AggregateError([failure,error],'Environment operation and lease release failed',{cause:failure});throw error;}
    }
  }
  async saveResources(row:EnvironmentRow,resources:Resources) {
    row.resources_json=JSON.stringify(resources);
    await this.env.DB.prepare('UPDATE implementation_environments SET resources_json=?,updated_at=? WHERE attempt_id=?').bind(row.resources_json,now(),row.attempt_id).run();
  }
  root(row:EnvironmentRow){return `/accounts/${row.account_id}`;}
  async database(row:EnvironmentRow):Promise<any> {
    for(let page=1;page<=100;page++) {
      const list=await this.api(`${this.root(row)}/d1/database?page=${page}&per_page=100`);
      const found=list.filter((d:any)=>d.name===row.name);
      if(found.length>1)fail('Multiple databases have the reserved environment name');
      if(found.length)return found[0];
      if(list.length<100)return null;
    }
    fail('Database inventory exceeded the reconciliation bound');
  }
  async provision(row:EnvironmentRow) {
    const config=environmentConfig(JSON.parse(row.config_json)),r=JSON.parse(row.resources_json) as Resources;
    const root=this.root(row);
    if(config.d1.length) {
      let db=await this.database(row);
      if(!r.d1) {
        if(db)fail('Reserved D1 name exists without this allocation intent');
        r.d1={creating:false};await this.saveResources(row,r);
      }
      if(!db) {
        if(r.d1.id)fail('Previously allocated D1 database is missing; refusing to replace its identity');
        if(r.d1.creating)throw new ImplementationError('environment_creation_pending','D1 creation outcome is uncertain; reconcile the saved name before another create');
        r.d1.creating=true;await this.saveResources(row,r);
        try {db=await this.api(`${root}/d1/database`,this.json('POST',{name:row.name}));}
        catch(error) {
          let recovered;
          try {recovered=await this.database(row);}catch(secondary){throw new AggregateError([error,secondary],'D1 creation and reconciliation failed',{cause:error});}
          if(!recovered) {
            const status=(error as {status?:number}).status;
            if(status&&status>=400&&status<500)r.d1.creating=false;
            else r.d1.uncertain=true;
            await this.saveResources(row,r);
            throw error;
          }
          await this.store.error(row.run_id,row.attempt_id,'environment.d1_create_recovered',error);db=recovered;
        }
      }
      if(db.name!==row.name||typeof db.uuid!=='string'||(r.d1.id&&r.d1.id!==db.uuid))fail('D1 allocation identity changed');
      r.d1.id=db.uuid;await this.saveResources(row,r);
    }
    if(config.r2.length) {
      let bucket=await this.api(`${root}/r2/buckets/${row.name}`,{},true);
      if(!r.r2) {
        if(bucket)fail('Reserved R2 name exists without this allocation intent');
        r.r2={creating:true};await this.saveResources(row,r);
      }
      if(!bucket) {
        if(row.state==='ready')fail('Previously allocated R2 bucket is missing; refusing to silently recreate its data');
        try {bucket=await this.api(`${root}/r2/buckets`,this.json('POST',{name:row.name}));}
        catch(error) {
          let recovered;
          try {recovered=await this.api(`${root}/r2/buckets/${row.name}`,{},true);}catch(secondary){throw new AggregateError([error,secondary],'R2 creation and reconciliation failed',{cause:error});}
          if(!recovered){const status=(error as {status?:number}).status;if(status&&status>=400&&status<500)r.r2.creating=false;else r.r2.uncertain=true;await this.saveResources(row,r);throw error;}
          await this.store.error(row.run_id,row.attempt_id,'environment.r2_create_recovered',error);bucket=recovered;
        }
      }
      if(bucket.name!==row.name)fail('R2 allocation identity changed');
      r.r2.confirmed=true;await this.saveResources(row,r);
    }
    if(!r.worker) {
      const existing=await this.api(`${root}/workers/scripts/${row.name}/settings`,{},true);
      if(existing)fail('Reserved Worker name exists without this allocation intent');
      r.worker={creating:true};await this.saveResources(row,r);
    }
    const subdomain=await this.api(`${root}/workers/subdomain`);
    if(!/^[a-z0-9-]+$/.test(subdomain.subdomain))fail('Account Workers subdomain is not configured');
    row.origin=`https://${row.name}.${subdomain.subdomain}.workers.dev`;
    await this.env.DB.prepare('UPDATE implementation_environments SET origin=? WHERE attempt_id=?').bind(row.origin,row.attempt_id).run();
    return r;
  }
  async controlToken(row:EnvironmentRow) {
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(this.credentials().token),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`deos-environment:${row.attempt_id}`)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  async upload(row:EnvironmentRow,bundle:ReturnType<typeof environmentBundle>,digest:string,retiring=false) {
    const r=JSON.parse(row.resources_json) as Resources,config=bundle.config;
    const bindings:any[]=[{type:'secret_text',name:'__DEOS_CONTROL',text:await this.controlToken(row)}];
    if(config.d1.length&&r.d1?.id)bindings.push({type:'d1',name:config.d1[0],id:r.d1.id});
    if(config.r2.length&&r.r2)bindings.push({type:'r2_bucket',name:config.r2[0],bucket_name:row.name});
    const form=new FormData();
    form.set('metadata',JSON.stringify({main_module:'control.mjs',compatibility_date:'2026-09-17',bindings,
      tags:[`deos-environment:${row.attempt_id}`,`deos-bundle:${digest}`]}));
    form.set('control.mjs',new Blob([environmentWorker(config,digest,retiring)],{type:'application/javascript+module'}),'control.mjs');
    if(!retiring) {
      form.set('app.mjs',new Blob([bundle.code],{type:'application/javascript+module'}),'app.mjs');
      form.set('assets.mjs',new Blob([`export default ${JSON.stringify(Object.fromEntries(bundle.assets.map(a=>[a.path,a])))};`],{type:'application/javascript+module'}),'assets.mjs');
    }
    await this.api(`${this.root(row)}/workers/scripts/${row.name}`,{method:'PUT',body:form});
    await this.api(`${this.root(row)}/workers/scripts/${row.name}/subdomain`,this.json('POST',{enabled:true}));
  }
  async control(row:EnvironmentRow,path:string,body?:unknown):Promise<any> {
    if(!row.origin)fail('Environment has no confirmed origin');
    const token=await this.controlToken(row);
    const response=await this.fetcher(`${row.origin}/__deos/${path}`,{method:body===undefined?'GET':'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),
      redirect:'manual',signal:AbortSignal.timeout(20_000)});
    const text=await response.text();
    if(!response.ok)throw new ImplementationError('environment_control',`Temporary Worker ${path}: HTTP ${response.status} ${text.replaceAll(token,'[redacted]')}`);
    return JSON.parse(text);
  }
  async ready(row:EnvironmentRow,digest:string,retiring:boolean) {
    for(let attempt=0;attempt<6;attempt++) {
      try {
        const health=await this.control(row,'health');
        if(health.digest!==digest||health.retiring!==retiring)throw new ImplementationError('environment_propagating','Temporary Worker is still serving a different deployment');
        return health;
      } catch(error) {
        try {await this.store.error(row.run_id,row.attempt_id,'environment.readiness',error);}
        catch(secondary){throw new AggregateError([error,secondary],'Readiness observation and diagnostic storage failed',{cause:error});}
        if(attempt===5)throw error;
        await new Promise(resolve=>setTimeout(resolve,2000));
      }
    }
    throw new Error('Unreachable readiness state');
  }
  async publish(work:ImplementationRun,attemptId:string,subject:ProofSubject,value:unknown) {
    const bundle=environmentBundle(value),{account}=this.credentials();
    const stamp=now(),name=`deos-tmp-${(await sha256Hex(`${work.run_id}:${attemptId}`)).slice(0,24)}`;
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_environments
      (attempt_id,run_id,name,account_id,config_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(attemptId,work.run_id,name,account,JSON.stringify(bundle.config),stamp,stamp).run();
    const row=await this.owned(work.run_id,attemptId);
    return this.locked(row,async()=>{
      if(row.state==='retiring'||row.state==='destroyed')fail('This environment is retired; use a fresh implementation attempt');
      if(row.config_json!==JSON.stringify(bundle.config))fail('Bindings are fixed for this attempt; reuse the assigned names');
      const saved=await this.store.put(work.run_id,'environment-bundle.json',JSON.stringify({subject,bundle}));
      await this.env.DB.prepare('UPDATE implementation_environments SET bundle_key=?,bundle_sha=?,updated_at=? WHERE attempt_id=?')
        .bind(saved.key,saved.sha256,now(),attemptId).run();
      const resources=await this.provision(row);
      const settings=await this.api(`${this.root(row)}/workers/scripts/${row.name}/settings`,{},true);
      if(!settings?.tags?.includes(`deos-bundle:${saved.sha256}`))await this.upload(row,bundle,saved.sha256);
      // Publication is repeatable. A lost upload acknowledgement is reconciled by
      // its saved bundle tag and the exact served control digest, not a new name.
      await this.api(`${this.root(row)}/workers/scripts/${row.name}/subdomain`,this.json('POST',{enabled:true}));
      const health=await this.ready(row,saved.sha256,false);
      if(health.digest!==saved.sha256||health.retiring||health.d1!==!!bundle.config.d1.length||health.r2!==!!bundle.config.r2.length)
        fail('Served temporary environment does not match the submitted bundle and bindings');
      const deployment=await this.api(`${this.root(row)}/workers/scripts/${row.name}/deployments`);
      const versions=deployment.deployments?.[0]?.versions;
      if(!Array.isArray(versions)||versions.length!==1||versions[0].percentage!==100)fail('Temporary Worker is not on one version at 100 percent');
      const receipt={target:'remote',origin:row.origin,environment:name,subject,config:bundle.config,
        databaseId:resources.d1?.id??null,bucket:resources.r2?name:null,bundleSha:saved.sha256,version:versions[0].version_id,checkedAt:now(),temporary:true};
      const stored=await this.store.put(work.run_id,'environment-receipt.json',JSON.stringify(receipt));
      await this.env.DB.prepare("UPDATE implementation_environments SET state='ready',receipt_key=?,receipt_sha=?,updated_at=? WHERE attempt_id=?")
        .bind(stored.key,stored.sha256,now(),attemptId).run();
      return receipt;
    });
  }
  async origin(runId:string,attemptId:string) {
    const row=await this.owned(runId,attemptId);
    if(row.state!=='ready'||!row.origin)fail('Publish this attempt\'s remote preview before opening a browser');
    return row.origin!;
  }
  async inspect(runId:string,attemptId:string,value:unknown) {
    const q=object(value),row=await this.owned(runId,attemptId);
    return this.locked(row,async()=>{
      if(row.state!=='ready')fail('Remote environment is not ready');
      let path:string,body:unknown;
      if(q.operation==='migrate') {
        if(Object.keys(q).some(k=>!['operation','id','statements'].includes(k))||typeof q.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(q.id)||
          !Array.isArray(q.statements)||!q.statements.length||q.statements.length>50||q.statements.some(s=>typeof s!=='string'||s.length>16000||/__deos_/i.test(s)))fail('Migration needs an ID and 1–50 SQL statements; reserved __deos_ tables are not writable');
        path='migrate';body={id:q.id,statements:q.statements,digest:await sha256Hex(JSON.stringify(q.statements))};
      } else if(q.operation==='query') {
        if(Object.keys(q).some(k=>!['operation','sql','params'].includes(k))||typeof q.sql!=='string'||!/^\s*SELECT\b/i.test(q.sql)||q.sql.includes(';')||q.sql.length>16000||
          (q.params!==undefined&&(!Array.isArray(q.params)||q.params.length>100||q.params.some(p=>p!==null&&!['string','number'].includes(typeof p)))))fail('Inspection accepts one SELECT statement and scalar parameters');
        path='query';body={sql:q.sql,params:q.params??[]};
      } else if(q.operation==='request') {
        if(Object.keys(q).some(k=>!['operation','method','path','body'].includes(k))||
          !['GET','POST','PUT','PATCH','DELETE'].includes(String(q.method))||typeof q.path!=='string'||!q.path.startsWith('/')||q.path.startsWith('//')||
          q.path.startsWith('/__deos/')||q.path.length>2000||JSON.stringify(q.body??null).length>65536)fail('Use a bounded request to this app only');
        const target=new URL(q.path as string,row.origin!);
        if(target.origin!==row.origin||target.username||target.password)fail('App request left the assigned origin');
        const response=await this.fetcher(target,{method:String(q.method),headers:{'Content-Type':'application/json'},
          body:q.body===undefined?undefined:JSON.stringify(q.body),redirect:'manual',signal:AbortSignal.timeout(20_000)});
        const reader=response.body?.getReader();let text='';
        if(reader){const decoder=new TextDecoder();let size=0;for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>65536){await reader.cancel();fail('App response exceeds 64 KiB inspection limit');}text+=decoder.decode(chunk.value,{stream:true});}text+=decoder.decode();}
        const result={status:response.status,body:text};
        const saved=await this.store.put(runId,'environment-request-evidence.json',JSON.stringify({environment:row.name,request:q,result,observedAt:now()}));
        return {environment:row.name,result,evidence:saved};
      } else if(q.operation==='objects') {
        if(Object.keys(q).some(k=>!['operation','cursor'].includes(k))||(q.cursor!==undefined&&(typeof q.cursor!=='string'||q.cursor.length>2000)))fail('Invalid object-list cursor');
        path='objects';body={cursor:q.cursor};
      } else if(q.operation==='object') {
        if(Object.keys(q).some(k=>!['operation','key'].includes(k))||typeof q.key!=='string'||!q.key||q.key.length>1024)fail('Object inspection needs a key');
        path='object';body={key:q.key};
      } else fail('Use migrate, query, objects, object or request');
      const result=await this.control(row,path!,body);
      const saved=await this.store.put(runId,'environment-storage-evidence.json',JSON.stringify({environment:row.name,request:q,result,observedAt:now()}));
      return {environment:row.name,result,evidence:saved};
    });
  }
  async cleanup(row:EnvironmentRow) {
    row=await this.owned(row.run_id,row.attempt_id);
    if(row.state==='destroyed')return;
    const active=await this.env.DB.prepare("SELECT attempt_id FROM agent_attempts WHERE attempt_id=? AND state IN ('pending','starting','running','collecting')").bind(row.attempt_id).first();
    if(active)throw new ImplementationError('environment_active','Cannot retire an active implementation environment');
    await this.locked(row,async()=>{
      if(row.state==='destroyed')return;
      await this.env.DB.prepare("UPDATE implementation_environments SET state='retiring',updated_at=? WHERE attempt_id=?").bind(now(),row.attempt_id).run();
      const root=this.root(row),resources=JSON.parse(row.resources_json) as Resources;
      const config=environmentConfig(JSON.parse(row.config_json));
      const bucket=resources.r2?await this.api(`${root}/r2/buckets/${row.name}`,{},true):null;
      const db=resources.d1?await this.database(row):null;
      if((resources.d1?.creating&&!resources.d1.id&&!db)||(resources.r2?.creating&&!resources.r2.confirmed&&!bucket))
        throw new ImplementationError('environment_cleanup_pending','Resource creation is still uncertain; retain the allocation for reconciliation instead of claiming cleanup');
      if(db&&resources.d1?.id&&resources.d1.id!==db.uuid)fail('Cleanup database identity differs from the allocation');
      if(db&&resources.d1)resources.d1.id=db.uuid;
      if(bucket&&resources.r2)resources.r2.confirmed=true;
      await this.saveResources(row,resources);
      // Replace application code before deleting data. This also allows cleanup
      // after a partial upload, malformed app, or lost resource-create response.
      if(resources.worker||bucket) {
        if(!resources.worker) {
          const existing=await this.api(`${root}/workers/scripts/${row.name}/settings`,{},true);
          if(existing)fail('Cleanup Worker exists without an allocation intent');
          resources.worker={creating:true};await this.saveResources(row,resources);
        }
        const cleanupConfig={d1:[],r2:bucket?config.r2:[]};
        if(!row.origin) {
          const sub=await this.api(`${root}/workers/subdomain`);
          if(!/^[a-z0-9-]+$/.test(sub.subdomain))fail('Invalid Worker subdomain');
          row.origin=`https://${row.name}.${sub.subdomain}.workers.dev`;
        }
        await this.upload(row,{code:'',assets:[],config:cleanupConfig},'retiring',true);
        const health=await this.ready(row,'retiring',true);
        if(!health.retiring)fail('App writes have not stopped');
        if(bucket)for(let page=0;page<20;page++) {
          if((await this.control(row,'purge',{})).empty)break;
          if(page===19)throw new ImplementationError('environment_cleanup_pending','R2 cleanup has more objects; scheduled cleanup will continue');
        }
      }
      if(db)await this.api(`${root}/d1/database/${db.uuid}`,{method:'DELETE'});
      if(bucket)await this.api(`${root}/r2/buckets/${row.name}`,{method:'DELETE'});
      if(resources.worker||bucket)await this.api(`${root}/workers/scripts/${row.name}`,{method:'DELETE'},true);
      const absent={d1:!resources.d1||!await this.database(row),r2:!resources.r2||!await this.api(`${root}/r2/buckets/${row.name}`,{},true),
        worker:!(resources.worker||bucket)||!await this.api(`${root}/workers/scripts/${row.name}/settings`,{},true)};
      if(Object.values(absent).some(value=>!value))throw new ImplementationError('environment_cleanup_pending','Provider still reports a temporary resource');
      await this.env.DB.prepare("UPDATE implementation_environments SET state='destroyed',cleanup_receipt=?,updated_at=? WHERE attempt_id=?")
        .bind(JSON.stringify({name:row.name,absent,checkedAt:now()}),now(),row.attempt_id).run();
    });
  }
  async cleanupRun(runId:string) {
    const rows=await this.env.DB.prepare("SELECT * FROM implementation_environments WHERE run_id=? AND state<>'destroyed'").bind(runId).all<EnvironmentRow>();
    for(const row of rows.results)await this.cleanup(row);
  }
  async reconcile() {
    const rows=await this.env.DB.prepare(`SELECT e.* FROM implementation_environments e
      JOIN agent_attempts a ON a.attempt_id=e.attempt_id JOIN orchestration_runs r ON r.run_id=e.run_id
      WHERE e.state<>'destroyed' AND a.state NOT IN ('pending','starting','running','collecting')
      AND (e.state='retiring' OR a.state IN ('failed','canceled','interrupted','absolute_timeout') OR r.status IN ('failed','canceled','succeeded','blocked')) LIMIT 20`).all<EnvironmentRow>();
    for(const row of rows.results)try {await this.cleanup(row);}catch(error){await this.store.error(row.run_id,row.attempt_id,'environment.cleanup',error);}
  }
}
