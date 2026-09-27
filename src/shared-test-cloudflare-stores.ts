import type {TestStoreCleanupProvider} from './shared-test-store-provisioner.ts';

type StorePlan=Parameters<TestStoreCleanupProvider['lookup']>[0];

/** This credential belongs only to the trusted coordinator, never a demo Sandbox. */
export class SharedTestCloudflareStores implements TestStoreCleanupProvider {
  readonly accountId:string;
  readonly token:string;
  readonly fetcher:typeof fetch;
  constructor(accountId:string,token:string,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    if (!/^[a-f0-9]{32}$/.test(accountId) || !token)
      throw new Error('shared_test_store_provider_unconfigured');
    this.accountId=accountId;this.token=token;this.fetcher=fetcher;
  }

  private async api(path:string,init:RequestInit={},missing=false):Promise<unknown> {
    const response=await this.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}${path}`,{
        ...init,headers:{...init.headers,Authorization:`Bearer ${this.token}`},
        redirect:'manual',signal:AbortSignal.timeout(20_000),
      });
    if (missing && response.status===404) return null;
    const raw=await response.text();
    if (!response.ok)
      throw new Error(`Cloudflare ${init.method??'GET'} ${path}: HTTP ${response.status} ${raw.replaceAll(this.token,'[redacted]')}`);
    const envelope=JSON.parse(raw) as {success?:boolean;result?:unknown;errors?:unknown};
    if (envelope.success!==true)
      throw new Error(`Cloudflare ${init.method??'GET'} ${path}: ${JSON.stringify(envelope.errors).replaceAll(this.token,'[redacted]')}`);
    return envelope.result;
  }

  async lookup(plan:StorePlan):Promise<string|null> {
    if (plan.kind==='d1_database') {
      const result=await this.api(`/d1/database?name=${encodeURIComponent(plan.providerKey)}`);
      if (!Array.isArray(result)) throw new Error('shared_test_d1_inventory_invalid');
      const matches=result.filter(value=>value && typeof value==='object' &&
        (value as {name?:unknown}).name===plan.providerKey);
      if (matches.length>1) throw new Error('shared_test_d1_name_ambiguous');
      const uuid=(matches[0] as {uuid?:unknown}|undefined)?.uuid;
      if (!matches.length) return null;
      if (typeof uuid!=='string' || !uuid) throw new Error('shared_test_d1_identity_invalid');
      return uuid;
    }
    const value=await this.api(`/r2/buckets/${encodeURIComponent(plan.providerKey)}`,{},true);
    if (value===null) return null;
    if (!value || typeof value!=='object' ||
        (value as {name?:unknown}).name!==plan.providerKey)
      throw new Error('shared_test_r2_identity_invalid');
    return plan.providerKey;
  }

  async create(plan:StorePlan,assertFence?:()=>Promise<void>):Promise<string> {
    await assertFence?.();
    const path=plan.kind==='d1_database'?'/d1/database':'/r2/buckets';
    const value=await this.api(path,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({name:plan.providerKey})});
    if (!value || typeof value!=='object' ||
        (value as {name?:unknown}).name!==plan.providerKey)
      throw new Error(`shared_test_store_create_identity_invalid:${plan.resourceId}`);
    if (plan.kind==='r2_bucket') return plan.providerKey;
    const uuid=(value as {uuid?:unknown}).uuid;
    if (typeof uuid!=='string' || !uuid)
      throw new Error(`shared_test_store_create_id_invalid:${plan.resourceId}`);
    return uuid;
  }

  private async objectKeys(bucket:string):Promise<string[]> {
    const path=`/r2/buckets/${encodeURIComponent(bucket)}/objects?per_page=1000`;
    const response=await this.fetcher(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}${path}`,{
        headers:{Authorization:`Bearer ${this.token}`},redirect:'manual',
        signal:AbortSignal.timeout(20_000),
      });
    const raw=await response.text();
    if(!response.ok)throw new Error(`Cloudflare GET ${path}: `+
      `HTTP ${response.status} ${raw.replaceAll(this.token,'[redacted]')}`);
    let envelope:{success?:boolean;result?:unknown;result_info?:{
      is_truncated?:unknown};errors?:unknown};
    try {envelope=JSON.parse(raw) as typeof envelope;}
    catch(error){throw new Error(`Cloudflare GET ${path}: invalid JSON`,{cause:error});}
    if(envelope.success!==true || !Array.isArray(envelope.result))
      throw new Error(`Cloudflare GET ${path}: `+
        JSON.stringify(envelope.errors).replaceAll(this.token,'[redacted]'));
    const keys=envelope.result.map(value=>value && typeof value==='object'?
      (value as {key?:unknown}).key:undefined);
    if(keys.some(key=>typeof key!=='string' || !key) ||
      (keys.length===0 && envelope.result_info?.is_truncated===true))
      throw new Error('shared_test_r2_object_inventory_invalid');
    return keys as string[];
  }

  async remove(plan:StorePlan,remoteId:string):Promise<void> {
    if (plan.kind==='d1_database') {
      if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(remoteId))
        throw new Error('shared_test_d1_delete_id_invalid');
      await this.api(`/d1/database/${remoteId}`,{method:'DELETE'});
    } else {
      if (remoteId!==plan.providerKey)
        throw new Error('shared_test_r2_delete_identity_changed');
      for(let page=0;page<1000;page++) {
        const keys=await this.objectKeys(plan.providerKey);
        if(!keys.length)break;
        for(const key of keys) {
          // R2's object API requires literal slash separators in object keys.
          const encoded=encodeURIComponent(key).replaceAll('%2F','/');
          await this.api(`/r2/buckets/${encodeURIComponent(plan.providerKey)}`+
            `/objects/${encoded}`,{method:'DELETE'});
        }
        if(page===999)throw new Error('shared_test_r2_cleanup_limit_reached');
      }
      if((await this.objectKeys(plan.providerKey)).length ||
          (await this.objectKeys(plan.providerKey)).length)
        throw new Error('shared_test_r2_cleanup_not_empty');
      await this.api(`/r2/buckets/${encodeURIComponent(plan.providerKey)}`,
        {method:'DELETE'});
    }
  }
}
