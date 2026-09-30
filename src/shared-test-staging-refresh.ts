import {sharedTestStagingTraffic} from './shared-test-coordinator.ts';
import {SharedTestStagingPointer} from './shared-test-staging-pointer.ts';

/** Bootstrap the stable staging pointer while new lease grants are disabled. */
export async function refreshSharedTestStaging(request:Request,env:Env,
  sync:()=>Promise<{state:string;manifest_id:string|null;
    manifest_revision:number|null}>=()=>new SharedTestStagingPointer(env.DB)
      .sync(sharedTestStagingTraffic(env))):Promise<Response> {
  if(request.method!=='POST')
    return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET ||
      request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const pointer=await sync();
  return Response.json({state:pointer.state,manifestId:pointer.manifest_id,
    revision:pointer.manifest_revision},
  {headers:{'Cache-Control':'no-store'}});
}
