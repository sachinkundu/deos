import {WorkerEntrypoint} from 'cloudflare:workers';
import {SharedTestReviewProviderTransport,type SharedTestReviewBinding} from
  './shared-test-review-provider.ts';

/** Scope is fixed in the trusted deployer's service binding, not an RPC input. */
export class SharedTestReviewProvider extends WorkerEntrypoint<Env,SharedTestReviewBinding> {
  assertActive() {
    return new SharedTestReviewProviderTransport(this.env,this.ctx.props).assertActive();
  }
  fetch(request:Request) {
    return new SharedTestReviewProviderTransport(this.env,this.ctx.props).fetch(request);
  }
}
