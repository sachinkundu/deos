import { WorkflowEntrypoint, type WorkflowStep } from "cloudflare:workers";

import { D1OrchestrationStore } from "./orchestration-store.ts";
import type { WorkflowStartParameters } from "./queue-consumer-core.ts";
import { loadBundledWorkflowDefinition } from "./workflow-bundle.ts";
import { restoreWorkflowDefinition } from "./workflow-definition.ts";
import {
  WorkflowOrchestrator,
  type WorkflowStepLike,
} from "./workflow-orchestrator.ts";
import { CloudflareWorkflowServices } from "./workflow-services.ts";
import { writeLifecycleObservation } from "./lifecycle-telemetry.ts";
import { normalizeWorkflowDuration } from "./workflow-duration.ts";

class CloudflareWorkflowStep implements WorkflowStepLike {
  private readonly step: WorkflowStep;

  constructor(step: WorkflowStep) {
    this.step = step;
  }

  do<T>(name: string, callback: () => Promise<T>): Promise<T> {
    return this.step.do(name, callback as never) as Promise<T>;
  }

  waitForEvent<T>(
    name: string,
    options: { type: string; timeout?: string | number },
  ): Promise<{ payload: Readonly<T> }> {
    return this.step.waitForEvent(name, {
      type: options.type,
      timeout: normalizeWorkflowDuration(options.timeout),
    }) as unknown as Promise<{ payload: Readonly<T> }>;
  }
}

export class DeosWorkflow extends WorkflowEntrypoint<Env, WorkflowStartParameters> {
  async run(
    event: Readonly<{
      payload: Readonly<WorkflowStartParameters>;
      instanceId: string;
    }>,
    step: WorkflowStep,
  ): Promise<unknown> {
    const store = new D1OrchestrationStore(this.env.DB);
    const bundledDefinition = await loadBundledWorkflowDefinition();
    const run = await store.findRun(event.payload.runId);
    let definition = bundledDefinition;
    if (run !== null && run.definition_digest !== bundledDefinition.digest) {
      const snapshot = await store.findDefinitionSnapshot(run.definition_id, run.definition_version);
      if (snapshot === null) throw new Error("Workflow definition snapshot is missing");
      definition = await restoreWorkflowDefinition(snapshot.canonical_json, run.definition_digest);
    }
    if (
      run === null ||
      run.workflow_instance_id !== event.instanceId ||
      run.definition_id !== definition.name ||
      run.definition_version !== definition.version ||
      run.definition_digest !== definition.digest
    ) throw new Error("Workflow start identity is not authoritative");
    const orchestrator = new WorkflowOrchestrator(
      store,
      definition,
      new CloudflareWorkflowServices(this.env, definition),
      {
        humanGateStateId: this.env.LINEAR_HUMAN_APPROVAL_STATE_ID,
        approvalStateNames: this.env.LINEAR_APPROVAL_STATE_NAMES.split(",").filter(Boolean),
        rejectionStateNames: this.env.LINEAR_REJECTION_STATE_NAMES.split(",").filter(Boolean),
        lifecycle: writeLifecycleObservation,
      },
    );
    return orchestrator.run(event.payload.runId, new CloudflareWorkflowStep(step));
  }
}
