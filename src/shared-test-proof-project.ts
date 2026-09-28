import {CloudflareImageSanitizerRunner,SharedTestImageSanitizer,
  type ImageProofRecipe} from './shared-test-image-sanitizer.ts';
import {SharedTestFailureStore} from './shared-test-failures.ts';

interface PendingImage {
  run_id:string;lease_id:string;kind:string;source_sha256:string;
  task_key:string;task_title:string;
}
interface ProjectionRequest {
  proofId:string;width:number;height:number;crop:ImageProofRecipe['crop'];
  masks:ImageProofRecipe['masks'];identityLine:'key'|'key_title'|'key_dot_title';
}

export function sharedTestImageRecipe(row:PendingImage,
  value:ProjectionRequest):ImageProofRecipe {
  const identities={key:row.task_key,
    key_title:`${row.task_key} ${row.task_title}`,
    key_dot_title:`${row.task_key} · ${row.task_title}`};
  const allowedText=[...new Set([
    ...Object.values(identities),row.task_title,
    'DEOS','BettaView','Review','Workflow','Status','Continue',
    'Todo','In Progress','Human Review','Canceled','Merging',
    'Comment','Approve','Request changes','Test in use',
  ])];
  return {version:1,sourceSha256:row.source_sha256,
    width:value.width,height:value.height,crop:value.crop,masks:value.masks,
    allowedText,requiredText:[identities[value.identityLine]]};
}

/** An operator chooses geometry; only saved public task fields can pass OCR. */
export async function projectSharedTestImage(request:Request,env:Env):Promise<Response> {
  if(request.method!=='POST')
    return Response.json({error:'method_not_allowed'},{status:405});
  if(!env.STAGE_RETRY_SECRET ||
      request.headers.get('Authorization')!==`Bearer ${env.STAGE_RETRY_SECRET}`)
    return Response.json({error:'invalid_operator_capability'},{status:401});
  const value=await request.json() as ProjectionRequest;
  if(!value || typeof value!=='object' || Array.isArray(value) ||
      Object.keys(value).sort().join(',')!==
        'crop,height,identityLine,masks,proofId,width' ||
      !/^[a-f0-9-]{36}$/i.test(value.proofId) ||
      !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) ||
      !value.crop || typeof value.crop!=='object' ||
      !Array.isArray(value.masks) || value.masks.length>32 ||
      !['key','key_title','key_dot_title'].includes(value.identityLine))
    return Response.json({error:'test_image_projection_invalid'},{status:400});
  const row=await env.DB.prepare(`SELECT p.run_id,p.lease_id,p.kind,
    p.source_sha256,l.task_key,l.task_title FROM test_proof_items p
    JOIN test_leases l ON l.lease_id=p.lease_id AND l.run_id=p.run_id
    JOIN test_environment e ON e.owner_lease_id=l.lease_id
      AND e.owner_run_id=l.run_id
    WHERE p.proof_id=? AND p.classification='private'
      AND p.sanitizer_result='pending' AND p.phase='first'
      AND p.kind IN ('app_screen','linear_screen')
      AND e.site_id=1 AND e.state IN ('active','quiescing')`)
    .bind(value.proofId).first<PendingImage>();
  if(!row || !/^[A-Z]+-\d+$/.test(row.task_key) ||
      !row.task_title || row.task_title.length>160)
    return Response.json({error:'test_image_projection_scope_changed'},{status:409});
  const recipe=sharedTestImageRecipe(row,value);
  try {
    const url=await new SharedTestImageSanitizer(env.DB,env.ARTIFACTS,
      new CloudflareImageSanitizerRunner(env.ImplementationSandbox))
      .project(value.proofId,recipe);
    return Response.json({proofId:value.proofId,publicUrl:url,
      sanitizerVersion:'fixed-mask-ocr-v1'},
    {headers:{'Cache-Control':'no-store'}});
  }catch(error) {
    try {
      await new SharedTestFailureStore(env.DB,env.ARTIFACTS).record({
        runId:row.run_id,leaseId:row.lease_id,phase:'proof',
        operation:'shared_test.project_image',
        safeCode:'test_image_projection_failed',
      },error);
    }catch(diagnostic) {
      throw new AggregateError([error,diagnostic],
        'Test image projection and diagnostic storage failed',{cause:error});
    }
    throw error;
  }
}
