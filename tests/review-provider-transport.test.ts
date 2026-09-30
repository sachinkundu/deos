import assert from 'node:assert/strict';
import test from 'node:test';
import {reviewGitHubAdapter,reviewProviderFetch} from '../src/review-provider-transport.ts';

test('lease provider binding carries the real GitHub adapter request without an app private key',async()=>{
  const requests:Request[]=[];
  const env={GITHUB_API_URL:'https://api.github.com',REVIEW_PROVIDER_TRANSPORT:{
    fetch:async(request:Request)=>{
      requests.push(request);
      return Response.json({id:1,number:9,html_url:'https://github.com/test/repo/pull/9',
        state:'open',draft:false,merged:false,merge_commit_sha:null,
        head:{ref:'test',sha:'a'.repeat(40)},base:{ref:'main'}});
    }}} as never;
  const result=await reviewGitHubAdapter(env,'installation').readPullRequest('test/repo',9);
  assert.equal(result.headSha,'a'.repeat(40));
  assert.equal(requests.length,1);
  assert.equal(requests[0].url,'https://api.github.com/repos/test/repo/pulls/9');
  assert.equal(requests[0].headers.get('Authorization'),'Bearer lease-provider-proxy');
});

test('provider transport errors propagate with their original cause',async()=>{
  const original=new Error('original provider failure',{cause:new Error('socket closed')});
  const fetcher=reviewProviderFetch({REVIEW_PROVIDER_TRANSPORT:{fetch:async()=>{throw original;}} as never});
  await assert.rejects(fetcher('https://api.linear.app/graphql'),error=>error===original);
});
