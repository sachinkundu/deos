import { CapabilityRouter } from "./capability-router.ts";
import { D1CapabilityStore } from "./capability-store.ts";
import { DeosWorkflow } from "./deos-workflow.ts";
import { GitHubAppTokenProvider, GitHubCapabilityAdapter } from "./github-capability.ts";
import { LinearCapabilityAdapter } from "./linear-capability.ts";
import {
  processQueueBatch,
  type QueueBody,
  type QueueConsumerEnv,
} from "./queue-consumer-core.ts";
import { Sandbox } from "./sandbox-platform.ts";
import { writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import { CleanupAuditor, D1CleanupAuditStore } from "./cleanup-audit.ts";
import { CloudflareSandboxFactory } from "./sandbox-platform.ts";

export { DeosWorkflow, Sandbox };

const capabilityRouter = (env: Env): CapabilityRouter => new CapabilityRouter({
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
  linear: new LinearCapabilityAdapter(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN),
  signingSecret: env.CAPABILITY_SIGNING_SECRET,
  lifecycle: writeLifecycleObservation,
});

const cleanupAuditor = (env: Env): CleanupAuditor => new CleanupAuditor(
  new D1CleanupAuditStore(env.DB),
  new CloudflareSandboxFactory(env.Sandbox),
  {
    linearApiUrl: env.LINEAR_API_URL,
    linearAccessToken: env.LINEAR_APP_ACCESS_TOKEN,
    linearTeamId: env.LINEAR_TEAM_ID,
    auditSecret: env.CLEANUP_AUDIT_SECRET,
  },
  { lifecycle: writeLifecycleObservation },
);

export default {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/cleanup-audit") return cleanupAuditor(env).handle(request);
    if (!path.startsWith("/capabilities/")) return new Response("not found", { status: 404 });
    return capabilityRouter(env).handle(request);
  },
  queue(batch, env) {
    return processQueueBatch(
      batch as MessageBatch<QueueBody>,
      env as unknown as QueueConsumerEnv,
    );
  },
  scheduled(_controller, env) {
    return cleanupAuditor(env).scheduled();
  },
} satisfies ExportedHandler<Env, QueueBody>;
