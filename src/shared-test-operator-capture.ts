import {SharedTestRawProofStore} from './shared-test-raw-proof.ts';

/** Import the connected operator browser's real PNG privately. Publication is
 * a separate fixed-mask/OCR step; agents cannot call this endpoint. */
export async function importSharedTestLinearCapture(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET || request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const runId=request.headers.get('X-Test-Run-Id')??'',leaseId=request.headers.get('X-Test-Lease-Id')??'';
  const fence=Number(request.headers.get('X-Test-Fence')),url=request.headers.get('X-Test-Source-Url')??'';
  if(!runId || runId.length>512 || !/^[a-f0-9]{64}$/.test(leaseId) ||
      !Number.isSafeInteger(fence) || fence<1 || request.headers.get('Content-Type')!=='image/png' ||
      Number(request.headers.get('Content-Length'))>8_000_000)
    return Response.json({error:'test_operator_capture_input_invalid'},{status:400});
  const reader=request.body?.getReader();
  if(!reader)return Response.json({error:'test_operator_capture_empty'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  try {
    for(;;) {
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>8_000_000){await reader.cancel();return Response.json({error:'test_operator_capture_too_large'},{status:413});}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const image=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){image.set(chunk,offset);offset+=chunk.byteLength;}
  const proofId=await new SharedTestRawProofStore(env.DB,env.ARTIFACTS)
    .saveLinearScreen(runId,leaseId,{image,url},new Date(),fence);
  return Response.json({proofId,classification:'private',sanitizerResult:'pending'},
    {headers:{'Cache-Control':'no-store'}});
}
