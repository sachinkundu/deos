import { WorkerEntrypoint } from "cloudflare:workers";
import { GitHubAppTokenProvider, GitHubCapabilityAdapter } from "./github-capability.ts";
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
  "DB" | "ORCHESTRATION_WORKFLOW" | "GITHUB_API_URL" | "GITHUB_APP_ID" | "GITHUB_APP_PRIVATE_KEY" |
  "LINEAR_API_URL" | "LINEAR_APP_ACCESS_TOKEN" | "LINEAR_TEAM_ID" | "LINEAR_APP_ACTOR_ID" | "ROUTE_ADMIN_ALLOWED_EMAIL"
> & { REVIEW_CONTINUATION_SECRET: string };

const errorResult = (error: unknown): never => {
  if (error instanceof ReviewContinuationError) throw error;
  throw new ReviewContinuationError("review_continuation_failed", {}, error);
};

export class ReviewContinuation extends WorkerEntrypoint<ReviewContinuationEnv> {
  private store(): D1ReviewContinuationStore {
    return new D1ReviewContinuationStore(this.env.DB);
  }

  private async liveHead(authority: RunGateAuthority): Promise<string> {
    if (!authority.route_github_installation_id) throw new ReviewContinuationError("github_link_missing");
    const adapter = new GitHubCapabilityAdapter(this.env.GITHUB_API_URL, new GitHubAppTokenProvider({
      apiUrl: this.env.GITHUB_API_URL,
      appId: this.env.GITHUB_APP_ID,
      privateKey: this.env.GITHUB_APP_PRIVATE_KEY,
      installationId: authority.route_github_installation_id,
    }));
    const pull = await adapter.readPullRequest(authority.gate_repository, authority.pull_request_number);
    if (pull.state !== "open" || pull.merged) throw new ReviewContinuationError("closed_gate");
    return pull.headSha;
  }

  private rpc(): ReviewContinuationRpc {
    return new ReviewContinuationRpc(
      this.store(),
      this.env.REVIEW_CONTINUATION_SECRET,
      (authority) => this.liveHead(authority),
      async (target, reviewId) => {
        try {
          const workflow = await this.env.ORCHESTRATION_WORKFLOW.get(target.workflowInstanceId);
          await workflow.sendEvent({ type: "linear-event", payload: { reviewId } });
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
    const response = await fetch(this.env.LINEAR_API_URL, {
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
    return new D1BettaViewAccountStore(this.env.DB).activate({
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
  }

  prepareReview(assertion: ServiceAssertion, input: PrepareReviewInput) {
    return this.rpc().prepareReview(assertion, input).catch(errorResult);
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

  markGitHubReady(assertion: ServiceAssertion, input: { reviewId: string; headSha: string }) {
    return this.rpc().markGitHubReady(assertion, input).catch(errorResult);
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
