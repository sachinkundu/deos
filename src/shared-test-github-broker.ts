import {sha256Hex} from './implementation-hash.ts';
import {assertSharedTestGitHubRequest,type SharedTestGitHubScope} from './shared-test-github-scope.ts';
import {describeSharedTestError} from './shared-test-failures.ts';
import {sharedTestReviewFixture} from './shared-test-review-profile.ts';
import {sharedTestReviewAssertion,sharedTestReviewKey} from './shared-test-review-signing.ts';
import {takeSharedReviewFault,takeSharedReplyReadFault} from './shared-test-review-faults.ts';

export const sharedTestGitHubCallback=
  'https://deos-queue-consumer-ts.skundu.workers.dev/shared-test/github/callback';
const clientId='Iv23likxukpheraNrZlx';
const encoder=new TextEncoder();
const decoder=new TextDecoder();

type BrokerEnv=Pick<Env,'DB'|'TEST_MARKER_KEY_V1'|'GITHUB_API_URL'> & {
  SHARED_TEST_GITHUB_CLIENT_SECRET?:string;
  IMPLEMENTATION_TEST_GITHUB_TOKEN?:string;
};
interface LiveSession extends SharedTestGitHubScope {
  run_id:string;attempt_id:string;lease_id:string;fence:number;
  origin:string;app_session_sha256:string;expires_at:string;
}
interface OAuthState extends LiveSession {
  state_sha256:string;return_to:string;claimed_at:string|null;
  handoff_sha256:string|null;handoff_expires_at:string|null;
  handoff_used_at:string|null;handoff_session_sha256:string|null;
  token_ciphertext:string|null;
  token_nonce:string|null;token_expires_at:string|null;
}
interface GitHubSession extends LiveSession {
  session_sha256:string;token_ciphertext:string;token_nonce:string;
  credential_source:'oauth'|'test_reviewer';
  fixture_resource_id:string|null;github_user_id:number|null;
}

function random():string {
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}
function base64url(bytes:Uint8Array):string {
  let binary='';
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
function decode64(value:string):Uint8Array {
  const padded=value.replaceAll('-','+').replaceAll('_','/')+
    '='.repeat((4-value.length%4)%4);
  return Uint8Array.from(atob(padded),character=>character.charCodeAt(0));
}
function returnPath(value:string):string {
  return value.startsWith('/') && !value.startsWith('//') && value.length<=2048 &&
    !/[\r\n\\]/.test(value)?value:'/';
}
function originValid(value:string):boolean {
  try {
    const url=new URL(value);
    return url.origin===value && url.protocol==='https:' &&
      /^bettaview-[a-f0-9]{32}\.apps\.deos-test\.voxdez\.com$/.test(url.hostname);
  } catch {return false;}
}
function expiry(now:Date,minutes:number):string {
  return new Date(now.getTime()+minutes*60_000).toISOString();
}

/** OAuth state and user tokens stay with the coordinator, never the candidate. */
export class SharedTestGitHubBroker {
  readonly env:BrokerEnv;
  readonly fetcher:typeof fetch;
  readonly advanceAfterReply?: (row:LiveSession,operationId:string)=>Promise<unknown>;
  constructor(env:BrokerEnv,fetcher:typeof fetch=globalThis.fetch.bind(globalThis),
      advanceAfterReply?:(row:LiveSession,operationId:string)=>Promise<unknown>) {
    this.env=env;this.fetcher=fetcher;this.advanceAfterReply=advanceAfterReply;
  }
  private async digest(value:string):Promise<string> {
    if(!/^[A-Za-z0-9_-]{43}$/.test(value))
      throw new Error('test_github_session_invalid');
    return sha256Hex(value);
  }
  private async key(info:string,usage:('encrypt'|'decrypt')[]):Promise<CryptoKey> {
    if(!this.env.TEST_MARKER_KEY_V1)
      throw new Error('test_github_encryption_key_missing');
    const parent=await crypto.subtle.importKey('raw',
      encoder.encode(this.env.TEST_MARKER_KEY_V1),'HKDF',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',
      salt:encoder.encode('deos-shared-test-github-v1'),info:encoder.encode(info)},
      parent,{name:'AES-GCM',length:256},false,usage);
  }
  private async verifier(state:string):Promise<string> {
    if(!this.env.TEST_MARKER_KEY_V1)
      throw new Error('test_github_oauth_key_missing');
    const key=await crypto.subtle.importKey('raw',encoder.encode(this.env.TEST_MARKER_KEY_V1),
      {name:'HMAC',hash:'SHA-256'},false,['sign']);
    return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,
      encoder.encode(`test-github-pkce-v1:${state}`))));
  }
  private async encrypt(token:string):Promise<{ciphertext:string;nonce:string}> {
    const nonce=new Uint8Array(12);
    crypto.getRandomValues(nonce);
    const key=await this.key('token-encryption',['encrypt']);
    const data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,
      encoder.encode(token));
    return {ciphertext:base64url(new Uint8Array(data)),nonce:base64url(nonce)};
  }
  private async decrypt(ciphertext:string,nonce:string):Promise<string> {
    const key=await this.key('token-encryption',['decrypt']);
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode64(nonce)},
      key,decode64(ciphertext));
    return decoder.decode(data);
  }
  private async live(appSession:string,origin:string,at=new Date()):Promise<LiveSession> {
    if(!originValid(origin))throw new Error('test_github_origin_invalid');
    const digest=await this.digest(appSession),now=at.toISOString();
    const row=await this.env.DB.prepare(`SELECT s.run_id,s.attempt_id,s.lease_id,
      s.fence,s.origin,s.session_sha256 AS app_session_sha256,s.expires_at,
      l.repository,l.branch,l.pull_request_number AS pullRequestNumber,
      l.candidate_commit AS candidateCommit
      FROM test_app_sessions s JOIN test_leases l ON l.lease_id=s.lease_id
      JOIN test_environment e ON e.owner_lease_id=s.lease_id
        AND e.owner_run_id=s.run_id
      WHERE s.session_sha256=? AND s.origin=? AND s.cookie_class='browser'
        AND s.expires_at>? AND s.revoked_at IS NULL AND l.state='active'
        AND l.fence=s.fence AND l.attempt_id=s.attempt_id AND e.site_id=1
        AND e.state='active' AND e.fence=s.fence AND e.heartbeat_due_at>?
        AND l.repository IS NOT NULL AND l.pull_request_number IS NOT NULL`)
      .bind(digest,origin,now,now).first<LiveSession>();
    if(!row || !Number.isSafeInteger(row.pullRequestNumber))
      throw new Error('test_github_lease_unavailable');
    return row;
  }
  async start(appSession:string,origin:string,returnTo:string):Promise<string> {
    if(!this.env.SHARED_TEST_GITHUB_CLIENT_SECRET)
      throw new Error('test_github_client_secret_missing');
    const live=await this.live(appSession,origin);
    const state=random(),digest=await sha256Hex(state);
    const verifier=await this.verifier(state);
    const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',
      encoder.encode(verifier))));
    await this.env.DB.prepare(`INSERT INTO test_github_oauth_states
      (state_sha256,run_id,attempt_id,lease_id,fence,origin,
       app_session_sha256,return_to,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(digest,live.run_id,live.attempt_id,live.lease_id,live.fence,
        origin,live.app_session_sha256,returnPath(returnTo),expiry(new Date(),10)).run();
    const url=new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id',clientId);
    url.searchParams.set('redirect_uri',sharedTestGitHubCallback);
    url.searchParams.set('state',state);
    url.searchParams.set('code_challenge',challenge);
    url.searchParams.set('code_challenge_method','S256');
    url.searchParams.set('allow_signup','false');
    return url.toString();
  }
  /** A lease browser can use only the approved reviewer on its own fixture. */
  async reviewer(appSession:string,origin:string,returnTo:string):Promise<{
    cookie:string;returnTo:string}> {
    const live=await this.live(appSession,origin);
    const fixture=await sharedTestReviewFixture(this.env.DB,live);
    await this.checkedReviewer(fixture.githubUserId);
    // Recheck the fence after the remote identity read, before issuing a session.
    await this.live(appSession,origin);
    const session=random(),sessionSha=await sha256Hex(session);
    await this.env.DB.prepare(`INSERT INTO test_github_sessions
      (session_sha256,run_id,attempt_id,lease_id,fence,origin,app_session_sha256,
       token_ciphertext,token_nonce,expires_at,credential_source,fixture_resource_id,github_user_id)
      VALUES (?,?,?,?,?,?,?,'','',?,'test_reviewer',?,?)`)
      .bind(sessionSha,live.run_id,live.attempt_id,live.lease_id,live.fence,origin,
        live.app_session_sha256,[expiry(new Date(),15),live.expires_at].sort()[0],
        fixture.resourceId,fixture.githubUserId).run();
    return {cookie:`__Host-deos_github=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=900`,
      returnTo:returnPath(returnTo)};
  }
  private async checkedReviewer(expectedId:number):Promise<string> {
    const token=this.env.IMPLEMENTATION_TEST_GITHUB_TOKEN;
    if(!token)throw new Error('test_reviewer_credential_missing');
    const response=await this.fetcher('https://api.github.com/user',{
      redirect:'manual',signal:AbortSignal.timeout(20_000),headers:{
        Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json',
        'User-Agent':'deos-shared-test'}});
    if(!response.ok)throw new Error(`test_reviewer_read_failed:${response.status}:${await response.text()}`);
    const user=await response.json() as {id?:number;type?:string};
    if(user.id!==expectedId || user.type!=='User')
      throw new Error('test_reviewer_identity_changed');
    return token;
  }
  private async state(state:string,at=new Date()):Promise<OAuthState> {
    const digest=await this.digest(state),now=at.toISOString();
    const row=await this.env.DB.prepare(`SELECT o.*,l.repository,l.branch,
      l.pull_request_number AS pullRequestNumber,
      l.candidate_commit AS candidateCommit
      FROM test_github_oauth_states o
      JOIN test_leases l ON l.lease_id=o.lease_id
      JOIN test_environment e ON e.owner_lease_id=o.lease_id
        AND e.owner_run_id=o.run_id
      JOIN test_app_sessions s ON s.session_sha256=o.app_session_sha256
      WHERE o.state_sha256=? AND o.expires_at>? AND o.claimed_at IS NULL
        AND l.state='active' AND l.fence=o.fence
        AND l.attempt_id=o.attempt_id AND e.site_id=1 AND e.state='active'
        AND e.fence=o.fence AND e.heartbeat_due_at>?
        AND s.expires_at>? AND s.revoked_at IS NULL AND s.origin=o.origin`)
      .bind(digest,now,now,now).first<OAuthState>();
    if(!row || !originValid(row.origin))
      throw new Error('test_github_oauth_state_unavailable');
    return row;
  }
  async callback(request:Request):Promise<Response> {
    const url=new URL(request.url);
    if(request.method!=='GET' || `${url.origin}${url.pathname}`!==sharedTestGitHubCallback)
      return Response.json({error:'test_github_callback_invalid'},{status:400});
    const state=url.searchParams.get('state')??'',code=url.searchParams.get('code')??'';
    if(!/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{1,255}$/.test(code))
      return Response.json({error:'test_github_callback_invalid'},{status:400});
    const row=await this.state(state),now=new Date().toISOString();
    const claimed=await this.env.DB.prepare(`UPDATE test_github_oauth_states
      SET claimed_at=? WHERE state_sha256=? AND claimed_at IS NULL AND expires_at>?`)
      .bind(now,row.state_sha256,now).run();
    if(claimed.meta.changes!==1)
      throw new Error('test_github_oauth_state_already_claimed');
    try {
      if(!this.env.SHARED_TEST_GITHUB_CLIENT_SECRET)
        throw new Error('test_github_client_secret_missing');
      const response=await this.fetcher('https://github.com/login/oauth/access_token',{
        method:'POST',redirect:'manual',signal:AbortSignal.timeout(20_000),
        headers:{Accept:'application/json','Content-Type':'application/json'},
        body:JSON.stringify({client_id:clientId,
          client_secret:this.env.SHARED_TEST_GITHUB_CLIENT_SECRET,code,
          redirect_uri:sharedTestGitHubCallback,
          code_verifier:await this.verifier(state)}),
      });
      const value=await response.json() as {access_token?:unknown;expires_in?:unknown;
        error?:unknown;error_description?:unknown};
      if(!response.ok || typeof value.access_token!=='string' ||
          !value.access_token)
        throw new Error(`test_github_exchange_failed:${response.status}:`+
          `${String(value.error??'unknown')}:${String(value.error_description??'')}`);
      const tokenExpiry=new Date(Date.now()+
        Math.max(1,Number(value.expires_in)||28_800)*1000).toISOString();
      const encrypted=await this.encrypt(value.access_token);
      const handoff=random(),handoffSha=await sha256Hex(handoff);
      const saved=await this.env.DB.prepare(`UPDATE test_github_oauth_states SET
        handoff_sha256=?,handoff_expires_at=?,token_ciphertext=?,
        token_nonce=?,token_expires_at=? WHERE state_sha256=? AND claimed_at=?
        AND handoff_sha256 IS NULL`)
        .bind(handoffSha,expiry(new Date(),2),encrypted.ciphertext,
          encrypted.nonce,tokenExpiry,row.state_sha256,now).run();
      if(saved.meta.changes!==1)
        throw new Error('test_github_handoff_save_failed');
      const destination=new URL('/__deos/github-complete',row.origin);
      destination.searchParams.set('handoff',handoff);
      return new Response(null,{status:303,headers:{Location:destination.toString(),
        'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    } catch(error) {
      const detail=describeSharedTestError(error);
      try {
        await this.env.DB.prepare(`UPDATE test_github_oauth_states SET failure_json=?
          WHERE state_sha256=?`).bind(JSON.stringify(detail),row.state_sha256).run();
      } catch(diagnosticError) {
        throw new AggregateError([error,diagnosticError],
          'test_github_exchange_and_diagnostic_failed',{cause:error});
      }
      throw error;
    }
  }
  async redeem(appSession:string,origin:string,handoff:string):Promise<{
    cookie:string;returnTo:string}> {
    const live=await this.live(appSession,origin),handoffSha=await this.digest(handoff);
    const now=new Date().toISOString();
    const row=await this.env.DB.prepare(`SELECT * FROM test_github_oauth_states
      WHERE handoff_sha256=? AND app_session_sha256=? AND lease_id=? AND fence=?
        AND origin=? AND handoff_expires_at>? AND handoff_used_at IS NULL
        AND token_ciphertext IS NOT NULL AND token_nonce IS NOT NULL`)
      .bind(handoffSha,live.app_session_sha256,live.lease_id,live.fence,origin,now)
      .first<OAuthState>();
    if(!row)throw new Error('test_github_handoff_unavailable');
    const session=random(),sessionSha=await sha256Hex(session);
    const expiresAt=[expiry(new Date(),15),live.expires_at,row.token_expires_at!]
      .sort()[0];
    const writes=await this.env.DB.batch([
      this.env.DB.prepare(`UPDATE test_github_oauth_states SET handoff_used_at=?,
        handoff_session_sha256=?
        WHERE state_sha256=? AND handoff_used_at IS NULL AND handoff_expires_at>?`)
        .bind(now,sessionSha,row.state_sha256,now),
      this.env.DB.prepare(`INSERT INTO test_github_sessions
        (session_sha256,run_id,attempt_id,lease_id,fence,origin,
         app_session_sha256,token_ciphertext,token_nonce,expires_at)
        SELECT ?,run_id,attempt_id,lease_id,fence,origin,app_session_sha256,
          token_ciphertext,token_nonce,? FROM test_github_oauth_states
        WHERE state_sha256=? AND handoff_used_at=? AND
          handoff_session_sha256=?`)
        .bind(sessionSha,expiresAt,row.state_sha256,now,sessionSha),
    ]);
    if(writes.some(write=>write.meta.changes!==1))
      throw new Error('test_github_handoff_redeem_incomplete');
    return {cookie:`__Host-deos_github=${session}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=900`,
      returnTo:returnPath(row.return_to)};
  }
  private async session(appSession:string,githubSession:string,origin:string):
    Promise<GitHubSession|null> {
    const live=await this.live(appSession,origin);
    const sessionSha=await this.digest(githubSession),now=new Date().toISOString();
    const row=await this.env.DB.prepare(`SELECT g.*,l.repository,l.branch,
      l.pull_request_number AS pullRequestNumber,
      l.candidate_commit AS candidateCommit
      FROM test_github_sessions g JOIN test_leases l ON l.lease_id=g.lease_id
      WHERE g.session_sha256=? AND g.app_session_sha256=? AND g.lease_id=?
        AND g.fence=? AND g.origin=? AND g.expires_at>? AND g.revoked_at IS NULL`)
      .bind(sessionSha,live.app_session_sha256,live.lease_id,live.fence,origin,now)
      .first<GitHubSession>();
    if(row?.credential_source==='test_reviewer') {
      const fixture=await sharedTestReviewFixture(this.env.DB,live,row.fixture_resource_id);
      if(fixture.githubUserId!==row.github_user_id)
        throw new Error('test_reviewer_identity_changed');
      return {...row,...fixture.scope};
    }
    return row;
  }
  async authorized(appSession:string,githubSession:string,origin:string):Promise<boolean> {
    if(!githubSession)return false;
    try {return Boolean(await this.session(appSession,githubSession,origin));}
    catch(error) {
      if(error instanceof Error && ['test_github_lease_unavailable',
          'test_github_session_invalid'].includes(error.message))return false;
      throw error;
    }
  }
  async logout(appSession:string,githubSession:string,origin:string):Promise<void> {
    if(!githubSession)return;
    const row=await this.session(appSession,githubSession,origin);
    if(row)await this.env.DB.prepare(`UPDATE test_github_sessions SET revoked_at=?
      WHERE session_sha256=? AND revoked_at IS NULL`)
      .bind(new Date().toISOString(),row.session_sha256).run();
  }
  async assertion(input:{appSession:string;githubSession:string;origin:string;
    method:string;body:Record<string,unknown>;githubUserId:number;accessAccount:string}) {
    const row=await this.session(input.appSession,input.githubSession,input.origin);
    if(!row || row.credential_source!=='test_reviewer' ||
        input.githubUserId!==row.github_user_id || input.accessAccount!=='reviewer@deos-test.invalid')
      throw new Error('test_review_identity_denied');
    const fixture=await sharedTestReviewFixture(this.env.DB,row,row.fixture_resource_id);
    if(input.method==='prepareReview' && (input.body.repository!==fixture.scope.repository ||
        input.body.pullRequestNumber!==fixture.scope.pullRequestNumber ||
        input.body.issueId!==fixture.issueId || !await this.env.DB.prepare(`SELECT 1 AS allowed
          FROM test_review_scenarios WHERE lease_id=? AND scenario_run_id=? AND state='ready'`)
          .bind(row.lease_id,input.body.runId).first()))
      throw new Error('test_review_prepare_scope_denied');
    if(input.method==='connectAccount' && input.body.projectId!==fixture.profile.projectId)
      throw new Error('test_review_account_scope_denied');
    await this.checkedReviewer(row.github_user_id!);
    await this.live(input.appSession,input.origin);
    return sharedTestReviewAssertion(await sharedTestReviewKey(this.env.TEST_MARKER_KEY_V1,
      row.lease_id,row.fence),row.github_user_id!,input.method,input.body);
  }
  async request(input:{appSession:string;githubSession:string;origin:string;
    target:string;method:string;body:string|null}):Promise<{
      status:number;contentType:string;body:string}> {
    const row=await this.session(input.appSession,input.githubSession,input.origin);
    if(!row)throw new Error('test_github_session_unavailable');
    if(input.target.length>4000 || (input.body?.length??0)>16*1024*1024)
      throw new Error('test_github_request_too_large');
    assertSharedTestGitHubRequest(row,input.target,input.method,input.body);
    const token=row.credential_source==='test_reviewer'
      ?await this.checkedReviewer(row.github_user_id!)
      :await this.decrypt(row.token_ciphertext,row.token_nonce);
    const requestId=crypto.randomUUID(),path=new URL(input.target).pathname;
    const startedAt=new Date().toISOString();
    await this.env.DB.prepare(`INSERT INTO test_github_transport_requests
      (request_id,lease_id,fence,repository,pull_request_number,method,path,started_at)
      VALUES (?,?,?,?,?,?,?,?)`)
      .bind(requestId,row.lease_id,row.fence,row.repository,row.pullRequestNumber,
        input.method.toUpperCase(),path,startedAt).run();
    try {
      const targetUrl=new URL(input.target);
      if(input.method.toUpperCase()!=='GET' &&
        targetUrl.pathname.startsWith(`/repos/${row.repository}/pulls/`)) {
        const pull=await this.fetcher(`https://api.github.com/repos/`+
          `${row.repository}/pulls/${row.pullRequestNumber}`,{
          method:'GET',redirect:'manual',signal:AbortSignal.timeout(20_000),
          headers:{Authorization:`Bearer ${token}`,
            Accept:'application/vnd.github+json',
            'X-GitHub-Api-Version':'2022-11-28',
            'User-Agent':'deos-shared-test'},
        });
        if(!pull.ok)throw new Error(`test_github_head_read_failed:${pull.status}`);
        const checked=await pull.json() as {head?:{sha?:string;ref?:string;
          repo?:{full_name?:string}};state?:string};
        if(checked.state!=='open' || checked.head?.sha!==row.candidateCommit ||
            checked.head.ref!==row.branch ||
            checked.head.repo?.full_name!==row.repository)
          throw new Error('test_github_head_changed');
      }
      if(row.credential_source==='test_reviewer' && input.method==='POST' && /\/reviews$/.test(path)) {
        const injection=await takeSharedReviewFault(this.env.DB,row.lease_id,'github_reject_review',requestId);
        if(injection) {
          await this.env.DB.prepare(`UPDATE test_github_transport_requests SET failure_json=?,finished_at=? WHERE request_id=?`)
            .bind(JSON.stringify({synthetic:true,injection,message:'Injected GitHub 422 before provider write'}),new Date().toISOString(),requestId).run();
          return {status:422,contentType:'application/json',body:JSON.stringify({message:'Labeled test injection: GitHub rejected this review.'})};
        }
      }
      if(row.credential_source==='test_reviewer' && input.method==='GET' &&
          path===`/repos/${row.repository}/pulls/${row.pullRequestNumber}/comments`) {
        const injection=await takeSharedReplyReadFault(this.env.DB,row.lease_id,requestId);
        if(injection) {
          await this.env.DB.prepare(`UPDATE test_github_transport_requests SET failure_json=?,finished_at=? WHERE request_id=?`)
            .bind(JSON.stringify({synthetic:true,injection,message:'Injected GitHub 429 during lost reply receipt read'}),new Date().toISOString(),requestId).run();
          return {status:429,contentType:'application/json',body:JSON.stringify({message:'Labeled test injection: GitHub receipt listing is rate limited.'})};
        }
      }
      const response=await this.fetcher(input.target,{method:input.method,
        body:input.body??undefined,redirect:'manual',signal:AbortSignal.timeout(20_000),
        headers:{Authorization:`Bearer ${token}`,
          Accept:input.target.endsWith('/markdown')?'text/html':'application/vnd.github+json',
          'Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28',
          'User-Agent':'deos-shared-test'},
      });
      const body=await response.text();
      await this.env.DB.prepare(`UPDATE test_github_transport_requests
        SET provider_status=?,finished_at=? WHERE request_id=?`)
        .bind(response.status,new Date().toISOString(),requestId).run();
      if(row.credential_source==='test_reviewer' && input.method==='POST' && /\/comments\/\d+\/replies$/.test(path) && response.ok) {
        const advance=await takeSharedReviewFault(this.env.DB,row.lease_id,'github_advance_after_reply',requestId);
        if(advance) {
          if(!this.advanceAfterReply)throw new Error('test_reply_head_advance_unconfigured');
          await this.advanceAfterReply(row,`reply-head-${advance}`);
        }
        const injection=await takeSharedReviewFault(this.env.DB,row.lease_id,'github_drop_reply_response',requestId);
        if(injection)throw new Error(`Labeled test injection ${injection}: real GitHub reply succeeded; response deliberately lost after provider receipt`);
      }
      return {status:response.status,
        contentType:response.headers.get('content-type')??'application/json',body};
    } catch(error) {
      try {
        await this.env.DB.prepare(`UPDATE test_github_transport_requests
          SET failure_json=?,finished_at=? WHERE request_id=?`)
          .bind(JSON.stringify(describeSharedTestError(error)),
            new Date().toISOString(),requestId).run();
      } catch(diagnosticError) {
        throw new AggregateError([error,diagnosticError],
          'test_github_transport_and_diagnostic_failed',{cause:error});
      }
      throw error;
    }
  }
}

/** Wipe encrypted credentials before a lease can finish cleanup. */
export async function purgeSharedTestGitHubSessions(db:D1Database,
  runId:string,leaseId:string):Promise<void> {
  const owner=await db.prepare(`SELECT 1 AS allowed FROM test_environment
    WHERE site_id=1 AND owner_run_id=? AND owner_lease_id=?
      AND state IN ('quiescing','cleaning')`)
    .bind(runId,leaseId).first<{allowed:number}>();
  if(owner?.allowed!==1)throw new Error('test_github_cleanup_fenced');
  const now=new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE test_github_oauth_states SET token_ciphertext=NULL,
      token_nonce=NULL,handoff_sha256=NULL,handoff_expires_at=NULL,
      handoff_used_at=COALESCE(handoff_used_at,?)
      WHERE run_id=? AND lease_id=?`)
      .bind(now,runId,leaseId),
    db.prepare(`UPDATE test_github_sessions SET revoked_at=COALESCE(revoked_at,?),
      token_ciphertext='',token_nonce=''
      WHERE run_id=? AND lease_id=?`)
      .bind(now,runId,leaseId),
  ]);
  const remaining=await db.prepare(`SELECT
    (SELECT COUNT(*) FROM test_github_oauth_states WHERE run_id=? AND lease_id=?
      AND (token_ciphertext IS NOT NULL OR handoff_sha256 IS NOT NULL))+
    (SELECT COUNT(*) FROM test_github_sessions WHERE run_id=? AND lease_id=?
      AND (revoked_at IS NULL OR token_ciphertext<>'' OR token_nonce<>''))
    AS count`).bind(runId,leaseId,runId,leaseId).first<{count:number}>();
  if(remaining?.count!==0)throw new Error('test_github_cleanup_incomplete');
}
