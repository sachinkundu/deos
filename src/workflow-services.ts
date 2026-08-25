import {
  ArtifactCollector,
  D1ArtifactManifestStore,
  R2ArtifactObjectStore,
} from "./artifact-collector.ts";
import { mintCapabilityToken, type CapabilityAction } from "./capability-auth.ts";
import {
  CredentialVault,
  D1CredentialLeaseStore,
  R2ProtectedObjectStore,
} from "./credential-vault.ts";
import {
  D1LinearOperationStore,
  LinearTransitionController,
} from "./linear-transition.ts";
import {
  D1OrchestrationStore,
  type OrchestrationRunRecord,
} from "./orchestration-store.ts";
import {
  D1AgentAttemptStore,
  defaultAttemptId,
  SandboxAgentController,
} from "./sandbox-controller.ts";
import {
  CloudflareSandboxFactory,
  SandboxArtifactReaderAdapter,
} from "./sandbox-platform.ts";
import { D1SystemActionStore, SystemActionController } from "./system-actions.ts";
import type { WorkflowNodeServices } from "./workflow-orchestrator.ts";
import type { HumanGateWorkflowNode, LoadedWorkflowDefinition } from "./workflow-definition.ts";
import { writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import { JobInputMaterializer } from "./job-inputs.ts";
import { D1ProviderReceiptVerifier } from "./capability-store.ts";
import { D1PlanningStore } from "./planning-store.ts";
import { GitHubAppTokenProvider, GitHubCapabilityAdapter } from "./github-capability.ts";

const durationMs = (value: string): number => {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (match === null) throw new Error("workflow duration is invalid");
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  if (multiplier === undefined) throw new Error("workflow duration unit is invalid");
  return Number(match[1]) * multiplier;
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export class CloudflareWorkflowServices implements WorkflowNodeServices {
  private readonly env: Env;
  private readonly orchestration: D1OrchestrationStore;
  private readonly agents: SandboxAgentController;
  private readonly systemActions: SystemActionController;
  private readonly linear: LinearTransitionController;

  constructor(env: Env, definition: LoadedWorkflowDefinition) {
    this.env = env;
    this.orchestration = new D1OrchestrationStore(env.DB);
    const credentials = new CredentialVault(
      new R2ProtectedObjectStore(env.ARTIFACTS),
      new D1CredentialLeaseStore(env.DB),
      env.CODEX_AUTH_ENCRYPTION_KEY,
    );
    const artifactObjects = new R2ArtifactObjectStore(env.ARTIFACTS);
    const artifactManifests = new D1ArtifactManifestStore(env.DB);
    const jobInputs = new JobInputMaterializer(
      env.DB,
      env.ARTIFACTS,
      env.LINEAR_API_URL,
      env.LINEAR_APP_ACCESS_TOKEN,
      {
        readGitHubReviewFeedback: (repository, pullRequestNumber) =>
          new GitHubCapabilityAdapter(
            env.GITHUB_API_URL,
            new GitHubAppTokenProvider({
              apiUrl: env.GITHUB_API_URL,
              appId: env.GITHUB_APP_ID,
              privateKey: env.GITHUB_APP_PRIVATE_KEY,
              installationId: env.GITHUB_INSTALLATION_ID,
            }),
          ).readReviewFeedback(repository, pullRequestNumber),
      },
    );
    this.agents = new SandboxAgentController(
      new D1AgentAttemptStore(env.DB),
      new CloudflareSandboxFactory(env.Sandbox),
      credentials,
      {
        authProfileId: env.CODEX_AUTH_PROFILE_ID,
        absoluteTimeoutMs: durationMs(definition.execution.attemptTimeout),
        heartbeatTimeoutMs: durationMs(definition.execution.heartbeatTimeout),
      },
      {
        now: () => new Date(),
        attemptId: defaultAttemptId,
        materializeContext: (run, job) => jobInputs.materialize(run, job),
        readContinuationPatch: async (reference) => {
          const object = await env.ARTIFACTS.get(reference.r2Key);
          if (object === null) throw new Error("continuation patch object is missing");
          return object.text();
        },
        capabilityGrant: (attemptId, runId, job, repository, changeId, planningBranch) =>
          this.capabilityGrant(attemptId, runId, job, repository, changeId, planningBranch),
        protectPrompt: async ({ attemptId, content }) => {
          const r2Key = `protected/prompts/${attemptId}.md`;
          const digest = await sha256Hex(content);
          const existing = await env.ARTIFACTS.get(r2Key);
          if (existing === null) {
            await env.ARTIFACTS.put(r2Key, content, {
              httpMetadata: { contentType: "text/markdown; charset=utf-8" },
              customMetadata: { sha256: digest, evidenceClass: "service-authored-prompt" },
            });
          } else if (await sha256Hex(await existing.text()) !== digest) {
            throw new Error("protected rendered prompt object conflict");
          }
          const readBack = await env.ARTIFACTS.get(r2Key);
          if (readBack === null || await sha256Hex(await readBack.text()) !== digest) {
            throw new Error("protected rendered prompt object read-back failed");
          }
          return { r2Key, sha256: digest };
        },
        collector: (sandbox) => new ArtifactCollector(
          new SandboxArtifactReaderAdapter(sandbox),
          artifactObjects,
          artifactManifests,
        ),
        providerReceipts: new D1ProviderReceiptVerifier(env.DB),
        lifecycle: writeLifecycleObservation,
      },
    );
    this.systemActions = new SystemActionController(
      new D1SystemActionStore(env.DB),
      {
        github: new GitHubCapabilityAdapter(
          env.GITHUB_API_URL,
          new GitHubAppTokenProvider({
            apiUrl: env.GITHUB_API_URL,
            appId: env.GITHUB_APP_ID,
            privateKey: env.GITHUB_APP_PRIVATE_KEY,
            installationId: env.GITHUB_INSTALLATION_ID,
          }),
        ),
        planningStore: new D1PlanningStore(env.DB),
      },
    );
    this.linear = new LinearTransitionController(
      new D1LinearOperationStore(env.DB),
      {
        apiUrl: env.LINEAR_API_URL,
        accessToken: env.LINEAR_APP_ACCESS_TOKEN,
        appActorId: env.LINEAR_APP_ACTOR_ID,
        humanGateStateId: env.LINEAR_HUMAN_APPROVAL_STATE_ID,
        startStateId: env.LINEAR_START_STATE_ID,
        workStateId: env.LINEAR_WORK_STATE_ID,
      },
    );
  }

  executeAgent(
    run: OrchestrationRunRecord,
    nodeId: string,
    jobId: string,
    definition: LoadedWorkflowDefinition,
  ) {
    return this.agents.execute(run, nodeId, jobId, definition);
  }

  executeSystemAction(run: OrchestrationRunRecord, nodeId: string, action: string) {
    if (action === "linear.delegate_and_start") {
      return this.linear.ensureWorkStarted(run, nodeId);
    }
    return this.systemActions.execute(run, nodeId, action);
  }

  ensureHumanGate(run: OrchestrationRunRecord, node: HumanGateWorkflowNode) {
    return this.linear.ensureHumanGate(run, node);
  }

  async restoreHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    deliveryId: string,
  ) {
    const event = await this.orchestration.findInboxEvent(deliveryId);
    if (event === null) throw new Error("human-gate repair event is missing");
    return this.linear.restoreHumanGate(run, node, event);
  }

  observeHumanGateDelivery(
    _run: OrchestrationRunRecord,
    _node: HumanGateWorkflowNode,
    operation: Parameters<WorkflowNodeServices["observeHumanGateDelivery"]>[2],
    event: Parameters<WorkflowNodeServices["observeHumanGateDelivery"]>[3],
  ) {
    return this.linear.observeHumanGateDelivery(operation, event);
  }

  private async capabilityGrant(
    attemptId: string,
    runId: string,
    job: import("./workflow-definition.ts").WorkflowJob,
    repository: string,
    changeId: string,
    planningBranch: string | null,
  ) {
    const run = await this.orchestration.findRun(runId);
    if (run === null) throw new Error("capability run is missing");
    const policy = await this.orchestration.findPolicy(run.project_id);
    if (policy === null) throw new Error("capability project policy is missing");
    if (policy.trial_repository !== repository) {
      throw new Error("capability repository no longer matches the frozen job");
    }
    const planning = job.capabilities?.includes("github.publish_planning_work_product") === true;
    const actions: readonly CapabilityAction[] = planning
      ? ["github.publish_planning_work_product"]
      : ["github.publish_work_product", "linear.upsert_working_note"];
    if (planning) {
      const workProduct = await new D1PlanningStore(this.env.DB).findRunWorkProduct(runId);
      if (
        workProduct === null ||
        workProduct.repository !== repository ||
        workProduct.change_id !== changeId ||
        workProduct.remote_branch !== planningBranch
      ) throw new Error("planning capability identity mismatch");
    }
    const token = await mintCapabilityToken({
      version: 1,
      issuer: "deos",
      audience: "sandbox-capabilities",
      attemptId,
      runId,
      repository,
      issueId: run.issue_id,
      actions,
      changeId: planning ? changeId : null,
      planningBranch: planning ? planningBranch : null,
      expiresAt: Math.floor(Date.now() / 1000) + 25 * 60 * 60,
    }, this.env.CAPABILITY_SIGNING_SECRET);
    return { url: this.env.CAPABILITY_BASE_URL.replace(/\/$/, ""), token };
  }
}
