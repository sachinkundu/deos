/** Runtime decisions are the exact candidate's exports. This edge exposes only
 * read-only release metadata; setup and events use the trusted Cloudflare API. */
export const sharedTestReviewRuntimeWorker=`
export {ReviewContinuation,DeosWorkflow} from './candidate-runtime.js';
import {control} from './test-control.js';
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.protocol!=='https:' || url.hostname!==env.TEST_CANONICAL_HOST)
      return new Response('wrong test host',{status:421});
    if(url.pathname==='/__deos_test_control')return control(request,env);
    if(request.method!=='GET' || url.pathname!=='/api/version')
      return new Response('not found',{status:404});
    return Response.json({sourceSha:env.TEST_SOURCE_SHA,
      compiledSha256:env.TEST_COMPILED_SHA256,leaseId:env.TEST_LEASE_ID,
      versionId:env.CF_VERSION_METADATA?.id??null},
      {headers:{'Cache-Control':'no-store'}});
  }
};
`;
