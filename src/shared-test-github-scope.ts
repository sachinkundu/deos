/** Allow only the GitHub calls needed by one pinned BettaView review. */
export interface SharedTestGitHubScope {
  repository:string;
  branch:string;
  pullRequestNumber:number;
  candidateCommit:string;
  readOnlyPull?:{pullRequestNumber:number;candidateCommit:string};
}

const reviewThreadsQuery='query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100){nodes{id isResolved isOutdated path line startLine comments(first:100){nodes{databaseId body createdAt url author{login}}}}}}}}';

function object(value:unknown):Record<string,unknown> {
  if(!value || typeof value!=='object' || Array.isArray(value))
    throw new Error('test_github_request_body_invalid');
  return value as Record<string,unknown>;
}

export function assertSharedTestGitHubRequest(scope:SharedTestGitHubScope,
  target:string,method:string,body:string|null):void {
  const url=new URL(target);
  if(url.origin!=='https://api.github.com' || url.username || url.password || url.hash ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,119}$/.test(method))
    throw new Error('test_github_target_denied');
  const verb=method.toUpperCase();
  const repo=scope.repository.split('/');
  if(repo.length!==2 || !Number.isSafeInteger(scope.pullRequestNumber) ||
      scope.pullRequestNumber<=0 || !/^[a-f0-9]{40}$/.test(scope.candidateCommit))
    throw new Error('test_github_scope_invalid');
  if(scope.readOnlyPull && (!Number.isSafeInteger(scope.readOnlyPull.pullRequestNumber) ||
      scope.readOnlyPull.pullRequestNumber<=0 || scope.readOnlyPull.pullRequestNumber===scope.pullRequestNumber ||
      !/^[a-f0-9]{40}$/.test(scope.readOnlyPull.candidateCommit)))throw new Error('test_github_read_only_scope_invalid');
  if(url.pathname==='/user' && verb==='GET' && !url.search) return;
  if(url.pathname==='/markdown' && verb==='POST' && !url.search) {
    const value=object(JSON.parse(body??''));
    if(value.context===scope.repository && typeof value.text==='string' &&
        value.text.length<=1_000_000 && value.mode==='gfm') return;
    throw new Error('test_github_markdown_scope_denied');
  }
  if(url.pathname==='/graphql' && verb==='POST' && !url.search) {
    const value=object(JSON.parse(body??''));
    const variables=object(value.variables);
    if(value.query===reviewThreadsQuery &&
        variables.owner===repo[0] && variables.repo===repo[1] &&
        (variables.number===scope.pullRequestNumber ||
          (scope.readOnlyPull && variables.number===scope.readOnlyPull.pullRequestNumber))) return;
    throw new Error('test_github_graphql_scope_denied');
  }
  const prefix=`/repos/${encodeURIComponent(repo[0])}/${encodeURIComponent(repo[1])}`;
  if(!url.pathname.startsWith(`${prefix}/`))
    throw new Error('test_github_repository_denied');
  const path=url.pathname.slice(prefix.length);
  const pull=`/pulls/${scope.pullRequestNumber}`;
  const readable=[pull,...(scope.readOnlyPull?[`/pulls/${scope.readOnlyPull.pullRequestNumber}`]:[])];
  if(verb==='GET' && readable.some(p=>[p,`${p}/files`,`${p}/comments`,`${p}/reviews`].includes(path) ||
      new RegExp(`^${p}/reviews/[1-9][0-9]*(?:/comments)?$`).test(path)) &&
      (!url.search || /^\?per_page=100(?:&page=[1-9][0-9]*)?$/.test(url.search))) return;
  if(verb==='GET' && path.startsWith('/contents/') &&
      path.length<2000 && url.searchParams.size===1 &&
      [scope.candidateCommit,scope.readOnlyPull?.candidateCommit].includes(url.searchParams.get('ref')??'')) return;
  if(verb==='POST' && path===`${pull}/reviews` && !url.search) {
    const value=object(JSON.parse(body??''));
    if(value.commit_id===scope.candidateCommit &&
        ['COMMENT','APPROVE','REQUEST_CHANGES'].includes(String(value.event))) return;
  }
  if(verb==='POST' && new RegExp(`^${pull}/comments/[1-9][0-9]*/replies$`).test(path) &&
      !url.search && typeof object(JSON.parse(body??'')).body==='string') return;
  throw new Error('test_github_operation_denied');
}
