import type {
  FailureWorkflowNode,
  LoadedWorkflowDefinition,
  TerminalOutcome,
  WaitWorkflowNode,
  WorkflowNode,
} from "./workflow-definition.ts";

export interface ValidatedAgentOutcome {
  kind: "agent";
  outcome: string;
  providerReceiptsPresent: boolean;
  providerReceiptsComplete: boolean;
  attemptedLinearTransition?: boolean;
}

export interface ValidatedSystemOutcome {
  kind: "system_action";
  outcome: "completed" | "failed";
  providerReceiptsComplete: boolean;
}

export interface HumanGateEvent {
  kind: "linear_event";
  deliveryId: string;
  actorId: string | null;
  actorType: string | null;
  fromStateId: string | null;
  fromStateName: string | null;
  toStateName: string;
  humanGateStateId: string;
  approvalStateNames: readonly string[];
  rejectionStateNames: readonly string[];
}

export type WorkflowDecisionInput =
  | ValidatedAgentOutcome
  | ValidatedSystemOutcome
  | HumanGateEvent;

export type NodeInstruction =
  | { kind: "dispatch_agent"; nodeId: string; jobId: string }
  | { kind: "run_system_action"; nodeId: string; action: string }
  | { kind: "wait_for_human"; nodeId: string; linearState: string }
  | { kind: "wait_for_event"; nodeId: string; node: WaitWorkflowNode }
  | { kind: "terminal"; nodeId: string; outcome: TerminalOutcome }
  | { kind: "fail"; nodeId: string; node: FailureWorkflowNode };

export interface WaitEventInput {
  deliveryId: string;
  eventKind: string;
  actorId: string | null;
  actorType: string | null;
  toStateName: string;
}

export type WaitEventDecision =
  | { kind: "resume"; outcome: "received"; toNode: string; safeReason: "authorized_resume" }
  | { kind: "cancel"; outcome: "canceled"; toNode: string; safeReason: "authorized_cancel" }
  | {
      kind: "reject";
      safeReason: "unexpected_event" | "unauthorized_actor";
    };

export type EdgeDecision =
  | {
      kind: "transition";
      fromNode: string;
      toNode: string;
      outcome: string;
      actorId: string | null;
      actorType: string | null;
      causeReference: string;
      contractViolation: boolean;
    }
  | { kind: "wait"; reason: "unrelated_event" }
  | {
      kind: "repair_gate";
      nodeId: string;
      linearState: string;
      deliveryId: string;
      actorId: string | null;
      actorType: string | null;
    };

const nodeAt = (definition: LoadedWorkflowDefinition, nodeId: string): WorkflowNode => {
  const node = definition.nodes[nodeId];
  if (node === undefined) throw new Error(`workflow node ${nodeId} is not defined`);
  return node;
};

export const instructionForNode = (
  definition: LoadedWorkflowDefinition,
  nodeId: string,
): NodeInstruction => {
  const node = nodeAt(definition, nodeId);
  if (node.type === "agent") return { kind: "dispatch_agent", nodeId, jobId: node.job };
  if (node.type === "system_action") {
    return { kind: "run_system_action", nodeId, action: node.action };
  }
  if (node.type === "human_gate") {
    return { kind: "wait_for_human", nodeId, linearState: node.linearState };
  }
  if (node.type === "wait") return { kind: "wait_for_event", nodeId, node };
  if (node.type === "terminal") return { kind: "terminal", nodeId, outcome: node.outcome };
  return { kind: "fail", nodeId, node };
};

const edge = (node: WorkflowNode, outcome: string): string => {
  const target = node.edges[outcome];
  if (target === undefined) throw new Error(`node ${node.id} has no ${outcome} edge`);
  return target;
};

export const evaluateNodeOutcome = (
  definition: LoadedWorkflowDefinition,
  nodeId: string,
  input: WorkflowDecisionInput,
): EdgeDecision => {
  const node = nodeAt(definition, nodeId);
  if (node.type === "terminal" || node.type === "wait" || node.type === "failure") {
    throw new Error(`${node.type} node ${nodeId} cannot consume an outcome`);
  }

  if (node.type === "agent") {
    if (input.kind !== "agent") throw new Error(`agent node ${nodeId} requires an agent outcome`);
    const job = definition.jobs[node.job];
    if (job === undefined) throw new Error(`agent node ${nodeId} references a missing job`);
    const repositoryLocalOpenSpec = job.operation?.kind === "openspec";
    const explicitProviderAccess = (job.providerAccess?.length ?? 0) > 0 ||
      (job.capabilities?.length ?? 0) > 0;
    const requiresReceipts = !["blocked", "failed"].includes(input.outcome) &&
      (job.agentRole === undefined
        ? (!repositoryLocalOpenSpec || input.providerReceiptsPresent)
        : explicitProviderAccess);
    if (requiresReceipts && !input.providerReceiptsComplete) {
      throw new Error(`agent node ${nodeId} is missing provider receipts`);
    }
    return {
      kind: "transition",
      fromNode: nodeId,
      toNode: edge(node, input.outcome),
      outcome: input.outcome,
      actorId: null,
      actorType: "agent",
      causeReference: `agent:${nodeId}:${input.outcome}`,
      contractViolation: input.attemptedLinearTransition === true,
    };
  }

  if (node.type === "system_action") {
    if (input.kind !== "system_action") {
      throw new Error(`system-action node ${nodeId} requires a system outcome`);
    }
    if (input.outcome === "completed" && !input.providerReceiptsComplete) {
      throw new Error(`system-action node ${nodeId} is missing provider receipts`);
    }
    return {
      kind: "transition",
      fromNode: nodeId,
      toNode: edge(node, input.outcome),
      outcome: input.outcome,
      actorId: null,
      actorType: "workflow",
      causeReference: `system:${node.action}:${input.outcome}`,
      contractViolation: false,
    };
  }

  if (node.type !== "human_gate") throw new Error(`unsupported outcome node ${nodeId}`);
  if (input.kind !== "linear_event") {
    throw new Error(`human-gate node ${nodeId} requires a Linear event`);
  }
  const departedActiveGate = input.fromStateId !== null
    ? input.fromStateId === input.humanGateStateId
    : input.fromStateName === node.linearState;
  if (!departedActiveGate) return { kind: "wait", reason: "unrelated_event" };
  if (input.actorType !== "user" || input.actorId === null) {
    return {
      kind: "repair_gate",
      nodeId,
      linearState: node.linearState,
      deliveryId: input.deliveryId,
      actorId: input.actorId,
      actorType: input.actorType,
    };
  }
  const mappedOutcome = node.decisions === undefined
    ? null
    : Object.entries(node.decisions).find(([, state]) => state === input.toStateName)?.[0] ?? null;
  const outcome = node.decisions === undefined
    ? input.approvalStateNames.includes(input.toStateName)
      ? "approved"
      : input.rejectionStateNames.includes(input.toStateName)
        ? "rejected"
        : null
    : mappedOutcome;
  if (outcome === null) {
    if (node.decisions === undefined) return { kind: "wait", reason: "unrelated_event" };
    return {
      kind: "repair_gate",
      nodeId,
      linearState: node.linearState,
      deliveryId: input.deliveryId,
      actorId: input.actorId,
      actorType: input.actorType,
    };
  }
  return {
    kind: "transition",
    fromNode: nodeId,
    toNode: edge(node, outcome),
    outcome,
    actorId: input.actorId,
    actorType: input.actorType,
    causeReference: input.deliveryId,
    contractViolation: false,
  };
};

const matchesWaitDescriptor = (
  descriptor: WaitWorkflowNode["resumeEvent"],
  input: WaitEventInput,
): boolean =>
  input.eventKind === "Issue.update" &&
  input.actorType === descriptor.actorType &&
  input.actorId !== null &&
  input.toStateName === descriptor.toState;

export const evaluateWaitEvent = (
  definition: LoadedWorkflowDefinition,
  nodeId: string,
  input: WaitEventInput,
): WaitEventDecision => {
  const node = nodeAt(definition, nodeId);
  if (node.type !== "wait") throw new Error(`node ${nodeId} is not a wait node`);
  if (input.actorType !== "user" || input.actorId === null) {
    return { kind: "reject", safeReason: "unauthorized_actor" };
  }
  if (matchesWaitDescriptor(node.resumeEvent, input)) {
    return {
      kind: "resume",
      outcome: "received",
      toNode: edge(node, "received"),
      safeReason: "authorized_resume",
    };
  }
  if (matchesWaitDescriptor(node.cancelEvent, input)) {
    return {
      kind: "cancel",
      outcome: "canceled",
      toNode: edge(node, "canceled"),
      safeReason: "authorized_cancel",
    };
  }
  return { kind: "reject", safeReason: "unexpected_event" };
};
