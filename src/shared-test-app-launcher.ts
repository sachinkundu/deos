import {sha256Hex} from './implementation-hash.ts';
import {SharedTestAppSessionStore} from './shared-test-app-session.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';
import type {SharedTestServicePlan} from './shared-test-service-plan.ts';

interface Identity {
  identity_id:string;run_id:string;lease_id:string;origin:string;
  principal_sha256:string;revoked_at:string|null;absent_at:string|null;
}

/** The one-use code and Access secret stay inside trusted services. */
export class SharedTestAppLauncher {
  readonly db:D1Database;
  readonly clientId:string;
  readonly clientSecret:string;
  readonly fetcher:typeof fetch;
  constructor(db:D1Database,clientId:string,clientSecret:string,
    fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    if(!clientId || !clientSecret)
      throw new Error('test_app_launcher_unconfigured');
    this.db=db;this.clientId=clientId;
    this.clientSecret=clientSecret;this.fetcher=fetcher;
  }

  async launch(input:{runId:string;attemptId:string;leaseId:string;
    fence:number;plan:SharedTestServicePlan}):Promise<{origin:string;
    cookie:{name:string;value:string;domain:string;httpOnly:true;
      secure:true;sameSite:'Lax';path:'/'};expiresAt:string}> {
    const {runId,attemptId,leaseId,fence,plan}=input;
    if(plan.workerName!==`deos-test-${plan.serviceName}-${leaseId.slice(0,32)}` ||
        plan.canonicalHost!==`${plan.serviceName}-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`)
      throw new Error('test_app_launcher_plan_invalid');
    const origin=`https://${plan.canonicalHost}`;
    await new SharedTestLeaseStore(this.db).assertWrite(runId,attemptId,leaseId,fence);
    const principal=await sha256Hex(`service:${this.clientId}`);
    const identity=await this.db.prepare(`SELECT identity_id,run_id,lease_id,origin,
      principal_sha256,revoked_at,absent_at FROM test_access_identities
      WHERE run_id=? AND lease_id=? AND origin=? AND principal_sha256=?`)
      .bind(runId,leaseId,origin,principal).first<Identity>();
    if(!identity || identity.revoked_at || identity.absent_at)
      throw new Error('test_app_launcher_identity_missing');
    const {code}=await new SharedTestAppSessionStore(this.db).issue({
      runId,attemptId,leaseId,fence,origin,
      accessIdentityId:identity.identity_id,principalSha256:principal});
    const response=await this.fetcher(`${origin}/__deos/launch`,{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin,
        'CF-Access-Client-Id':this.clientId,
        'CF-Access-Client-Secret':this.clientSecret},
      body:JSON.stringify({code}),redirect:'manual',
      signal:AbortSignal.timeout(20_000),
    });
    if(response.status!==204) {
      const raw=await response.text();
      throw new Error(`test_app_launch_http_${response.status}:`+
        raw.slice(0,512).replaceAll(this.clientSecret,'[redacted]'));
    }
    const header=response.headers.get('Set-Cookie')??'';
    const match=/^__Host-deos_test=([A-Za-z0-9_-]{43}); Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=900$/.exec(header);
    if(!match)throw new Error('test_app_launch_cookie_invalid');
    await new SharedTestLeaseStore(this.db).assertWrite(runId,attemptId,leaseId,fence);
    return {origin,cookie:{name:'__Host-deos_test',value:match[1],
      domain:plan.canonicalHost,httpOnly:true,secure:true,sameSite:'Lax',path:'/'},
      expiresAt:new Date(Date.now()+15*60_000).toISOString()};
  }
}
