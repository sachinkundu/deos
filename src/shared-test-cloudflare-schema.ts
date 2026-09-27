import type {TestSchemaProvider} from './shared-test-schema-provisioner.ts';

interface QueryResult {
  success:boolean;
  results?:unknown[];
}

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const migrationName=/^migrations\/([0-9]{4}_[a-z0-9_]+\.sql)$/;

/** Only the trusted coordinator can apply pinned SQL to a named lease database. */
export class SharedTestCloudflareSchema implements TestSchemaProvider {
  readonly accountId:string;
  readonly token:string;
  readonly fetcher:typeof fetch;
  constructor(accountId:string,token:string,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    if (!/^[a-f0-9]{32}$/.test(accountId) || !token)
      throw new Error('shared_test_schema_provider_unconfigured');
    this.accountId=accountId;this.token=token;this.fetcher=fetcher;
  }

  private async api(databaseId:string,action:'get'|'query',body?:unknown):Promise<unknown> {
    const path=`/accounts/${this.accountId}/d1/database/${databaseId}`+
      (action==='query'?'/query':'');
    const response=await this.fetcher(`https://api.cloudflare.com/client/v4${path}`,{
      method:action==='query'?'POST':'GET',
      headers:{Authorization:`Bearer ${this.token}`,
        ...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:body===undefined?undefined:JSON.stringify(body),redirect:'manual',
      signal:AbortSignal.timeout(20_000),
    });
    const raw=await response.text();
    if (!response.ok)
      throw new Error(`Cloudflare ${action} ${path}: HTTP ${response.status} `+
        raw.replaceAll(this.token,'[redacted]'));
    let value:{success?:boolean;result?:unknown;errors?:unknown};
    try {value=JSON.parse(raw) as typeof value;}
    catch (error) {throw new Error(`Cloudflare ${action} ${path}: invalid JSON`,{cause:error});}
    if (value.success!==true)
      throw new Error(`Cloudflare ${action} ${path}: `+
        JSON.stringify(value.errors).replaceAll(this.token,'[redacted]'));
    return value.result;
  }

  private async query(databaseId:string,sql:string,params?:string[]):Promise<QueryResult[]> {
    const result=await this.api(databaseId,'query',{sql,...(params?{params}:{})});
    if (!Array.isArray(result) || !result.length || result.some(row=>
      !row || typeof row!=='object' || (row as QueryResult).success!==true))
      throw new Error(`shared_test_schema_query_failed:${databaseId}:`+
        JSON.stringify(result).replaceAll(this.token,'[redacted]'));
    return result as QueryResult[];
  }

  private async database(databaseId:string,databaseName:string):Promise<void> {
    const value=await this.api(databaseId,'get');
    if (!value || typeof value!=='object' ||
        (value as {uuid?:unknown}).uuid!==databaseId ||
        (value as {name?:unknown}).name!==databaseName)
      throw new Error('shared_test_schema_database_identity_changed');
  }

  async apply(input:{runId:string;leaseId:string;fence:number;databaseId:string;
    databaseName:string},migrations:ReadonlyMap<string,Uint8Array>):Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(input.leaseId) || !input.runId ||
        !Number.isSafeInteger(input.fence) || input.fence<1 ||
        !uuid.test(input.databaseId) ||
        input.databaseName!==`deos-test-portal-db-${input.leaseId.slice(0,32)}` ||
        !migrations.has('migrations/0001_initial.sql') || migrations.size>200 ||
        [...migrations.keys()].some(name=>!migrationName.test(name)))
      throw new Error('shared_test_schema_subject_invalid');
    await this.database(input.databaseId,input.databaseName);
    await this.query(input.databaseId,`CREATE TABLE IF NOT EXISTS d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const names=[...migrations.keys()].sort();
    for (const path of names) {
      const name=path.slice('migrations/'.length);
      const found=await this.query(input.databaseId,
        'SELECT name FROM d1_migrations WHERE name=?',[name]);
      if ((found[0].results??[]).some(row=>
        row && typeof row==='object' && (row as {name?:unknown}).name===name))
        continue;
      const sql=new TextDecoder('utf-8',{fatal:true,ignoreBOM:false})
        .decode(migrations.get(path));
      if (!sql.trim() || sql.length>500_000)
        throw new Error(`shared_test_schema_migration_invalid:${name}`);
      // The API runs semicolon-separated statements as one batch. The fixed
      // filename is validated before being inserted into the tracking SQL.
      await this.query(input.databaseId,
        `${sql.trim()}\nINSERT INTO d1_migrations(name) VALUES ('${name}');`);
      const saved=await this.query(input.databaseId,
        'SELECT name FROM d1_migrations WHERE name=?',[name]);
      if ((saved[0].results??[]).length!==1)
        throw new Error(`shared_test_schema_migration_unconfirmed:${name}`);
    }
    await this.database(input.databaseId,input.databaseName);
    const applied=await this.query(input.databaseId,
      'SELECT name FROM d1_migrations ORDER BY name');
    const saved=(applied[0].results??[]).map(row=>
      row && typeof row==='object'?(row as {name?:unknown}).name:undefined);
    if (JSON.stringify(saved)!==JSON.stringify(names.map(path=>path.slice('migrations/'.length))))
      throw new Error('shared_test_schema_readback_mismatch');
  }
}
