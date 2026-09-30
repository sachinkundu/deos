import {verifyAccess} from '../portal/src/auth.ts';
import {recordCaughtError} from './error-context.ts';
import {SharedTestRepairStore} from './shared-test-repair.ts';

type RepairEnv=Pick<Env,'DB'|'PORTAL_ACCESS_TEAM_DOMAIN'|'PORTAL_ACCESS_AUD'|
  'ROUTE_ADMIN_ALLOWED_EMAIL'|'STAGE_RETRY_SECRET'>;

interface VisibleRepair {
  repair_id:string;resource_id:string;saved_phase:string;
  allowed_action:string;expected_revision:number;task_key:string;
  task_title:string;safe_code:string;
}

const responseHeaders={'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options':'nosniff'};
const accessDenialCodes=new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED','ERR_JWT_EXPIRED','ERR_JWT_INVALID',
  'ERR_JWS_INVALID','ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED','ERR_JWKS_NO_MATCHING_KEY',
]);

function equal(a:string,b:string):boolean {
  if(a.length!==b.length)return false;
  let difference=0;
  for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);
  return difference===0;
}

async function token(secret:string,email:string,repairId:string,
  revision:number,window:number):Promise<string> {
  if(!secret)throw new Error('test_repair_csrf_secret_missing');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),
    {name:'HMAC',hash:'SHA-256'},false,['sign']);
  const content=`shared-test-repair-v1\n${email.toLowerCase()}\n${repairId}\n`+
    `${revision}\n${window}`;
  const digest=new Uint8Array(await crypto.subtle.sign('HMAC',key,
    new TextEncoder().encode(content)));
  let binary='';for(const byte of digest)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

/** Internal repair API rechecks Access, CSRF, owner revision, and named item. */
export class SharedTestRepairController {
  readonly env:RepairEnv;
  readonly authenticate:typeof verifyAccess;
  readonly now:()=>Date;
  constructor(env:RepairEnv,authenticate:typeof verifyAccess=verifyAccess,
    now:()=>Date=()=>new Date()) {
    this.env=env;this.authenticate=authenticate;this.now=now;
  }

  async handle(request:Request):Promise<Response> {
    const path=new URL(request.url).pathname;
    const match=path.match(/^\/internal\/test-repairs\/([a-f0-9-]{36})$/i);
    if(!match)return Response.json({error:'not_found'},{status:404,headers:responseHeaders});
    if(request.method!=='GET' && request.method!=='POST')
      return Response.json({error:'method_not_allowed'},
        {status:405,headers:responseHeaders});
    let email:string;
    try {
      email=(await this.authenticate(request.headers.get('CF-Access-Jwt-Assertion'),{
        teamDomain:this.env.PORTAL_ACCESS_TEAM_DOMAIN,
        audience:this.env.PORTAL_ACCESS_AUD,
        allowedEmail:this.env.ROUTE_ADMIN_ALLOWED_EMAIL})).email;
    } catch(error) {
      if(error instanceof Error && (error.message==='unauthorized' ||
          error.message==='forbidden' || accessDenialCodes.has(
            String((error as Error & {code?:string}).code))))
        return Response.json({error:'unauthorized'},{status:401,
          headers:responseHeaders});
      recordCaughtError(error,'src/shared-test-repair-controller.ts:auth');
      return Response.json({error:'authentication_unavailable'},
        {status:503,headers:responseHeaders});
    }
    const repairId=match[1];
    const row=await this.env.DB.prepare(`SELECT m.repair_id,m.resource_id,
      m.saved_phase,m.allowed_action,m.expected_revision,l.task_key,
      l.task_title,f.safe_code FROM test_manual_reconciliations m
      JOIN test_environment e ON e.owner_lease_id=m.lease_id
        AND e.owner_run_id=m.run_id AND e.site_id=1
      JOIN test_leases l ON l.lease_id=m.lease_id AND l.run_id=m.run_id
      JOIN test_resources r ON r.resource_id=m.resource_id
        AND r.lease_id=m.lease_id AND r.run_id=m.run_id
      JOIN test_failures f ON f.fault_id=m.first_fault_id
        AND f.run_id=m.run_id AND f.lease_id=m.lease_id
      WHERE m.repair_id=? AND m.choice IS NULL
        AND m.allowed_action='retry' AND e.state='blocked'
        AND e.revision=m.expected_revision
        AND e.hold_reason='repair:' || m.repair_id
        AND l.state='blocked' AND r.plan_state<>'absent'`)
      .bind(repairId).first<VisibleRepair>();
    if(!row)return Response.json({error:'repair_not_found'},
      {status:404,headers:responseHeaders});
    const window=Math.floor(this.now().getTime()/300_000);
    if(request.method==='GET')
      return Response.json({...row,csrfToken:await token(
        this.env.STAGE_RETRY_SECRET,email,repairId,row.expected_revision,window)},
      {headers:responseHeaders});
    if(request.headers.get('Origin')!=='https://deos-test.voxdez.com')
      return Response.json({error:'repair_origin_invalid'},
        {status:403,headers:responseHeaders});
    const body=await request.json() as Record<string,unknown>;
    if(body.version!==1 || body.choice!=='retry' ||
        body.expectedRevision!==row.expected_revision ||
        typeof body.csrfToken!=='string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.csrfToken))
      return Response.json({error:'repair_request_invalid'},
        {status:400,headers:responseHeaders});
    const [current,previous]=await Promise.all([
      token(this.env.STAGE_RETRY_SECRET,email,repairId,row.expected_revision,window),
      token(this.env.STAGE_RETRY_SECRET,email,repairId,row.expected_revision,window-1),
    ]);
    if(!equal(body.csrfToken,current) && !equal(body.csrfToken,previous))
      return Response.json({error:'repair_csrf_invalid'},
        {status:403,headers:responseHeaders});
    await new SharedTestRepairStore(this.env.DB).retry({repairId,
      expectedRevision:row.expected_revision,operatorEmail:email},this.now());
    return Response.json({state:'retry_scheduled',repairId},
      {headers:responseHeaders});
  }
}
