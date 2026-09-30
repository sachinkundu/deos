/** Operator-only check of the deployed Worker's Access credential. */
export async function probeSharedTestAccess(request:Request,env:Pick<Env,
  'DB'|'STAGE_RETRY_SECRET'|'TEST_APP_SERVICE_CLIENT_ID'|
  'TEST_APP_SERVICE_CLIENT_SECRET'>,
  fetcher:typeof fetch=globalThis.fetch.bind(globalThis)):Promise<Response> {
  if(request.method!=='POST')
    return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET ||
      request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const owner=await env.DB.prepare(`SELECT owner_lease_id FROM test_environment
    WHERE site_id=1`).first<{owner_lease_id:string|null}>();
  const leaseId=owner?.owner_lease_id;
  if(!leaseId || !/^[a-f0-9]{64}$/.test(leaseId))
    return Response.json({error:'shared_test_lease_unavailable'},{status:409});
  if(!env.TEST_APP_SERVICE_CLIENT_ID || !env.TEST_APP_SERVICE_CLIENT_SECRET)
    return Response.json({error:'shared_test_access_credential_missing'},{status:503});
  const raw=await request.text();
  let requested:{service?:unknown}={};
  if(raw) {
    try {requested=JSON.parse(raw) as {service?:unknown};}
    catch(error) {
      if(error instanceof SyntaxError)
        return Response.json({error:'invalid_request'},{status:400});
      throw error;
    }
  }
  const service=requested?.service??'portal';
  if(service!=='portal'&&service!=='bettaview')
    return Response.json({error:'invalid_service'},{status:400});
  const hostname=`${service}-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`;
  const response=await fetcher(`https://${hostname}/api/version`,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(20_000),
    headers:{Accept:'application/json',
      'CF-Access-Client-Id':env.TEST_APP_SERVICE_CLIENT_ID,
      'CF-Access-Client-Secret':env.TEST_APP_SERVICE_CLIENT_SECRET},
  });
  const value=response.status===200?await response.json() as Record<string,unknown>:null;
  return Response.json({hostname,status:response.status,
    admitted:response.status===200,version:value?{
      canonicalHost:value.canonicalHost,sourceSha:value.sourceSha,
      baseVersionId:value.baseVersionId,buildInputSha256:value.buildInputSha256,
      versionId:value.versionId}:null},{headers:{'Cache-Control':'no-store'}});
}
