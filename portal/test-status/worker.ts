import {verifyAccess} from '../src/auth.ts';

interface StatusEnv {
  DB:D1Database;
  ACCESS_TEAM_DOMAIN:string;
  ACCESS_AUD:string;
  ALLOWED_EMAIL:string;
}

interface StatusRow {
  state:string;
  saved_phase:string|null;
  owner_run_id:string|null;
  owner_lease_id:string|null;
  hold_reason:string|null;
  updated_at:string;
  task_key:string|null;
  task_title:string|null;
}

const headers={'Cache-Control':'no-store','Content-Security-Policy':
  "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};

function escape(value:string):string {
  return value.replaceAll('&','&amp;').replaceAll('<','&lt;')
    .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
}

export function statusHtml(row:StatusRow):string {
  const key=row.task_key ? escape(row.task_key) : '';
  const title=row.task_title ? escape(row.task_title) : '';
  const heading=key ? `${key} · ${title}` : 'Test site available';
  const state=escape(row.state);
  const detail=row.state==='free' ? 'No run owns the shared test site.' :
    row.state==='blocked' ? 'Cleanup needs attention before another test can start.' :
    row.state==='preparing' ? 'The test services are being prepared.' :
    row.state==='active' ? 'The test is in progress.' :
    'The test is being cleaned up.';
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${heading} · DEOS test</title><style>body{font:16px system-ui,sans-serif;background:#f6f8fa;color:#17212b;margin:0}main{max-width:640px;margin:10vh auto;padding:24px}article{background:white;border:1px solid #d9e0e6;border-radius:14px;padding:28px}h1{font-size:1.7rem;line-height:1.2;margin:0 0 16px}p{line-height:1.5}.state{display:inline-block;background:#e8eef4;border-radius:99px;padding:6px 12px;text-transform:capitalize}small{color:#52606d}</style><main><article><h1>${heading}</h1><p class="state">${state}</p><p>${detail}</p><small>Updated ${escape(row.updated_at)}</small></article></main></html>`;
}

export async function handleTestStatus(request:Request,env:StatusEnv,
  authenticate:typeof verifyAccess=verifyAccess):Promise<Response> {
  const url=new URL(request.url);
  if (url.hostname!=='deos-test.voxdez.com' || url.pathname!=='/' ||
      request.method!=='GET')
    return new Response('Not found',{status:404,headers});
  try {
    await authenticate(request.headers.get('CF-Access-Jwt-Assertion'),{
      teamDomain:env.ACCESS_TEAM_DOMAIN,audience:env.ACCESS_AUD,
      allowedEmail:env.ALLOWED_EMAIL,
    });
  } catch (error) {
    if (error instanceof Error && error.message==='forbidden')
      return new Response('Forbidden',{status:403,headers});
    if (error instanceof Error &&
        ['unauthorized','authentication unavailable'].includes(error.message))
      return new Response('Unauthorized',{status:401,headers});
    throw error;
  }
  const row=await env.DB.prepare(`SELECT e.state,e.saved_phase,e.owner_run_id,
    e.owner_lease_id,e.hold_reason,e.updated_at,l.task_key,l.task_title
    FROM test_environment e LEFT JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1`).first<StatusRow>();
  if (!row) throw new Error('shared_test_status_row_missing');
  if (row.state!=='free' && (!row.owner_lease_id || !row.task_key || !row.task_title))
    throw new Error('shared_test_status_owner_incomplete');
  return new Response(statusHtml(row),{status:200,headers:{...headers,
    'Content-Type':'text/html; charset=utf-8'}});
}

export default {fetch:handleTestStatus};
