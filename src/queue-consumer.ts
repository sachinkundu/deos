import { claudeRunner } from "./claude-environment.ts";
import { D1StageRetryStore } from "./publication-stage-retry.ts";
import { CapabilityRouter } from "./capability-router.ts";
import { verifyCapabilityToken } from "./capability-auth.ts";
import { captureWorkflowErrors } from "./error-context.ts";
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
export { RouteAdmin } from "./route-admin-entrypoint.ts";

const capabilityRouter = (env: Env): CapabilityRouter => new CapabilityRouter({
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
  new CloudflareSandboxFactory(env.Sandbox, env.Standard2Sandbox),
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
    new D1StageRetryStore(env.DB),
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
    if (path === "/workflow-runtime-recoveries") {
      return workflowRuntimeRecoveryController(env).handle(request);
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
  },
} satisfies ExportedHandler<Env, QueueBody>;
