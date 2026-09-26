import {verifyAccess} from '../src/auth.ts';
import {sha256Hex} from '../../src/implementation-hash.ts';
import {recordCaughtError} from '../../src/error-context.ts';

interface TestPortalEnv {
  DB:D1Database;
  ARTIFACTS:R2Bucket;
  ACCESS_TEAM_DOMAIN:string;
  ACCESS_AUD:string;
  ALLOWED_EMAIL:string;
}

const headers={
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
};

function escape(value:string):string {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

const accessDenialCodes=new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWT_EXPIRED','ERR_JWT_INVALID',
  'ERR_JWS_INVALID','ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED','ERR_JWKS_NO_MATCHING_KEY',
]);

function accessDenied(error:unknown):boolean {
  if (!(error instanceof Error)) return false;
  if (error.message==='unauthorized' || error.message==='forbidden') return true;
  const code=(error as Error & {code?:string}).code;
  return code!==undefined && accessDenialCodes.has(code);
}

interface StatusRow {
  state:string;
  staging_state:string;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  fence:number;
  revision:number;
  hold_reason:string|null;
  first_fault_id:string|null;
  task_key:string|null;
  task_title:string|null;
  stage:string|null;
  base_manifest_id:string|null;
  created_at:string|null;
}

function stateLabel(state:string):string {
  return ({free:'Free',preparing:'Preparing the test',active:'Test in use',
    quiescing:'Stopping test activity',cleaning:'Cleaning the test',
    blocked:'Cleanup needs attention'} as Record<string,string>)[state] ?? 'Unavailable';
}

export async function testEnvironmentStatus(db:D1Database):Promise<StatusRow> {
  const row=await db.prepare(`SELECT e.state,e.owner_run_id,e.owner_lease_id,e.fence,
    e.revision,e.hold_reason,e.first_fault_id,l.task_key,l.task_title,l.stage,
    l.base_manifest_id,l.created_at,p.state AS staging_state
    FROM test_environment e LEFT JOIN test_leases l ON l.lease_id=e.owner_lease_id
    LEFT JOIN staging_release_pointer p ON p.site_id=e.site_id
    WHERE e.site_id=1`).first<StatusRow>();
  if (!row) throw new Error('test_environment_status_missing');
  if (!row.staging_state) throw new Error('test_environment_staging_pointer_missing');
  if (row.state==='free' && (row.owner_run_id || row.owner_lease_id))
    throw new Error('test_environment_free_owner_conflict');
  if (row.state!=='free' && (!row.owner_run_id || !row.owner_lease_id ||
      !row.task_key || !row.task_title))
    throw new Error('test_environment_owner_incomplete');
  return row;
}

function statusHtml(row:StatusRow):string {
  const owned=row.state!=='free';
  const baseReady=row.staging_state==='stable';
  const title=owned ? `${row.task_key} · ${row.task_title}` : 'Shared test site';
  const details=owned ? `<dl>
    <div><dt>Task</dt><dd>${escape(row.task_key!)} · ${escape(row.task_title!)}</dd></div>
    <div><dt>Stage</dt><dd>${escape(row.stage??'Shared test')}</dd></div>
    <div><dt>Staging base</dt><dd>${escape(row.base_manifest_id??'Unavailable')}</dd></div>
    <div><dt>Lease started</dt><dd>${escape(row.created_at??'Unavailable')}</dd></div>
  </dl>` : baseReady ? '<p>The site is ready for the next checked task.</p>' :
    '<p>The staging base is being prepared. No test lease can start yet.</p>';
  const hold=row.state==='blocked' ?
    `<p role="alert">Cleanup is blocked. An allowed operator can inspect the saved repair item.</p>` : '';
  return `<!doctype html><html lang="en"><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(title)} | DEOS test</title>
  <style>body{font:16px system-ui,sans-serif;background:#f5f7f8;color:#14221e;margin:0}
  main{max-width:720px;margin:8vh auto;padding:32px;background:white;border-radius:14px;
  box-shadow:0 12px 40px #1232}h1{font-size:2rem;line-height:1.2;margin:0 0 20px}
  .state{display:inline-block;padding:8px 12px;background:#e7f4ee;border-radius:100px;
  font-weight:650;margin:0 0 22px}dl{margin:0}dl div{padding:14px 0;border-top:1px solid #dce4e0}
  dt{color:#586b62;font-size:.88rem}dd{margin:4px 0 0;overflow-wrap:anywhere}</style>
  <main><p class="state">${escape(!owned && !baseReady ? 'Preparing the test site' : stateLabel(row.state))}</p>
  <h1>${escape(title)}</h1>${details}${hold}</main></html>`;
}

export async function routeTestPortal(request:Request,env:TestPortalEnv,
  authenticate:typeof verifyAccess=verifyAccess):Promise<Response> {
  let identity:{email:string};
  try {
    identity=await authenticate(request.headers.get('CF-Access-Jwt-Assertion'),{
      teamDomain:env.ACCESS_TEAM_DOMAIN,audience:env.ACCESS_AUD,
      allowedEmail:env.ALLOWED_EMAIL});
  } catch (error) {
    if (accessDenied(error))
      return Response.json({error:'unauthorized'},{status:401,headers});
    recordCaughtError(error,'portal/test-environment/worker.ts:auth');
    return Response.json({error:'authentication_unavailable'},{status:503,headers});
  }
  if (!identity.email) return Response.json({error:'unauthorized'},{status:401,headers});
  if (request.method!=='GET' && request.method!=='HEAD')
    return Response.json({error:'method_not_allowed'},{status:405,headers});
  const url=new URL(request.url);
  if (url.pathname==='/') {
    try {
      const row=await testEnvironmentStatus(env.DB);
      return new Response(request.method==='HEAD'?null:statusHtml(row),
        {headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
    } catch (error) {
      recordCaughtError(error,'portal/test-environment/worker.ts:status');
      return new Response('Test site status is unavailable',{status:503,headers});
    }
  }
  const reportMatch=url.pathname.match(/^\/reports\/([a-zA-Z0-9._:-]{1,120})$/);
  if (reportMatch) {
    const leaseId=reportMatch[1];
    const row=await env.DB.prepare(`SELECT report_object_key,report_sha256
      FROM test_lease_closures WHERE lease_id=? AND report_state='complete'`)
      .bind(leaseId).first<{report_object_key:string;report_sha256:string}>();
    if (!row?.report_object_key || !row.report_sha256)
      return Response.json({error:'report_not_found'},{status:404,headers});
    const object=await env.ARTIFACTS.get(row.report_object_key);
    if (!object) return Response.json({error:'report_unavailable'},{status:503,headers});
    const body=await object.text();
    if (await sha256Hex(body)!==row.report_sha256)
      return Response.json({error:'report_unavailable'},{status:503,headers});
    return new Response(request.method==='HEAD'?null:body,
      {headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  }
  return Response.json({error:'not_found'},{status:404,headers});
}

export default {
  fetch(request,env) {return routeTestPortal(request,env);},
} satisfies ExportedHandler<TestPortalEnv>;
