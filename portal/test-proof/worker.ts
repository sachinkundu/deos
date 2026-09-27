import {sharedTestProofOrigin,sharedTestProofUrl} from '../../src/shared-test-proof-url.ts';

interface ProofEnv {DB:D1Database;ARTIFACTS:R2Bucket;}
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
  'Referrer-Policy':'no-referrer'};

/** This public Worker can read only a passed projection, never a raw capture. */
export async function routePublicProof(request:Request,env:ProofEnv):Promise<Response> {
  if(request.method!=='GET' && request.method!=='HEAD')
    return Response.json({error:'method_not_allowed'},{status:405,headers});
  const url=new URL(request.url);
  if(url.origin!==sharedTestProofOrigin)
    return Response.json({error:'not_found'},{status:404,headers});
  const match=url.pathname.match(/^\/proof\/([a-f0-9-]{36})$/i);
  if(!match)return Response.json({error:'not_found'},{status:404,headers});
  const proofId=match[1];
  const row=await env.DB.prepare(`SELECT proof_id,lease_id,kind,content_type,
    public_sha256
    FROM test_proof_items WHERE proof_id=? AND kind IN
      ('app_screen','linear_screen','showboat','d1_read',
       'provider_receipt','github_receipt') AND classification='public_safe'
      AND sanitizer_result='passed' AND public_sha256 IS NOT NULL
      AND public_url=?`)
    .bind(proofId,sharedTestProofUrl(proofId))
    .first<{proof_id:string;lease_id:string;kind:string;
      content_type:string;public_sha256:string}>();
  if(!row)return Response.json({error:'proof_not_found'},{status:404,headers});
  const media:Record<string,string>={
    app_screen:'image/png',linear_screen:'image/png',
    showboat:'text/plain',d1_read:'application/json',
    provider_receipt:'application/json',github_receipt:'application/json',
  };
  if(media[row.kind]!==row.content_type)
    return Response.json({error:'proof_unavailable'},{status:503,headers});
  const extension=row.content_type==='image/png'?'png':
    row.content_type==='text/plain'?'txt':'json';
  const key=`shared-test/public/${encodeURIComponent(row.lease_id)}/${row.proof_id}.${extension}`;
  const object=await env.ARTIFACTS.get(key);
  if(!object)return Response.json({error:'proof_unavailable'},{status:503,headers});
  const bytes=new Uint8Array(await object.arrayBuffer());
  if(bytes.byteLength>8_000_000)
    return Response.json({error:'proof_unavailable'},{status:503,headers});
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==row.public_sha256)
    return Response.json({error:'proof_unavailable'},{status:503,headers});
  return new Response(request.method==='HEAD'?null:bytes,{headers:{...headers,
    'Content-Type':row.content_type}});
}

export default {
  fetch(request,env){return routePublicProof(request,env);},
} satisfies ExportedHandler<ProofEnv>;
