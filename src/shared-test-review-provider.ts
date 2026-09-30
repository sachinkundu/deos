import {sharedTestReviewFixture} from './shared-test-review-profile.ts';
import {assertSharedTestGitHubRequest} from './shared-test-github-scope.ts';
import {describeSharedTestError} from './shared-test-failures.ts';
import {takeSharedReviewFault} from './shared-test-review-faults.ts';

export interface SharedTestReviewBinding {
  runId:string;attemptId:string;leaseId:string;fence:number;
}

const compact=(value:string)=>value.replace(/\s+/g,'');
const accountQuery=compact(`query CheckedBettaViewAccount($userId: ID!, $teamId: ID!) {
  user: users(filter:{id:{eq:$userId}},first:2){nodes{id}}
  human: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"Human Review"}},first:2){nodes{id name}}
  progress: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"In Progress"}},first:2){nodes{id name}}
  merging: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"Merging"}},first:2){nodes{id name}}
}`);
const reviewMove=compact(`mutation BettaViewReviewState($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { id state { id } } }
}`);
const restoreMove=compact(`mutation DeosMoveIssue($id: String!, $stateId: String!) {
  issueUpdate(id: $id, input: { stateId: $stateId }) { success }
}`);
const issueState=compact(`query DeosIssueState($id: String!) {
  issue(id: $id) { state { id } delegate { id } assignee { id } updatedAt }
}`);

class LinearScopeReadError extends Error {
  readonly status:number;
  constructor(status:number,body:string) {
    super(`test_review_scope_read_failed:${status}:${body}`);
    this.status=status;
  }
}

/** Outbound transport only. Candidate ReviewContinuation and DeosWorkflow keep
 * all review decisions, account checks, receipts, and gate transitions. */
export class SharedTestReviewProviderTransport {
  readonly env:Env;
  readonly binding:SharedTestReviewBinding;
  readonly fetcher:typeof fetch;
  constructor(env:Env,binding:SharedTestReviewBinding,
    fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.binding=binding;this.fetcher=fetcher;
  }

  async assertActive():Promise<void> {await this.live();}

  private async live() {
    const b=this.binding;
    if(!b || !/^[a-f0-9]{64}$/.test(b.leaseId) || !b.runId || !b.attemptId ||
      !Number.isSafeInteger(b.fence))throw new Error('test_review_binding_invalid');
    const row=await this.env.DB.prepare(`SELECT r.allowed_linear_user_id
      FROM test_environment e JOIN test_leases l ON l.lease_id=e.owner_lease_id
      JOIN orchestration_runs r ON r.run_id=l.run_id
      WHERE e.site_id=1 AND e.state='active' AND e.fence=? AND e.heartbeat_due_at>?
        AND e.owner_run_id=? AND e.owner_lease_id=? AND l.state='active'
        AND l.fence=e.fence AND l.attempt_id=?`)
      .bind(b.fence,new Date().toISOString(),b.runId,b.leaseId,b.attemptId)
      .first<{allowed_linear_user_id:string}>();
    if(!row?.allowed_linear_user_id)throw new Error('test_review_provider_fenced');
    return {allowedLinearUserId:row.allowed_linear_user_id,
      ...await sharedTestReviewFixture(this.env.DB,{run_id:b.runId,attempt_id:b.attemptId})};
  }

  async fetch(request:Request):Promise<Response> {
    const live=await this.live(),url=new URL(request.url);
    const body=request.method==='GET'?null:await request.text();
    if((body?.length??0)>100_000)throw new Error('test_review_provider_request_too_large');
    let token:string;
    let writesLinear=false;
    let readsAccount=false;
    if(url.origin==='https://api.github.com') {
      if(request.method!=='GET')throw new Error('test_review_service_github_write_denied');
      assertSharedTestGitHubRequest(live.scope,request.url,request.method,body);
      token=(this.env as Env & {IMPLEMENTATION_TEST_GITHUB_TOKEN?:string}).IMPLEMENTATION_TEST_GITHUB_TOKEN??'';
    } else if(request.url===this.env.LINEAR_API_URL && request.method==='POST') {
      const value=JSON.parse(body??'') as {query?:string;variables?:Record<string,unknown>};
      const query=typeof value.query==='string'?compact(value.query):'';
      const variables=value.variables;
      if(!variables || typeof variables!=='object' || Array.isArray(variables))
        throw new Error('test_review_linear_variables_invalid');
      if(query===accountQuery) {
        readsAccount=true;
        if(variables.userId!==live.allowedLinearUserId || variables.teamId!==live.profile.teamId ||
            Object.keys(variables).sort().join(',')!=='teamId,userId')
          throw new Error('test_review_account_scope_denied');
      } else if(query===issueState) {
        if(variables.id!==live.issueId || Object.keys(variables).join(',')!=='id')
          throw new Error('test_review_issue_scope_denied');
      } else if(query===reviewMove || query===restoreMove) {
        if(variables.id!==live.issueId ||
            ![live.profile.states.review,live.profile.states.work,live.profile.states.merge]
              .includes(String(variables.stateId)) ||
            Object.keys(variables).sort().join(',')!=='id,stateId')
          throw new Error('test_review_move_scope_denied');
        writesLinear=true;
      } else throw new Error('test_review_linear_query_denied');
      token=this.env.LINEAR_APP_ACCESS_TOKEN;
    } else throw new Error('test_review_provider_target_denied');
    if(!token)throw new Error('test_review_provider_credential_missing');
    const id=crypto.randomUUID();
    await this.env.DB.prepare(`INSERT INTO test_review_provider_requests
      (request_id,lease_id,fence,resource_id,method,target,started_at)
      VALUES (?,?,?,?,?,?,?)`).bind(id,this.binding.leaseId,this.binding.fence,
        live.resourceId,request.method,request.url,new Date().toISOString()).run();
    try {
      if(writesLinear) {
        const response=await this.fetcher(this.env.LINEAR_API_URL,{method:'POST',
          headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
          body:JSON.stringify({query:`query LeaseReviewIssueScope($id: String!) {
            issue(id:$id) { id team { id } project { id } }
          }`,variables:{id:live.issueId}}),redirect:'manual',signal:AbortSignal.timeout(20_000)});
        const raw=await response.text();
        if(!response.ok)throw new LinearScopeReadError(response.status,raw);
        const result=JSON.parse(raw) as {errors?:unknown;data?:{issue?:{
          id:string;team:{id:string};project:{id:string}}}};
        const issue=result.data?.issue;
        if(result.errors || issue?.id!==live.issueId || issue.team?.id!==live.profile.teamId ||
            issue.project?.id!==live.profile.projectId)
          throw new Error(`test_review_issue_membership_changed:${raw}`);
      }
      await this.live();
      if(writesLinear) {
        const injection=await takeSharedReviewFault(this.env.DB,this.binding.leaseId,'linear_reject_move',id);
        if(injection) {
          await this.env.DB.prepare(`UPDATE test_review_provider_requests SET failure_json=?,finished_at=? WHERE request_id=?`)
            .bind(JSON.stringify({synthetic:true,injection,message:'Injected Linear rejection before provider write'}),new Date().toISOString(),id).run();
          return Response.json({errors:[{message:'Labeled test injection: Linear rejected the move.'}]});
        }
      }
      const response=await this.fetcher(request.url,{method:request.method,
        body:body??undefined,redirect:'manual',signal:AbortSignal.timeout(20_000),
        headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',
          Accept:'application/json','User-Agent':'deos-lease-review',
          ...(url.origin==='https://api.github.com'?{'X-GitHub-Api-Version':'2022-11-28'}:{})}});
      let raw=await response.text();
      await this.env.DB.prepare(`UPDATE test_review_provider_requests SET
        provider_status=?,finished_at=? WHERE request_id=?`)
        .bind(response.status,new Date().toISOString(),id).run();
      if(readsAccount && response.ok) {
        const injection=await takeSharedReviewFault(this.env.DB,this.binding.leaseId,'account_identity_mismatch',id);
        if(injection) {
          const payload=JSON.parse(raw);
          payload.data.user.nodes=[{id:'00000000-0000-4000-8000-000000000000'}];
          raw=JSON.stringify(payload);
        }
      }
      return new Response(raw,{status:response.status,
        headers:{'Content-Type':response.headers.get('Content-Type')??'application/json'}});
    } catch(error) {
      try {
        const detail=JSON.stringify(describeSharedTestError(error)).replaceAll(token,'[redacted]');
        await this.env.DB.prepare(`UPDATE test_review_provider_requests SET
          failure_json=?,finished_at=? WHERE request_id=?`)
          .bind(detail,new Date().toISOString(),id).run();
      } catch(secondary) {throw new AggregateError([error,secondary],
        'test_review_provider_and_diagnostic_failed',{cause:error});}
      // This lookup precedes the mutation. Its retained error proves that no
      // move was sent, so the candidate may offer a retry of the Linear step.
      if(error instanceof LinearScopeReadError)return Response.json({errors:[{
        message:`Linear scope lookup failed before provider write (HTTP ${error.status}).`,
      }]},{status:503});
      throw error;
    }
  }
}
