import type {TestStoreProvider} from './shared-test-store-provisioner.ts';

type StorePlan=Parameters<TestStoreProvider['lookup']>[0];

/** This credential belongs only to the trusted coordinator, never a demo Sandbox. */
export class SharedTestCloudflareStores implements TestStoreProvider {
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

  async create(plan:StorePlan):Promise<string> {
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
}
