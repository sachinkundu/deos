import assert from 'node:assert/strict';
import test from 'node:test';
import {assertSharedTestGitHubRequest} from '../src/shared-test-github-scope.ts';

const scope={repository:'sachinkundu/deos',branch:'deos/agent/SAC-182/run-1',
  pullRequestNumber:137,candidateCommit:'a'.repeat(40)};
const api='https://api.github.com';

test('trusted transport permits the pinned review reads and write',()=>{
  assert.doesNotThrow(()=>assertSharedTestGitHubRequest(scope,
    `${api}/repos/sachinkundu/deos/pulls/137/files?per_page=100`,'GET',null));
  assert.doesNotThrow(()=>assertSharedTestGitHubRequest(scope,
    `${api}/repos/sachinkundu/deos/contents/openspec%2Fchanges%2Fsac-182%2Fproposal.md?ref=${scope.candidateCommit}`,
    'GET',null));
  assert.doesNotThrow(()=>assertSharedTestGitHubRequest(scope,
    `${api}/repos/sachinkundu/deos/pulls/137/reviews`,'POST',
    JSON.stringify({commit_id:scope.candidateCommit,event:'COMMENT',comments:[]})));
});

test('trusted transport rejects another repository, pull request, or commit',()=>{
  for(const target of [
    `${api}/repos/sachinkundu/other/pulls/137`,
    `${api}/repos/sachinkundu/deos/pulls/138`,
    'https://evil.example/repos/sachinkundu/deos/pulls/137',
  ]) assert.throws(()=>assertSharedTestGitHubRequest(scope,target,'GET',null));
  assert.throws(()=>assertSharedTestGitHubRequest(scope,
    `${api}/repos/sachinkundu/deos/pulls/137/reviews`,'POST',
    JSON.stringify({commit_id:'b'.repeat(40),event:'COMMENT'})));
});

test('GraphQL permits scoped review-thread reads but refuses mutations',()=>{
  const variables={owner:'sachinkundu',repo:'deos',number:137};
  const query='query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine comments(first:100){nodes{databaseId body createdAt url author{login}}}}}}}}';
  assert.doesNotThrow(()=>assertSharedTestGitHubRequest(scope,`${api}/graphql`,'POST',
    JSON.stringify({query,variables})));
  assert.throws(()=>assertSharedTestGitHubRequest(scope,`${api}/graphql`,'POST',
    JSON.stringify({query:'mutation Change { updateIssue(input:{}) { clientMutationId } }',variables})));
  assert.throws(()=>assertSharedTestGitHubRequest(scope,`${api}/graphql`,'POST',
    JSON.stringify({query,
      variables:{...variables,number:138}})));
});

test('an owned unlinked fixture can be read but cannot receive reviews or replies',()=>{
  const checked={...scope,readOnlyPull:{pullRequestNumber:138,candidateCommit:'b'.repeat(40)}};
  for(const suffix of ['', '/files','/reviews','/comments'])assert.doesNotThrow(()=>
    assertSharedTestGitHubRequest(checked,`${api}/repos/sachinkundu/deos/pulls/138${suffix}`,'GET',null));
  assert.throws(()=>assertSharedTestGitHubRequest(checked,
    `${api}/repos/sachinkundu/deos/pulls/138/reviews`,'POST',JSON.stringify({commit_id:'b'.repeat(40),event:'COMMENT'})));
  assert.throws(()=>assertSharedTestGitHubRequest(checked,
    `${api}/repos/sachinkundu/deos/pulls/138/comments/1/replies`,'POST',JSON.stringify({body:'Denied'})));
  assert.throws(()=>assertSharedTestGitHubRequest(checked,
    `${api}/repos/sachinkundu/deos/pulls/139`,'GET',null));
});
