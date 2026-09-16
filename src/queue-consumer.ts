import { reconcileImplementations } from "./implementation-reconciliation.ts";
import { BoundedReviewReconciliationController } from './bounded-review-reconciliation.ts';
import { IndependentReviewReconciliationController } from './independent-review-reconciliation.ts';
import { ImplementationBroker } from "./implementation-broker.ts";
import { claudeRunner } from "./claude-environment.ts";
import { AttemptCompletionNotifier } from "./attempt-completion.ts";
import { D1StageRetryStore } from "./publication-stage-retry.ts";
import { CapabilityRouter } from "./capability-router.ts";
import { verifyCapabilityToken } from "./capability-auth.ts";
import { captureWorkflowErrors } from "./error-context.ts";
import { ImplementationHandoffController } from "./implementation-handoff.ts";
import { ImplementationHostedPreview } from './implementation-hosted-preview.ts';
import { ImplementationDemoUpgradeController } from './implementation-demo-upgrade.ts';
import { ImplementationProviderTest, type ReviewTestProfile } from "./implementation-provider-test.ts";
import { D1CapabilityStore } from "./capability-store.ts";
import { DeosWorkflow } from "./deos-workflow.ts";
import { GitHubAppTokenProvider, GitHubCapabilityAdapter } from "./github-capability.ts";
import { GitHubGitProxy } from "./github-git-proxy.ts";
import { LinearCapabilityAdapter } from "./linear-capability.ts";
import {
  processQueueBatch,
  registerBundledWorkflowDefinitions,
  type QueueBody,
  type QueueConsumerEnv,
} from "./queue-consumer-core.ts";
import { Sandbox, Standard2Sandbox } from "./sandbox-platform.ts";
import { writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import { CleanupAuditor, D1CleanupAuditStore } from "./cleanup-audit.ts";
import { CloudflareSandboxFactory } from "./sandbox-platform.ts";
import {
  D1CompletionReconciliationStore,
  LinearCommentOperatorNotice,
  WorkflowCompletionReconciler,
} from "./workflow-completion-reconciler.ts";
import { D1PlanningStore } from "./planning-store.ts";
import { OpenRouterReviewClient, parseSupportedOpenRouterModels } from "./openrouter-review.ts";
import { D1R2ProviderDiagnosticStore } from "./provider-diagnostics.ts";
import { D1R2OpenRouterResponseStore } from "./openrouter-response-store.ts";
import { AgentStageRetryController } from "./stage-retry.ts";
import { loadBundledWorkflowDefinitionRegistry } from "./workflow-bundle.ts";
import {
  D1WorkflowRuntimeRecoveryStore,
  WorkflowRuntimeRecoveryController,
} from "./workflow-runtime-recovery.ts";

export { DeosWorkflow, Sandbox, Standard2Sandbox };
export { ContainerProxy } from "@cloudflare/sandbox";
export { ImplementationSandbox, ImplementationStandard2Sandbox } from "./sandbox-platform.ts";
export { RouteAdmin } from "./route-admin-entrypoint.ts";

const capabilityRouter = (env: Env): CapabilityRouter => new CapabilityRouter({
  implementation: new ImplementationBroker(env),
  completion: new AttemptCompletionNotifier(env.DB,
    env.ORCHESTRATION_WORKFLOW as unknown as QueueConsumerEnv["ORCHESTRATION_WORKFLOW"]),
  claude: claudeRunner(env),
  store: new D1CapabilityStore(env.DB),
  github: new GitHubCapabilityAdapter(
    env.GITHUB_API_URL,
    new GitHubAppTokenProvider({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId: env.GITHUB_INSTALLATION_ID,
    }),
  ),
  githubForInstallation: (installationId) => new GitHubCapabilityAdapter(
    env.GITHUB_API_URL,
    new GitHubAppTokenProvider({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    }),
  ),
  githubGit: new GitHubGitProxy({
    tokenProvider: (installationId) => new GitHubAppTokenProvider({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId,
    }),
  }),
  linear: new LinearCapabilityAdapter(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN),
  planningStore: new D1PlanningStore(env.DB),
  openrouter: new OpenRouterReviewClient({
    apiKey: env.OPENROUTER_API_KEY,
    apiUrl: env.OPENROUTER_API_URL,
    supportedModels: parseSupportedOpenRouterModels(env.OPENROUTER_SUPPORTED_MODELS),
  }),
  diagnostics: new D1R2ProviderDiagnosticStore(
    env.DB,
    env.ARTIFACTS,
    env.CODEX_AUTH_ENCRYPTION_KEY,
  ),
  openrouterResponses: new D1R2OpenRouterResponseStore(env.DB, env.ARTIFACTS),
  signingSecret: env.CAPABILITY_SIGNING_SECRET,
  lifecycle: writeLifecycleObservation,
});

const cleanupAuditor = (env: Env): CleanupAuditor => new CleanupAuditor(
  new D1CleanupAuditStore(env.DB),
  new CloudflareSandboxFactory(env.Sandbox, env.Standard2Sandbox, env.ImplementationSandbox, env.ImplementationStandard2Sandbox),
  {
    linearApiUrl: env.LINEAR_API_URL,
    linearAccessToken: env.LINEAR_APP_ACCESS_TOKEN,
    linearTeamId: env.LINEAR_TEAM_ID,
    auditSecret: env.CLEANUP_AUDIT_SECRET,
  },
  { lifecycle: writeLifecycleObservation },
);

const completionReconciler = (env: Env): WorkflowCompletionReconciler =>
  new WorkflowCompletionReconciler(
    new D1CompletionReconciliationStore(env.DB),
    env.ORCHESTRATION_WORKFLOW,
    new LinearCommentOperatorNotice(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN),
  );

const stageRetryController = async (env: Env): Promise<AgentStageRetryController> => {
  const definitions = await loadBundledWorkflowDefinitionRegistry();
  const targetDefinition = definitions["simple-traceability"];
  if (targetDefinition === undefined) throw new Error("traceability workflow definition is missing");
  return new AgentStageRetryController(
    new D1StageRetryStore(env.DB, definitions['implementation']),
    env.ORCHESTRATION_WORKFLOW as unknown as QueueConsumerEnv["ORCHESTRATION_WORKFLOW"],
    env.STAGE_RETRY_SECRET,
    targetDefinition,
  );
};

const workflowRuntimeRecoveryController = (env: Env): WorkflowRuntimeRecoveryController =>
  new WorkflowRuntimeRecoveryController(
    new D1WorkflowRuntimeRecoveryStore(env.DB),
    env.ORCHESTRATION_WORKFLOW as unknown as QueueConsumerEnv["ORCHESTRATION_WORKFLOW"],
    env.STAGE_RETRY_SECRET,
  );

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/cleanup-audit") return cleanupAuditor(env).handle(request);
    if (path === "/cleanup-attempts") return cleanupAuditor(env).handleDestroy(request);
    if (path === "/stage-retries") return (await stageRetryController(env)).handle(request);
    if (path === '/bounded-review-reconciliations' || path === '/independent-review-reconciliations') {
      if (!env.STAGE_RETRY_SECRET || request.headers.get('Authorization') !== `Bearer ${env.STAGE_RETRY_SECRET}`)
        return Response.json({ error: 'invalid_operator_capability' }, { status: 401 });
      const body = await request.clone().json() as { runId?: unknown };
      if (typeof body?.runId !== 'string') return Response.json({ error: 'invalid_review_reconciliation' }, { status: 400 });
      return captureWorkflowErrors(env.DB, env.ARTIFACTS, body.runId, path,
        () => path === '/independent-review-reconciliations'
          ? new IndependentReviewReconciliationController(env).handle(request)
          : new BoundedReviewReconciliationController(env).handle(request));
    }
    if (path === "/workflow-runtime-recoveries") {
      return workflowRuntimeRecoveryController(env).handle(request);
    }
    if (path === "/implementation-handoffs" || path === '/implementation-demo-upgrades') {
      if (!env.STAGE_RETRY_SECRET || request.headers.get("Authorization") !== `Bearer ${env.STAGE_RETRY_SECRET}`)
        return Response.json({ error: "invalid_operator_capability" }, { status: 401 });
      const body = await request.clone().json() as { runId?: unknown };
      if (typeof body?.runId !== "string") return Response.json({ error: "invalid_handoff_request" }, { status: 400 });
      const definition = (await loadBundledWorkflowDefinitionRegistry()).implementation;
      if (!definition) throw new Error("Implementation definition is unavailable");
      return captureWorkflowErrors(env.DB, env.ARTIFACTS, body.runId, path,
        () => path === '/implementation-demo-upgrades'
          ? new ImplementationDemoUpgradeController(env, definition).handle(request)
          : new ImplementationHandoffController(env, definition).handle(request));
    }
    if (path === '/implementation-hosted-previews') {
      if (request.method !== 'POST') return Response.json({error:'method_not_allowed'}, {status:405});
      if (!env.STAGE_RETRY_SECRET || request.headers.get('Authorization') !== `Bearer ${env.STAGE_RETRY_SECRET}`)
        return Response.json({error:'invalid_operator_capability'}, {status:401});
      const body = await request.json() as {runId?:unknown};
      if (typeof body?.runId !== 'string') return Response.json({error:'invalid_hosted_preview_request'}, {status:400});
      return captureWorkflowErrors(env.DB, env.ARTIFACTS, body.runId, path,
        async () => Response.json(await new ImplementationHostedPreview(env).register(body)));
    }
    if (path === "/implementation-test-profiles") {
      if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
      if (!env.STAGE_RETRY_SECRET || request.headers.get("Authorization") !== `Bearer ${env.STAGE_RETRY_SECRET}`)
        return Response.json({ error: "invalid_operator_capability" }, { status: 401 });
      const body = await request.json() as { runId: string; profile: ReviewTestProfile; requestedBy: string };
      if (typeof body?.runId !== "string" || typeof body.requestedBy !== "string" ||
        !/^[a-zA-Z0-9._@-]{1,100}$/.test(body.requestedBy))
        return Response.json({ error: "invalid_provider_test_profile" }, { status: 400 });
      return captureWorkflowErrors(env.DB, env.ARTIFACTS, body.runId, path,
        async () => Response.json(await new ImplementationProviderTest(env).configure(body.runId, body.profile, body.requestedBy)));
    }
    if (!path.startsWith("/capabilities/")) return new Response("not found", { status: 404 });
    // Only verified claims may associate diagnostics with a workflow.
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    let claims;
    try { claims = await verifyCapabilityToken(token, env.CAPABILITY_SIGNING_SECRET, Date.now()); }
    catch { return capabilityRouter(env).handle(request); }
    return captureWorkflowErrors(env.DB, env.ARTIFACTS, claims.runId, path,
      () => capabilityRouter(env).handle(request));
  },
  queue(batch, env) {
    return processQueueBatch(
      batch as MessageBatch<QueueBody>,
      env as unknown as QueueConsumerEnv,
    );
  },
  async scheduled(_controller, env) {
    await registerBundledWorkflowDefinitions(env as unknown as QueueConsumerEnv);
    await claudeRunner(env).audit();
    await cleanupAuditor(env).scheduled();
    await completionReconciler(env).scheduled();
    await reconcileImplementations(env);
  },
} satisfies ExportedHandler<Env, QueueBody>;

export { RecentIssues } from "./recent-issues-entrypoint.ts";
