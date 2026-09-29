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
  const hostname=`portal-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`;
  const response=await fetcher(`https://${hostname}/api/version`,{
    method:'GET',redirect:'manual',signal:AbortSignal.timeout(20_000),
    headers:{Accept:'application/json',
      'CF-Access-Client-Id':env.TEST_APP_SERVICE_CLIENT_ID,
      'CF-Access-Client-Secret':env.TEST_APP_SERVICE_CLIENT_SECRET},
  });
  return Response.json({hostname,status:response.status,
    admitted:response.status===200},{headers:{'Cache-Control':'no-store'}});
}
