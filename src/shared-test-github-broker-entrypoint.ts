import {WorkerEntrypoint} from 'cloudflare:workers';
import {SharedTestGitHubBroker} from './shared-test-github-broker.ts';

/** Lease Workers can request only fenced GitHub actions, never a credential. */
export class SharedTestGitHubBrokerEntrypoint extends WorkerEntrypoint<Env> {
  private broker():SharedTestGitHubBroker {
    return new SharedTestGitHubBroker(this.env);
  }
  start(appSession:string,origin:string,returnTo:string):Promise<string> {
    return this.broker().start(appSession,origin,returnTo);
  }
  redeem(appSession:string,origin:string,handoff:string):Promise<{
    cookie:string;returnTo:string}> {
    return this.broker().redeem(appSession,origin,handoff);
  }
  authorized(appSession:string,githubSession:string,origin:string):Promise<boolean> {
    return this.broker().authorized(appSession,githubSession,origin);
  }
  logout(appSession:string,githubSession:string,origin:string):Promise<void> {
    return this.broker().logout(appSession,githubSession,origin);
  }
  request(input:{appSession:string;githubSession:string;origin:string;
    target:string;method:string;body:string|null}):Promise<{
      status:number;contentType:string;body:string}> {
    return this.broker().request(input);
  }
}
