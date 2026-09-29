/** Retain data before deleting a blocked lease. Started scenarios require a
 * verified settlement receipt before this snapshot can run. */
export async function snapshotBlockedSetup(env:Env & {IMPLEMENTATION_ENVIRONMENT_TOKEN?:string},runId:string,leaseId:string,
  request:typeof fetch=globalThis.fetch.bind(globalThis)) {
  const guard=async()=>{
    const row=await env.DB.prepare(`SELECT 1 AS ready FROM test_environment e
      WHERE e.site_id=1 AND e.state='quiescing' AND e.owner_run_id=? AND e.owner_lease_id=?
        AND (NOT EXISTS (SELECT 1 FROM test_review_scenarios WHERE lease_id=?) OR
          EXISTS (SELECT 1 FROM test_review_unpublished_settlements s JOIN test_leases l
            ON l.lease_id=s.lease_id WHERE s.lease_id=e.owner_lease_id AND s.run_id=e.owner_run_id
              AND s.cleanup_fence=e.fence AND s.candidate_commit=l.candidate_commit))
        AND NOT EXISTS (SELECT 1 FROM test_review_provider_requests WHERE lease_id=? AND finished_at IS NULL)
        AND NOT EXISTS (SELECT 1 FROM test_github_transport_requests WHERE lease_id=? AND finished_at IS NULL)`)
      .bind(runId,leaseId,leaseId,leaseId,leaseId).first<{ready:number}>();
    if(row?.ready!==1)throw new Error('test_setup_snapshot_not_quiescent');
  };
  await guard();
  const resources=(await env.DB.prepare(`SELECT kind,provider_key,remote_id FROM test_resources
    WHERE run_id=? AND lease_id=? AND kind IN ('d1_database','r2_bucket') AND plan_state='created'`)
    .bind(runId,leaseId).all<{kind:string;provider_key:string;remote_id:string}>()).results;
  if(!resources.length)return null;
  const account=env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID,token=env.IMPLEMENTATION_ENVIRONMENT_TOKEN;
  if(!/^[a-f0-9]{32}$/.test(account)||!token)throw new Error('test_setup_snapshot_provider_missing');
  const api=async(path:string,sql?:string)=>{
    await guard();
    const response=await request(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{
      method:sql?'POST':'GET',headers:{Authorization:`Bearer ${token}`,
        ...(sql?{'Content-Type':'application/json'}:{})},
      ...(sql?{body:JSON.stringify({sql})}:{}),redirect:'manual',signal:AbortSignal.timeout(30_000)});
    if(!response.ok)throw new Error(`Setup snapshot ${path}: HTTP ${response.status}: `+
      (await response.text()).replaceAll(token,'[redacted]'));
    return response;
  };
  const envelope=async(path:string,sql?:string)=>{
    const value=await (await api(path,sql)).json() as {success:boolean;result:unknown;errors:unknown;result_info?:{cursor?:string}};
    if(value.success!==true)throw new Error(`Setup snapshot ${path}: ${JSON.stringify(value.errors)}`);
    return value;
  };
  const save=async(bytes:Uint8Array)=>{
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const key=`shared-test/failed/${leaseId}/setup/${hash}`;
    await env.ARTIFACTS.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},customMetadata:{evidenceClass:'private-failure'}});
    const read=await env.ARTIFACTS.get(key);
    if(!read||[...new Uint8Array(await crypto.subtle.digest('SHA-256',await read.arrayBuffer()))]
      .map(n=>n.toString(16).padStart(2,'0')).join('')!==hash)
      throw new Error('test_setup_snapshot_readback_failed');
    return {key,sha256:hash,bytes:bytes.byteLength};
  };
  const snapshots:unknown[]=[];
  for(const resource of resources) {
    const suffix=leaseId.slice(0,32);
    if(resource.kind==='d1_database') {
      if(resource.provider_key!==`deos-test-portal-db-${suffix}`||! /^[a-f0-9-]{36}$/.test(resource.remote_id))
        throw new Error('test_setup_snapshot_database_scope_changed');
      const root=`/d1/database/${resource.remote_id}`;
      const identity=(await envelope(root)).result as {uuid:string;name:string};
      if(identity.uuid!==resource.remote_id||identity.name!==resource.provider_key)
        throw new Error('test_setup_snapshot_database_identity_changed');
      const query=async(sql:string)=>{
        const rows=(await envelope(root+'/query',sql)).result as Array<{success:boolean;results:unknown[]}>;
        if(!Array.isArray(rows)||rows.length!==1||rows[0].success!==true||!Array.isArray(rows[0].results))
          throw new Error('test_setup_snapshot_query_failed');
        return rows[0].results;
      };
      const schema=await query("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name") as Array<{name:string;sql:string}>;
      const tables=[];
      for(const table of schema) {
        if(!/^[A-Za-z0-9_]+$/.test(table.name))throw new Error('test_setup_snapshot_table_name_invalid');
        const rows=await query(`SELECT * FROM "${table.name}" LIMIT 10001`);
        if(rows.length>10000)throw new Error('test_setup_snapshot_table_too_large');
        tables.push({...table,rows});
      }
      const bytes=new TextEncoder().encode(JSON.stringify({version:1,resource,tables}));
      if(bytes.byteLength>20_000_000)throw new Error('test_setup_snapshot_database_too_large');
      snapshots.push({kind:'database',resource,...await save(bytes)});
    } else {
      if(resource.provider_key!==`deos-test-portal-artifacts-${suffix}`||resource.remote_id!==resource.provider_key)
        throw new Error('test_setup_snapshot_bucket_scope_changed');
      const root=`/r2/buckets/${resource.provider_key}/objects`;
      const listed=await envelope(root+'?per_page=1000');
      const objects=listed.result as Array<{key:string;size:number}>;
      if(!Array.isArray(objects)||objects.length>=1000||listed.result_info?.cursor)
        throw new Error('test_setup_snapshot_bucket_pagination_required');
      // Preserve exact bytes, including captures. Reject unbounded objects.
      for(const object of objects) {
        if(object.size>20_000_000)throw new Error('test_setup_snapshot_object_too_large');
        const bytes=new Uint8Array(await (await api(root+'/'+encodeURIComponent(object.key))).arrayBuffer());
        snapshots.push({kind:'object',resource,sourceKey:object.key,...await save(bytes)});
      }
    }
  }
  await guard();
  return {version:1,snapshots};
}
