import type {
  LoadedWorkflowDefinition,
  TerminalOutcome,
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
  | { kind: "terminal"; nodeId: string; outcome: TerminalOutcome };

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
  return { kind: "terminal", nodeId, outcome: node.outcome };
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
  if (node.type === "terminal") throw new Error(`terminal node ${nodeId} cannot consume an outcome`);

  if (node.type === "agent") {
    if (input.kind !== "agent") throw new Error(`agent node ${nodeId} requires an agent outcome`);
    const job = definition.jobs[node.job];
    if (job === undefined) throw new Error(`agent node ${nodeId} references a missing job`);
    const repositoryLocalOpenSpec = job.operation?.kind === "openspec";
    const requiresReceipts = !["blocked", "failed"].includes(input.outcome) &&
      (!repositoryLocalOpenSpec || input.providerReceiptsPresent);
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
  const outcome = input.approvalStateNames.includes(input.toStateName)
    ? "approved"
    : input.rejectionStateNames.includes(input.toStateName)
      ? "rejected"
      : null;
  if (outcome === null) return { kind: "wait", reason: "unrelated_event" };
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
