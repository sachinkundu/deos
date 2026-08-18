import { transitionIdentity, visitIdentity } from "./orchestration-identity.ts";
import type {
  OrchestrationRunRecord,
  RunStatus,
  WorkflowRuntimeStore,
} from "./orchestration-store.ts";
import {
  evaluateNodeOutcome,
  instructionForNode,
  type ValidatedSystemOutcome,
} from "./workflow-evaluator.ts";
import type {
  HumanGateWorkflowNode,
  LoadedWorkflowDefinition,
} from "./workflow-definition.ts";
import type { AgentExecutionObservation } from "./sandbox-controller.ts";
import type { LifecycleWriter } from "./lifecycle-telemetry.ts";

export interface WorkflowWaitEvent {
  payload: Readonly<{ deliveryId: string }>;
}

export interface WorkflowStepLike {
  do<T>(name: string, callback: () => Promise<T>): Promise<T>;
  waitForEvent<T>(
    name: string,
    options: { type: string; timeout?: string | number },
  ): Promise<{ payload: Readonly<T> }>;
}

export interface WorkflowNodeServices {
  executeAgent(
    run: OrchestrationRunRecord,
    nodeId: string,
    jobId: string,
    definition: LoadedWorkflowDefinition,
  ): Promise<AgentExecutionObservation>;
  executeSystemAction(
    run: OrchestrationRunRecord,
    nodeId: string,
    action: string,
  ): Promise<ValidatedSystemOutcome>;
  ensureHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
  ): Promise<HumanGateOperation>;
  restoreHumanGate(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    deliveryId: string,
  ): Promise<HumanGateOperation>;
  observeHumanGateDelivery(
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    operation: HumanGateOperation,
    event: NonNullable<Awaited<ReturnType<WorkflowRuntimeStore["findInboxEvent"]>>>,
  ): Promise<HumanGateOperation>;
}

export interface HumanGateOperation {
  providerOperationId: string;
  state: "confirmed" | "awaiting_delivery" | "manual_reconciliation_required";
}

export interface OrchestratorOptions {
  humanGateStateId: string;
  approvalStateNames: readonly string[];
  rejectionStateNames: readonly string[];
  now?: () => Date;
  lifecycle?: LifecycleWriter;
}

const statusForNode = (
  definition: LoadedWorkflowDefinition,
  nodeId: string,
): RunStatus => {
  const node = definition.nodes[nodeId];
  if (node === undefined) throw new Error(`workflow node ${nodeId} is not defined`);
  if (node.type === "terminal") return node.outcome;
  return "active";
};

export class WorkflowOrchestrator {
  private readonly now: () => Date;
  private readonly store: WorkflowRuntimeStore;
  private readonly definition: LoadedWorkflowDefinition;
  private readonly services: WorkflowNodeServices;
  private readonly options: OrchestratorOptions;

  constructor(
    store: WorkflowRuntimeStore,
    definition: LoadedWorkflowDefinition,
    services: WorkflowNodeServices,
    options: OrchestratorOptions,
  ) {
    this.store = store;
    this.definition = definition;
    this.services = services;
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  async run(runId: string, step: WorkflowStepLike): Promise<{ outcome: string; runId: string }> {
    for (;;) {
      const run = await step.do(`authority:${runId}`, async () => this.requireRun(runId));
      const instruction = instructionForNode(this.definition, run.current_node);
      if (instruction.kind === "terminal") {
        return { outcome: instruction.outcome, runId };
      }

      if (instruction.kind === "dispatch_agent") {
        const execution = await step.do(
          `agent:${instruction.nodeId}:visit:${run.current_visit_sequence}`,
          async () => this.services.executeAgent(
            run,
            instruction.nodeId,
            instruction.jobId,
            this.definition,
          ),
        );
        if (execution.state === "running") {
          try {
            await step.waitForEvent<{ deliveryId: string }>(
              `agent-event:${execution.attemptId}`,
              { type: "linear-event", timeout: this.definition.execution.heartbeatTimeout },
            );
          } catch {
            // A timeout is the durable heartbeat checkpoint; the next loop
            // reloads D1 and reconciles the exact Sandbox/process identities.
          }
          continue;
        }
        const outcome = execution.outcome;
        await step.do(
          `transition:${instruction.nodeId}:${outcome.outcome}:visit:${run.current_visit_sequence}`,
          async () => this.commitOutcome(run, evaluateNodeOutcome(
            this.definition,
            instruction.nodeId,
            outcome,
          )),
        );
        continue;
      }

      if (instruction.kind === "run_system_action") {
        const outcome = await step.do(
          `system:${instruction.nodeId}:visit:${run.current_visit_sequence}`,
          async () => this.services.executeSystemAction(
            run,
            instruction.nodeId,
            instruction.action,
          ),
        );
        await step.do(
          `transition:${instruction.nodeId}:${outcome.outcome}:visit:${run.current_visit_sequence}`,
          async () => this.commitOutcome(run, evaluateNodeOutcome(
            this.definition,
            instruction.nodeId,
            outcome,
          )),
        );
        continue;
      }

      const gateNode = this.definition.nodes[instruction.nodeId];
      if (gateNode?.type !== "human_gate") throw new Error("human-gate instruction mismatch");
      if (run.status !== "awaiting_human") {
        const operation = await step.do(
          `enter-gate:${instruction.nodeId}:visit:${run.current_visit_sequence}`,
          async () => this.services.ensureHumanGate(run, gateNode),
        );
        if (operation.state === "manual_reconciliation_required") {
          throw new Error("human-gate transition requires manual reconciliation");
        }
        if (operation.state === "awaiting_delivery") {
          await this.observeGateOperation(step, run, gateNode, operation);
          continue;
        }
        await step.do(`confirm-gate:${instruction.nodeId}:visit:${run.current_visit_sequence}`, async () => {
          const changed = await this.store.setRunStatus(
            run.run_id,
            run.current_node,
            run.status,
            "awaiting_human",
            this.now().toISOString(),
          );
          if (!changed) throw new Error("human-gate status compare-and-set failed");
          return { entered: true };
        });
      }

      const event = await step.waitForEvent<{ deliveryId: string }>(
        `linear-event:${instruction.nodeId}:visit:${run.current_visit_sequence}`,
        { type: "linear-event", timeout: "24h" },
      );
      const claimed = await step.do(`claim:${event.payload.deliveryId}`, async () =>
        this.store.claimInboxEvent(
          event.payload.deliveryId,
          run.run_id,
          this.now().toISOString(),
        ));
      if (claimed === null) continue;
      const decision = evaluateNodeOutcome(this.definition, instruction.nodeId, {
        kind: "linear_event",
        deliveryId: claimed.delivery_id,
        actorId: claimed.actor_id,
        actorType: claimed.actor_type,
        fromStateId: claimed.from_state_id,
        fromStateName: claimed.from_state_name,
        toStateName: claimed.to_state_name,
        humanGateStateId: this.options.humanGateStateId,
        approvalStateNames: this.options.approvalStateNames,
        rejectionStateNames: this.options.rejectionStateNames,
      });
      if (decision.kind === "repair_gate") {
        const operation = await step.do(
          `repair-gate:${claimed.delivery_id}:visit:${run.current_visit_sequence}`,
          async () => this.services.restoreHumanGate(run, gateNode, claimed.delivery_id),
        );
        this.options.lifecycle?.({
          stage: "linear.repair",
          outcome: operation.state === "confirmed" ? "reconciled" : "waiting",
          correlationId: run.correlation_id,
          runId: run.run_id,
          workflowInstanceId: run.workflow_instance_id,
          deliveryId: claimed.delivery_id,
          operationId: operation.providerOperationId,
          nodeId: run.current_node,
          visitId: visitIdentity(run.run_id, run.current_visit_sequence),
        });
        if (operation.state === "manual_reconciliation_required") {
          throw new Error("human-gate repair requires manual reconciliation");
        }
        const reset = await this.store.setRunStatus(
          run.run_id,
          run.current_node,
          "awaiting_human",
          "active",
          this.now().toISOString(),
        );
        if (!reset) throw new Error("human-gate repair status compare-and-set failed");
        await this.store.markInboxState(
          claimed.delivery_id,
          "claimed",
          "processed",
          this.now().toISOString(),
        );
        continue;
      }
      if (decision.kind === "wait") {
        await this.store.markInboxState(
          claimed.delivery_id,
          "claimed",
          "processed",
          this.now().toISOString(),
        );
        continue;
      }
      const transition = await step.do(
        `transition:${instruction.nodeId}:${claimed.delivery_id}:visit:${run.current_visit_sequence}`,
        async () => this.commitOutcome(run, decision),
      );
      if (!transition.transitioned) {
        await this.store.markInboxState(
          claimed.delivery_id,
          "claimed",
          "duplicate",
          this.now().toISOString(),
        );
        continue;
      }
      await this.store.markInboxState(
        claimed.delivery_id,
        "claimed",
        "processed",
        this.now().toISOString(),
      );
    }
  }

  private async observeGateOperation(
    step: WorkflowStepLike,
    run: OrchestrationRunRecord,
    node: HumanGateWorkflowNode,
    operation: HumanGateOperation,
  ): Promise<void> {
    const event = await step.waitForEvent<{ deliveryId: string }>(
      `linear-operation:${operation.providerOperationId}`,
      { type: "linear-event", timeout: "24h" },
    );
    const claimed = await step.do(`claim:${event.payload.deliveryId}`, async () =>
      this.store.claimInboxEvent(
        event.payload.deliveryId,
        run.run_id,
        this.now().toISOString(),
      ));
    if (claimed === null) return;
    const observed = await step.do(`observe:${operation.providerOperationId}:${claimed.delivery_id}`, async () =>
      this.services.observeHumanGateDelivery(run, node, operation, claimed));
    await this.store.markInboxState(
      claimed.delivery_id,
      "claimed",
      "processed",
      this.now().toISOString(),
    );
    if (observed.state === "manual_reconciliation_required") {
      throw new Error("newer intent prevents human-gate reconciliation");
    }
  }

  private async requireRun(runId: string): Promise<OrchestrationRunRecord> {
    const run = await this.store.findRun(runId);
    if (run === null) throw new Error(`orchestration run ${runId} is missing`);
    if (run.definition_digest !== this.definition.digest) {
      throw new Error("orchestration run definition digest mismatch");
    }
    return run;
  }

  private async commitOutcome(
    run: OrchestrationRunRecord,
    decision: ReturnType<typeof evaluateNodeOutcome>,
  ): Promise<{ transitioned: boolean }> {
    if (decision.kind !== "transition") throw new Error("only a graph transition can be committed");
    const target = this.definition.nodes[decision.toNode];
    if (target === undefined) throw new Error(`target node ${decision.toNode} is missing`);
    const gateOriginNode = target.type === "human_gate" ? decision.fromNode : null;
    const transitionId = transitionIdentity(run.run_id, run.current_visit_sequence);
    const result = await this.store.compareAndSetNode({
      runId: run.run_id,
      expectedNode: decision.fromNode,
      expectedVisitSequence: run.current_visit_sequence,
      nextNode: decision.toNode,
      nextStatus: statusForNode(this.definition, decision.toNode),
      gateOriginNode,
      transitionId,
      causeType: decision.actorType === "user" ? "linear_event" : decision.actorType ?? "workflow",
      causeReference: decision.causeReference,
      actorId: decision.actorId,
      actorType: decision.actorType,
      providerOperationId: null,
      now: this.now().toISOString(),
    });
    if (result.outcome === "stale") {
      await this.requireRun(run.run_id);
      return { transitioned: false };
    }
    this.options.lifecycle?.({
      stage: "workflow.step",
      outcome: result.outcome === "committed" ? "succeeded" : "duplicate",
      correlationId: run.correlation_id,
      runId: run.run_id,
      workflowInstanceId: run.workflow_instance_id,
      nodeId: decision.toNode,
      visitId: visitIdentity(run.run_id, run.current_visit_sequence),
      traversalId: transitionId,
    });
    return { transitioned: true };
  }
}
