import { WorkerEntrypoint } from "cloudflare:workers";
import {captureWorkflowErrors} from './error-context.ts';
import {reviewGitHubAdapter,reviewProviderFetch} from './review-provider-transport.ts';
import {
  canonicalJson,
  D1BettaViewAccountStore,
  D1ReviewContinuationStore,
  ReviewContinuationError,
  ReviewContinuationRpc,
  sha256Hex,
  verifyServiceAssertion,
  type PrepareReviewInput,
  type RunGateAuthority,
  type ServiceAssertion,
} from "./review-continuation.ts";

type ReviewContinuationEnv = Pick<Env,
  "DB" | "ARTIFACTS" | "ORCHESTRATION_WORKFLOW" | "GITHUB_API_URL" | "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY" |
  "LINEAR_API_URL" | "LINEAR_APP_ACCESS_TOKEN" | "LINEAR_TEAM_ID" | "LINEAR_APP_ACTOR_ID" | "ROUTE_ADMIN_ALLOWED_EMAIL"
> & { REVIEW_CONTINUATION_SECRET: string; REVIEW_PROVIDER_TRANSPORT?:Fetcher };

const errorResult = (error: unknown): never => {
  if (error instanceof ReviewContinuationError) throw error;
  throw new ReviewContinuationError("review_continuation_failed", {}, error);
};

export class ReviewContinuation extends WorkerEntrypoint<ReviewContinuationEnv> {
  async accountSettings(assertion: ServiceAssertion, input: Record<string, never>) {
    await this.authorize('accountSettings', assertion, input);
    if (Object.keys(input).length || assertion.accessAccount.toLowerCase() !== this.env.ROUTE_ADMIN_ALLOWED_EMAIL.toLowerCase())
      throw new ReviewContinuationError('unauthorized_actor');
    const policies = (await this.env.DB.prepare(`SELECT project_id,linear_project_name,route_revision,
      allowed_linear_user_id FROM project_workflow_policies WHERE allowed_linear_user_id IS NOT NULL
      ORDER BY linear_project_name,project_id`).all<{
        project_id:string;linear_project_name:string;route_revision:number;allowed_linear_user_id:string;
      }>()).results;
    const accounts = new D1BettaViewAccountStore(this.env.DB);
    return {accessAccount:assertion.accessAccount,githubUserId:assertion.githubUserId,
      projects:await Promise.all(policies.map(async policy=>({projectId:policy.project_id,
        name:policy.linear_project_name,routeRevision:policy.route_revision,
        linearUsers:[{id:policy.allowed_linear_user_id,label:'Checked Linear user'}],
        account:await accounts.current(policy.project_id)})))};
  }
  private store(): D1ReviewContinuationStore {
    return new D1ReviewContinuationStore(this.env.DB);
  }

  private async liveHead(authority: RunGateAuthority): Promise<string> {
    if (!authority.route_github_installation_id) throw new ReviewContinuationError("github_link_missing");
    const adapter = reviewGitHubAdapter(this.env,authority.route_github_installation_id);
    const pull = await adapter.readPullRequest(authority.gate_repository, authority.pull_request_number);
    if (pull.state !== "open" || pull.merged) throw new ReviewContinuationError("closed_gate");
    return pull.headSha;
  }

  private rpc(): ReviewContinuationRpc {
    return new ReviewContinuationRpc(
      this.store(),
      this.env.REVIEW_CONTINUATION_SECRET,
      (authority) => this.liveHead(authority),
      async (target, reviewId, attempt) => {
        try {
          const workflow = await this.env.ORCHESTRATION_WORKFLOW.get(target.workflowInstanceId);
          await workflow.sendEvent({ type: "linear-event", payload: { reviewId, attempt } });
        } catch (error) {
          throw new ReviewContinuationError("review_ready_dispatch_failed", { reviewId }, error);
        }
      },
    );
  }

  async connectAccount(assertion: ServiceAssertion, input: {
    projectId: string; expectedRouteRevision: number; linearUserId: string;
  }) {
    await this.authorize("connectAccount", assertion, input);
    if (assertion.accessAccount.toLowerCase() !== this.env.ROUTE_ADMIN_ALLOWED_EMAIL.toLowerCase()) {
      throw new ReviewContinuationError("unauthorized_actor");
    }
    const accounts = new D1BettaViewAccountStore(this.env.DB);
    try {
    const response = await reviewProviderFetch(this.env)(this.env.LINEAR_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.env.LINEAR_APP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query CheckedBettaViewAccount($userId: ID!, $teamId: ID!) {
          user: users(filter:{id:{eq:$userId}},first:2){nodes{id}}
          human: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"Human Review"}},first:2){nodes{id name}}
          progress: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"In Progress"}},first:2){nodes{id name}}
          merging: workflowStates(filter:{team:{id:{eq:$teamId}},name:{eq:"Merging"}},first:2){nodes{id name}}
        }`,
        variables: { userId: input.linearUserId, teamId: this.env.LINEAR_TEAM_ID },
      }),
    });
    const payload = await response.json() as {
      errors?: unknown[];
      data?: Record<string, { nodes?: { id: string; name?: string }[] }>;
    };
    const exact = (key: string, name?: string): string => {
      const nodes = payload.data?.[key]?.nodes;
      if (!response.ok || payload.errors?.length || nodes?.length !== 1 || (name && nodes[0]?.name !== name)) {
        throw new ReviewContinuationError("provider_identity_read_failed", { provider: "linear", key });
      }
      return nodes[0].id;
    };
    const linearUserId = exact("user");
    if (linearUserId !== input.linearUserId) throw new ReviewContinuationError('provider_identity_mismatch');
    const states = {
      humanReview: exact("human", "Human Review"),
      inProgress: exact("progress", "In Progress"),
      merging: exact("merging", "Merging"),
    };
    const evidence = await sha256Hex(canonicalJson({
      accessAccount: assertion.accessAccount,
      githubUserId: assertion.githubUserId,
      linearUserId,
      states,
    }));
    return await accounts.activate({
      projectId: input.projectId,
      expectedRouteRevision: input.expectedRouteRevision,
      accessAccount: assertion.accessAccount,
      githubUserId: assertion.githubUserId,
      linearUserId,
      linearAppActorId: this.env.LINEAR_APP_ACTOR_ID,
      settingsActor: assertion.accessAccount,
      providerEvidenceDigest: evidence,
      states,
    }, new Date().toISOString());
    } catch (error) {
      try {
        await accounts.rejected({...input,accessAccount:assertion.accessAccount,
          githubUserId:assertion.githubUserId,linearAppActorId:this.env.LINEAR_APP_ACTOR_ID,
          settingsActor:assertion.accessAccount},error,new Date().toISOString());
      } catch (diagnostic) {
        throw new AggregateError([error,diagnostic],'Account connection and diagnostic storage failed',{cause:error});
      }
      throw error;
    }
  }

  prepareReview(assertion: ServiceAssertion, input: PrepareReviewInput) {
    return captureWorkflowErrors(this.env.DB, this.env.ARTIFACTS, input.runId, 'review.prepare',
      () => this.rpc().prepareReview(assertion, input)).catch(errorResult);
  }

  refreshHead(assertion:ServiceAssertion,input:{runId:string;gateVisitSequence:number;headSha:string}) {
    return this.rpc().refreshHead(assertion,input).catch(errorResult);
  }

  status(reviewId: string) {
    return this.rpc().status(reviewId).catch(errorResult);
  }

  requestPermit(assertion: ServiceAssertion, input: {
    reviewId: string; step: "github" | "linear" | "repair"; scopeId: string; requestDigest: string;
  }) {
    return this.rpc().requestPermit(assertion, input).catch(errorResult);
  }

  completeGitHubPart(assertion: ServiceAssertion, input: {
    reviewId: string; partId: string; permitId: string; recordId: string; url: string;
    commitSha: string; githubUserId: number; event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE" | null;
    receiptDigest: string;
  }) {
    return this.rpc().completeGitHubPart(assertion, input).catch(errorResult);
  }

  failGitHubPart(assertion: ServiceAssertion, input: {
    reviewId: string; partId: string; permitId: string; publicCode: string;
    outcome: "clearly_rejected" | "unclear"; providerMessage: string; providerDetails?: unknown;
  }) {
    return this.rpc().failGitHubPart(assertion, input).catch(errorResult);
  }

  markGitHubReady(assertion: ServiceAssertion, input: { reviewId: string; headSha: string }) {
    return this.rpc().markGitHubReady(assertion, input).catch(errorResult);
  }

  retryLinear(assertion: ServiceAssertion, input: { reviewId: string }) {
    return this.rpc().retryLinear(assertion, input).catch(errorResult);
  }

  abandon(assertion: ServiceAssertion, input: { reviewId: string }) {
    return this.rpc().abandon(assertion, input).catch(errorResult);
  }

  private async authorize(method: string, assertion: ServiceAssertion, input: unknown): Promise<void> {
    const bodyDigest = await sha256Hex(canonicalJson(input));
    await verifyServiceAssertion(assertion, this.env.REVIEW_CONTINUATION_SECRET, {
      method, bodyDigest, nowMs: Date.now(),
    });
    await this.store().consumeNonce(assertion, new Date().toISOString());
  }
}
