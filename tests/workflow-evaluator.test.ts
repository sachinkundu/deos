import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateNodeOutcome,
  evaluateWaitEvent,
  instructionForNode,
} from "../src/workflow-evaluator.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";

const definition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: evaluator-test, version: 1 }
spec:
  start: implement
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs:
    implement:
      promptFile: prompts/implement.md
      inputs: []
      resultSchema: schemas/result.json
      requiredOutputs: []
    openspec:
      promptFile: prompts/implement.md
      inputs: []
      resultSchema: schemas/result.json
      requiredOutputs: []
      operation: {kind: openspec, instruction: /opsx:continue}
  nodes:
    implement: { type: agent, job: implement, edges: { completed: review, blocked: blocked, failed: blocked } }
    review: { type: agent, job: implement, edges: { approved: approval, changes_requested: implement, blocked: blocked, failed: blocked } }
    approval: { type: human_gate, linearState: Human Approval, edges: { approved: action, rejected: implement } }
    action: { type: system_action, action: openspec.verify, edges: { completed: done, failed: blocked } }
    openspec: { type: agent, job: openspec, edges: { completed: done, blocked: blocked, failed: blocked } }
    done: { type: terminal, outcome: succeeded }
    blocked: { type: terminal, outcome: blocked }
`,
  {
    prompts: { "prompts/implement.md": "Do the work." },
    schemas: {
      "schemas/result.json": JSON.stringify({
        $id: "https://deos.dev/test-result.json",
        type: "object",
      }),
    },
  },
);

const waitDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: wait-test, version: 4 }
spec:
  start: action
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    action: { type: system_action, action: openspec.create_tasks, edges: { completed: done, failed: wait } }
    wait:
      type: wait
      deosStatus: awaiting_capability
      resumeEvent: { type: linear.issue.state_changed, actorType: user, toState: In Progress, action: openspec.create_tasks }
      cancelEvent: { type: linear.issue.state_changed, actorType: user, toState: Canceled }
      edges: { received: action, canceled: canceled }
    done: { type: terminal, deosStatus: succeeded, executorAction: return }
    canceled: { type: terminal, deosStatus: canceled, executorAction: return }
`,
  { prompts: {}, schemas: {} },
);

const mappedGateDefinition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: simple, version: 1 }
spec:
  start: review
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    review:
      type: human_gate
      linearState: Human Review
      decisions: { revision_requested: In Progress, merge_authorized: Merging, canceled: Canceled }
      edges: { revision_requested: revision, merge_authorized: merge, canceled: canceled }
    revision: { type: terminal, deosStatus: succeeded, executorAction: return }
    merge: { type: terminal, deosStatus: succeeded, executorAction: return }
    canceled: { type: terminal, deosStatus: canceled, executorAction: return }
`,
  { prompts: {}, schemas: {} },
);

test("node instructions cover agents, system actions, gates, and terminals", () => {
  assert.deepEqual(instructionForNode(definition, "implement"), {
    kind: "dispatch_agent", nodeId: "implement", jobId: "implement",
  });
  assert.equal(instructionForNode(definition, "action").kind, "run_system_action");
  assert.equal(instructionForNode(definition, "approval").kind, "wait_for_human");
  assert.deepEqual(instructionForNode(definition, "done"), {
    kind: "terminal", nodeId: "done", outcome: "succeeded",
  });
});

test("autonomous agent continuation and review loops use only configured edges", () => {
  const completed = evaluateNodeOutcome(definition, "implement", {
    kind: "agent", outcome: "completed", providerReceiptsPresent: true, providerReceiptsComplete: true,
  });
  assert.equal(completed.kind === "transition" ? completed.toNode : null, "review");
  const loop = evaluateNodeOutcome(definition, "review", {
    kind: "agent", outcome: "changes_requested", providerReceiptsPresent: true, providerReceiptsComplete: true,
  });
  assert.equal(loop.kind === "transition" ? loop.toNode : null, "implement");
  assert.throws(() => evaluateNodeOutcome(definition, "review", {
    kind: "agent", outcome: "completed", providerReceiptsPresent: true, providerReceiptsComplete: true,
  }), /no completed edge/);
});

test("success paths fail closed until provider receipts are complete", () => {
  assert.throws(() => evaluateNodeOutcome(definition, "implement", {
    kind: "agent", outcome: "completed", providerReceiptsPresent: false, providerReceiptsComplete: false,
  }), /missing provider receipts/);
  assert.throws(() => evaluateNodeOutcome(definition, "action", {
    kind: "system_action", outcome: "completed", providerReceiptsComplete: false,
  }), /missing provider receipts/);
});

test("repository-local OpenSpec completion permits zero receipts but not incomplete attempted effects", () => {
  const local = evaluateNodeOutcome(definition, "openspec", {
    kind: "agent",
    outcome: "completed",
    providerReceiptsPresent: false,
    providerReceiptsComplete: false,
  });
  assert.equal(local.kind === "transition" ? local.toNode : null, "done");
  assert.throws(() => evaluateNodeOutcome(definition, "openspec", {
    kind: "agent",
    outcome: "completed",
    providerReceiptsPresent: true,
    providerReceiptsComplete: false,
  }), /missing provider receipts/);
});

test("agent-requested Linear transitions are recorded but cannot select an edge", () => {
  const decision = evaluateNodeOutcome(definition, "implement", {
    kind: "agent",
    outcome: "completed",
    providerReceiptsPresent: true,
    providerReceiptsComplete: true,
    attemptedLinearTransition: true,
  });
  assert.equal(decision.kind === "transition" && decision.contractViolation, true);
  assert.equal(decision.kind === "transition" ? decision.toNode : null, "review");
});

test("only a user leaving the active gate can approve or reject", () => {
  const approved = evaluateNodeOutcome(definition, "approval", {
    kind: "linear_event",
    deliveryId: "delivery-1",
    actorId: "user-1",
    actorType: "user",
    fromStateId: "human-state",
    fromStateName: null,
    toStateName: "In Progress",
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
  });
  assert.equal(approved.kind === "transition" ? approved.toNode : null, "action");

  const wrongProviderState = evaluateNodeOutcome(definition, "approval", {
    kind: "linear_event",
    deliveryId: "delivery-wrong-state",
    actorId: "user-1",
    actorType: "user",
    fromStateId: "different-state",
    fromStateName: "Human Approval",
    toStateName: "In Progress",
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
  });
  assert.equal(wrongProviderState.kind, "wait");

  const repair = evaluateNodeOutcome(definition, "approval", {
    kind: "linear_event",
    deliveryId: "delivery-2",
    actorId: "oauth-1",
    actorType: "oauthclient",
    fromStateId: "human-state",
    fromStateName: "Human Approval",
    toStateName: "In Progress",
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
  });
  assert.equal(repair.kind, "repair_gate");

  const rejected = evaluateNodeOutcome(definition, "approval", {
    kind: "linear_event",
    deliveryId: "delivery-3",
    actorId: "user-2",
    actorType: "user",
    fromStateId: "human-state",
    fromStateName: "Human Approval",
    toStateName: "Canceled",
    humanGateStateId: "human-state",
    approvalStateNames: ["In Progress"],
    rejectionStateNames: ["Canceled"],
  });
  assert.equal(rejected.kind === "transition" ? rejected.toNode : null, "implement");
});

test("mapped human gate keeps revision, merge, and cancellation distinct", () => {
  const event = (toStateName: string, actorType: string | null = "user") =>
    evaluateNodeOutcome(mappedGateDefinition, "review", {
      kind: "linear_event" as const,
      deliveryId: `delivery-${toStateName}`,
      actorId: "actor-1",
      actorType,
      fromStateId: "human-state",
      fromStateName: "Human Review",
      toStateName,
      humanGateStateId: "human-state",
      approvalStateNames: ["In Progress"],
      rejectionStateNames: ["Canceled"],
    });
  const revision = event("In Progress");
  const merge = event("Merging");
  const canceled = event("Canceled");
  assert.equal(revision.kind === "transition" ? revision.outcome : null, "revision_requested");
  assert.equal(revision.kind === "transition" ? revision.toNode : null, "revision");
  assert.equal(merge.kind === "transition" ? merge.outcome : null, "merge_authorized");
  assert.equal(merge.kind === "transition" ? merge.toNode : null, "merge");
  assert.equal(canceled.kind === "transition" ? canceled.outcome : null, "canceled");
  assert.equal(canceled.kind === "transition" ? canceled.toNode : null, "canceled");
  assert.equal(event("Todo").kind, "repair_gate");
  assert.equal(event("Merging", "oauthclient").kind, "repair_gate");
});

test("wait events can only request the frozen resume or cancellation edge", () => {
  assert.equal(instructionForNode(waitDefinition, "wait").kind, "wait_for_event");
  assert.deepEqual(evaluateWaitEvent(waitDefinition, "wait", {
    deliveryId: "delivery-resume",
    eventKind: "Issue.update",
    actorId: "user-1",
    actorType: "user",
    toStateName: "In Progress",
  }), {
    kind: "resume",
    outcome: "received",
    toNode: "action",
    safeReason: "authorized_resume",
  });
  assert.equal(evaluateWaitEvent(waitDefinition, "wait", {
    deliveryId: "delivery-cancel",
    eventKind: "Issue.update",
    actorId: "user-1",
    actorType: "user",
    toStateName: "Canceled",
  }).kind, "cancel");
  assert.equal(evaluateWaitEvent(waitDefinition, "wait", {
    deliveryId: "delivery-bot",
    eventKind: "Issue.update",
    actorId: "app-1",
    actorType: "oauthclient",
    toStateName: "In Progress",
  }).kind, "reject");
  assert.equal(evaluateWaitEvent(waitDefinition, "wait", {
    deliveryId: "delivery-unexpected",
    eventKind: "Issue.update",
    actorId: "user-1",
    actorType: "user",
    toStateName: "Human Review",
  }).kind, "reject");
});
