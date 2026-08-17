import {
  ArtifactCollector,
  D1ArtifactManifestStore,
  R2ArtifactObjectStore,
} from "./artifact-collector.ts";
import { mintCapabilityToken } from "./capability-auth.ts";
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

const durationMs = (value: string): number => {
  const match = value.match(/^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/);
  if (match === null) throw new Error("workflow duration is invalid");
  const multiplier = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
  if (multiplier === undefined) throw new Error("workflow duration unit is invalid");
  return Number(match[1]) * multiplier;
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
    );
    this.agents = new SandboxAgentController(
      new D1AgentAttemptStore(env.DB),
      new CloudflareSandboxFactory(env.Sandbox),
      credentials,
      {
        repository: env.TRIAL_REPOSITORY,
        authProfileId: env.CODEX_AUTH_PROFILE_ID,
        absoluteTimeoutMs: durationMs(definition.execution.attemptTimeout),
        heartbeatTimeoutMs: durationMs(definition.execution.heartbeatTimeout),
      },
      {
        now: () => new Date(),
        attemptId: defaultAttemptId,
        materializeContext: (run, job) => jobInputs.materialize(run, job),
        capabilityGrant: (attemptId, runId) => this.capabilityGrant(attemptId, runId),
        collector: (sandbox) => new ArtifactCollector(
          new SandboxArtifactReaderAdapter(sandbox),
          artifactObjects,
          artifactManifests,
        ),
        providerReceipts: new D1ProviderReceiptVerifier(env.DB),
        lifecycle: writeLifecycleObservation,
      },
    );
    this.systemActions = new SystemActionController(new D1SystemActionStore(env.DB));
    this.linear = new LinearTransitionController(
      new D1LinearOperationStore(env.DB),
      {
        apiUrl: env.LINEAR_API_URL,
        accessToken: env.LINEAR_APP_ACCESS_TOKEN,
        appActorId: env.LINEAR_APP_ACTOR_ID,
        humanGateStateId: env.LINEAR_HUMAN_APPROVAL_STATE_ID,
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

  private async capabilityGrant(attemptId: string, runId: string) {
    const run = await this.orchestration.findRun(runId);
    if (run === null) throw new Error("capability run is missing");
    const policy = await this.orchestration.findPolicy(run.project_id);
    if (policy === null) throw new Error("capability project policy is missing");
    const token = await mintCapabilityToken({
      version: 1,
      issuer: "deos",
      audience: "sandbox-capabilities",
      attemptId,
      runId,
      repository: policy.trial_repository,
      issueId: run.issue_id,
      expiresAt: Math.floor(Date.now() / 1000) + 25 * 60 * 60,
    }, this.env.CAPABILITY_SIGNING_SECRET);
    return { url: this.env.CAPABILITY_BASE_URL.replace(/\/$/, ""), token };
  }
}
