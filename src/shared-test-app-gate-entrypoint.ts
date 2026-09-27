import {WorkerEntrypoint} from 'cloudflare:workers';
import {SharedTestAppSessionStore,type TestAppSubject} from './shared-test-app-session.ts';
import {verifyTestAccess} from './shared-test-access.ts';

type GateEnv=Env & {TEST_APP_ACCESS_AUD?:string;
  TEST_APP_SERVICE_CLIENT_ID?:string};

/** Narrow RPC surface exposed to lease app Workers, with no provider writes. */
export class SharedTestAppGate extends WorkerEntrypoint<GateEnv> {
  private config() {
    return {teamDomain:this.env.PORTAL_ACCESS_TEAM_DOMAIN,
      audience:this.env.TEST_APP_ACCESS_AUD??'',
      allowedEmail:this.env.ROUTE_ADMIN_ALLOWED_EMAIL,
      serviceClientId:this.env.TEST_APP_SERVICE_CLIENT_ID??''};
  }

  async redeem(subject:TestAppSubject,code:string,accessJwt:string):Promise<{
    cookie:string;expiresAt:string}> {
    const principal=await verifyTestAccess(accessJwt,this.config());
    if (principal.kind!=='service' ||
        principal.principalSha256!==subject.principalSha256)
      throw new Error('test_app_launch_identity_changed');
    return new SharedTestAppSessionStore(this.env.DB).redeem(subject,code);
  }

  async authorize(input:{session:string;origin:string;accessJwt:string}):Promise<boolean> {
    const principal=await verifyTestAccess(input.accessJwt,this.config());
    return new SharedTestAppSessionStore(this.env.DB).authorize({
      session:input.session,origin:input.origin,
      principalSha256:principal.principalSha256});
  }
}
