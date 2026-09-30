import {WorkerEntrypoint} from 'cloudflare:workers';
import {SharedTestGitHubBroker} from './shared-test-github-broker.ts';
import {SharedTestReviewScenarios} from './shared-test-review-scenarios.ts';

/** Lease Workers can request only fenced GitHub actions, never a credential. */
export class SharedTestGitHubBrokerEntrypoint extends WorkerEntrypoint<Env> {
  private broker():SharedTestGitHubBroker {
    return new SharedTestGitHubBroker(this.env,globalThis.fetch.bind(globalThis),(row,operationId)=>
      new SharedTestReviewScenarios(this.env).provider({runId:row.run_id,attemptId:row.attempt_id,
        leaseId:row.lease_id,fence:row.fence},{operation:'github.advance_fixture_head',operationId}));
  }
  start(appSession:string,origin:string,returnTo:string):Promise<string> {
    return this.broker().start(appSession,origin,returnTo);
  }
  reviewer(appSession:string,origin:string,returnTo:string):Promise<{
    cookie:string;returnTo:string}> {
    return this.broker().reviewer(appSession,origin,returnTo);
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
  assertion(input:{appSession:string;githubSession:string;origin:string;
    method:string;body:Record<string,unknown>;githubUserId:number;accessAccount:string}) {
    return this.broker().assertion(input);
  }
  request(input:{appSession:string;githubSession:string;origin:string;
    target:string;method:string;body:string|null}):Promise<{
      status:number;contentType:string;body:string}> {
    return this.broker().request(input);
  }
}
