import { transitionIdentity, visitIdentity } from "./orchestration-identity.ts";
import type {
  OrchestrationRunRecord,
  RunStatus,
  WorkflowRuntimeStore,
} from "./orchestration-store.ts";
import {
  evaluateNodeOutcome,
  evaluateWaitEvent,
  instructionForNode,
  type EdgeDecision,
  type ValidatedAgentOutcome,
  type ValidatedSystemOutcome,
} from "./workflow-evaluator.ts";
import type {
  HumanGateWorkflowNode,
  LoadedWorkflowDefinition,
  WorkflowEventDescriptor,
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

export class WorkflowFailureError extends Error {
  readonly safeCause: string;

  constructor(safeCause: string) {
    super(safeCause);
    this.name = "WorkflowFailureError";
    this.safeCause = safeCause;
  }
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

const canonicalEvent = (event: Readonly<WorkflowEventDescriptor>): string =>
  JSON.stringify(canonicalize(event));

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const statusForNode = (
  definition: LoadedWorkflowDefinition,
  nodeId: string,
): RunStatus => {
  const node = definition.nodes[nodeId];
  if (node === undefined) throw new Error(`workflow node ${nodeId} is not defined`);
  if (node.type === "terminal") return node.outcome;
  if (node.type === "wait") return node.deosStatus;
  if (node.type === "failure") return "failed";
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
        if (run.status !== instruction.outcome) {
          const committed = await step.do(`final:${instruction.nodeId}`, async () =>
            this.store.setRunStatus(
              run.run_id,
              run.current_node,
              run.status,
              instruction.outcome,
              this.now().toISOString(),
            ));
          if (!committed) continue;
        }
        return { outcome: instruction.outcome, runId };
      }
      if (instruction.kind === "fail") {
        if (run.status !== "failed") {
          const committed = await step.do(`failure:${instruction.nodeId}`, async () =>
            this.store.setRunStatus(
              run.run_id,
              run.current_node,
              run.status,
              "failed",
              this.now().toISOString(),
              instruction.node.cause,
            ));
          if (!committed) continue;
        }
        throw new WorkflowFailureError(instruction.node.cause);
      }

      if (instruction.kind === "wait_for_event") {
        await this.waitForDefinitionEvent(step, run, instruction.node);
        continue;
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
        const decision = this.evaluateExecutionOutcome(instruction.nodeId, outcome);
        await step.do(
          `transition:${instruction.nodeId}:${decision.outcome}:visit:${run.current_visit_sequence}`,
          async () => this.commitOutcome(run, decision),
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
        const decision = this.evaluateExecutionOutcome(instruction.nodeId, outcome);
        await step.do(
          `transition:${instruction.nodeId}:${decision.outcome}:visit:${run.current_visit_sequence}`,
          async () => this.commitOutcome(run, decision),
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
        run.status = "awaiting_human";
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

  private async waitForDefinitionEvent(
    step: WorkflowStepLike,
    run: OrchestrationRunRecord,
    node: Extract<LoadedWorkflowDefinition["nodes"][string], { type: "wait" }>,
  ): Promise<void> {
    const wait = await step.do(`wait-authority:${node.id}`, async () =>
      this.store.findOpenWait(run.run_id, node.id));
    if (wait === null) throw new WorkflowFailureError("durable_wait_missing");
    const resumeJson = canonicalEvent(node.resumeEvent);
    const cancelJson = canonicalEvent(node.cancelEvent);
    const [resumeDigest, cancelDigest] = await Promise.all([
      sha256Hex(resumeJson),
      sha256Hex(cancelJson),
    ]);
    if (
      wait.resume_event_json !== resumeJson ||
      wait.resume_event_digest !== resumeDigest ||
      wait.cancel_event_json !== cancelJson ||
      wait.cancel_event_digest !== cancelDigest ||
      wait.resume_event_type !== node.resumeEvent.type ||
      wait.cancel_event_type !== node.cancelEvent.type
    ) throw new WorkflowFailureError("durable_wait_definition_mismatch");

    let event: { payload: Readonly<{ deliveryId: string }> };
    try {
      event = await step.waitForEvent<{ deliveryId: string }>(
        `linear-event:${node.id}:${wait.wait_id}`,
        { type: "linear-event", timeout: "365d" },
      );
    } catch {
      return;
    }
    const claimed = await step.do(`claim:${event.payload.deliveryId}`, async () =>
      this.store.claimInboxEvent(
        event.payload.deliveryId,
        run.run_id,
        this.now().toISOString(),
      ));
    if (claimed === null) return;
    const decision = evaluateWaitEvent(this.definition, node.id, {
      deliveryId: claimed.delivery_id,
      eventKind: claimed.event_kind,
      actorId: claimed.actor_id,
      actorType: claimed.actor_type,
      toStateName: claimed.to_state_name,
    });
    if (decision.kind === "reject") {
      await this.store.recordWaitDelivery({
        deliveryId: claimed.delivery_id,
        waitId: wait.wait_id,
        runId: run.run_id,
        decision: "rejected",
        safeReason: decision.safeReason,
        now: this.now().toISOString(),
      });
      await this.store.markInboxState(
        claimed.delivery_id,
        "claimed",
        "processed",
        this.now().toISOString(),
      );
      return;
    }
    const target = this.definition.nodes[decision.toNode];
    if (target === undefined) throw new WorkflowFailureError("wait_target_missing");
    const consumed = await step.do(`consume-wait:${claimed.delivery_id}`, async () =>
      this.store.consumeWait({
        waitId: wait.wait_id,
        runId: run.run_id,
        deliveryId: claimed.delivery_id,
        expectedNode: node.id,
        expectedVisitSequence: run.current_visit_sequence,
        expectedStatus: node.deosStatus,
        nextNode: decision.toNode,
        nextStatus: statusForNode(this.definition, decision.toNode),
        terminalCause: target.type === "failure" ? target.cause : null,
        outcome: decision.outcome,
        transitionId: transitionIdentity(run.run_id, run.current_visit_sequence),
        actorId: claimed.actor_id,
        actorType: claimed.actor_type,
        now: this.now().toISOString(),
      }));
    if (!consumed) {
      await this.store.recordWaitDelivery({
        deliveryId: claimed.delivery_id,
        waitId: wait.wait_id,
        runId: run.run_id,
        decision: "already_consumed",
        safeReason: "wait_already_consumed",
        now: this.now().toISOString(),
      });
    }
    await this.store.markInboxState(
      claimed.delivery_id,
      "claimed",
      "processed",
      this.now().toISOString(),
    );
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
    const wait = target.type === "wait" ? await (async () => {
      const resumeEventJson = canonicalEvent(target.resumeEvent);
      const cancelEventJson = canonicalEvent(target.cancelEvent);
      return {
        waitId: `${transitionId}:wait`,
        resumeEventType: target.resumeEvent.type,
        resumeEventJson,
        resumeEventDigest: await sha256Hex(resumeEventJson),
        cancelEventType: target.cancelEvent.type,
        cancelEventJson,
        cancelEventDigest: await sha256Hex(cancelEventJson),
      };
    })() : undefined;
    const result = await this.store.compareAndSetNode({
      runId: run.run_id,
      expectedNode: decision.fromNode,
      expectedVisitSequence: run.current_visit_sequence,
      expectedStatus: run.status,
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
      wait,
      humanGateDecision: decision.actorType === "user" &&
          ["revision_requested", "merge_authorized", "canceled"].includes(decision.outcome)
        ? {
            deliveryId: decision.causeReference,
            outcome: decision.outcome as "revision_requested" | "merge_authorized" | "canceled",
          }
        : undefined,
      terminalCause: target.type === "failure" ? target.cause : null,
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

  private evaluateExecutionOutcome(
    nodeId: string,
    outcome: ValidatedAgentOutcome | ValidatedSystemOutcome,
  ): Extract<EdgeDecision, { kind: "transition" }> {
    let decision: EdgeDecision;
    try {
      decision = evaluateNodeOutcome(this.definition, nodeId, outcome);
    } catch (error) {
      if (this.definition.version < 4) throw error;
      decision = outcome.kind === "agent"
        ? evaluateNodeOutcome(this.definition, nodeId, {
          kind: "agent",
          outcome: "failed",
          providerReceiptsPresent: outcome.providerReceiptsPresent,
          providerReceiptsComplete: false,
        })
        : evaluateNodeOutcome(this.definition, nodeId, {
          kind: "system_action",
          outcome: "failed",
          providerReceiptsComplete: false,
        });
    }
    if (decision.kind !== "transition") {
      throw new Error(`execution node ${nodeId} did not select a graph transition`);
    }
    return decision;
  }
}
