import assert from 'node:assert/strict';
import test from 'node:test';
import {loadPullRequest} from '../worker/github-api.js';
import {continuationBlocked,renderContinuationStatus} from '../src/review-continuation-view.js';

for (const binding of ['DEOS_REVIEW_CONTINUATION','TEST_REVIEW_CONTINUATION_CALL',null]) {
  test(`an unknown pull request explains the missing task with ${binding || 'no continuation service'}`, async () => {
    const env={DEOS_PORTAL:{fetch:async()=>new Response('Not found',{status:404})},
      ...(binding?{[binding]:{}}:{})};
    const github=async url=>{
      const path=new URL(url).pathname;
      if(path==='/repos/example/reviews/pulls/1')return Response.json({
        title:'Readable review',html_url:'https://github.com/example/reviews/pull/1',
        head:{sha:'a'.repeat(40)},base:{sha:'b'.repeat(40)},user:{login:'author'},state:'open'});
      if(path.endsWith('/files'))return Response.json([]);
      if(path==='/graphql')return Response.json({data:{repository:{pullRequest:{reviewThreads:{nodes:[]}}}}});
      if(path==='/user')return Response.json({login:'reviewer'});
      throw new Error(`Unexpected fixture request: ${path}`);
    };
    const result=await loadPullRequest('fixture','https://github.com/example/reviews/pull/1',env,'fixture',github);
    assert.equal(result.title,'Readable review');
    assert.equal(result.deos,null);
    assert.equal(result.reviewContinuation.readiness,binding?'unlinked':'feature_disabled');
    assert.equal(continuationBlocked(result.reviewContinuation),Boolean(binding));
    const view=renderContinuationStatus(result.reviewContinuation);
    if(binding) {
      assert.match(view,/Review remains readable/);
      assert.match(view,/no Linear task can move/);
    } else assert.equal(view,'');
  });
}

for (const readiness of ['ready', 'unlinked', 'closed', 'stale_head']) {
  test(`pull request API preserves the ${readiness} workflow link through story filtering`, async () => {
    const link = {readiness, runId: 'run-1', gateVisitSequence: 4, accountPolicyVersion: 2,
      status: {reviewId: 'review-1', github: {status: 'done'}, linear: {status: 'failed_retryable'},
        outcome: 'active', actions: ['retry']}};
    const env = {DEOS_PORTAL: {fetch: async request => {
      assert.equal(new URL(request.url).pathname, '/api/pull-requests/example/reviews/1/review-story');
      return Response.json({reviewContinuation: link, events: [], providerDiagnostics: 'private'});
    }}};
    const github = async url => {
      const path = new URL(url).pathname;
      if (path === '/repos/example/reviews/pulls/1') return Response.json({
        title: 'Linked review', html_url: 'https://github.com/example/reviews/pull/1',
        head: {sha: 'a'.repeat(40)}, base: {sha: 'b'.repeat(40)}, user: {login: 'author'}, state: 'open'});
      if (path.endsWith('/files')) return Response.json([]);
      if (path === '/graphql') return Response.json({data: {repository: {pullRequest: {reviewThreads: {nodes: []}}}}});
      if (path === '/user') return Response.json({login: 'reviewer'});
      throw new Error(`Unexpected fixture request: ${path}`);
    };
    const result = await loadPullRequest('fixture', 'https://github.com/example/reviews/pull/1', env, 'fixture', github);
    assert.deepEqual(result.reviewContinuation, link);
    assert.equal(result.deos.providerDiagnostics, undefined);
  });
}
