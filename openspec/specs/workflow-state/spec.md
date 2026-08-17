# Workflow State Specification

## Purpose

Track workflow progress, approvals, runs, transitions, and audit history so automation remains observable and cannot bypass human decisions.


## Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record authoritative business-state transitions in D1, SHALL distinguish agent execution state from business workflow state, and SHALL represent human approval as an explicit node surfaced through the Linear board column `Human Review`. The encoded workflow definition SHALL describe nodes, decision edges, loops, autonomous actions, agent dispatches, human gates, and terminal outcomes. The Workflow manager SHALL be the sole authority that initiates Linear state transitions and SHALL select the next action from the previous state, current state, accumulated run data, provider results, and agent outcome.

#### Scenario: Approval required

- **WHEN** the Workflow reaches a state designated by policy as a human gate after all prerequisite work succeeds
- **THEN** it enters `AWAITING_HUMAN_APPROVAL`, moves the issue into the `Human Review` board column, and does not advance automatically

#### Scenario: State continues autonomously

- **WHEN** a valid agent outcome reaches a state that policy defines as autonomous
- **THEN** the Workflow selects and records the next state or agent dispatch without requiring a human approval event

#### Scenario: Human resumes workflow

- **WHEN** a configured approval or rejection transition out of the `Human Review` board column is received from Linear with actor identity verified as an authorized human
- **THEN** the Workflow records the human decision and actor and selects the configured next edge using the state from which the gate was entered, the current gate, and accumulated run data

#### Scenario: Automated event attempts to approve a human gate

- **WHEN** an approval-shaped event is attributable to an agent, integration, bot, unknown actor, or unauthorized human
- **THEN** the Workflow records the rejected decision event, keeps D1 in `AWAITING_HUMAN_APPROVAL`, and idempotently restores the issue to the `Human Review` board column before accepting another decision

#### Scenario: Provider restoration after unauthorized transition fails

- **WHEN** the Workflow cannot confirm that an issue moved by an unauthorized actor has been restored to `Human Review`
- **THEN** it records a provider-state repair failure, prevents further gate processing, and creates or updates an operator work item for reconciliation

#### Scenario: Auditable transition

- **WHEN** a business workflow state changes
- **THEN** the system records the prior state, next state, verified actor or system cause, triggering delivery or agent outcome, workflow run, and timestamp in D1

#### Scenario: Workflow execution resumes after interruption

- **WHEN** durable Workflow execution resumes or retries a state-machine step
- **THEN** it reconciles the D1 authoritative state before making a transition and does not repeat an already recorded provider effect

#### Scenario: Deployed definition advances while a run is active

- **WHEN** durable Workflow execution resumes after the deployed immutable definition bundle has advanced beyond the active run's selected version
- **THEN** it restores the run's canonical definition from D1, verifies the selected digest, and continues only through that frozen graph

#### Scenario: Workflow definition contains a loop or decision tree

- **WHEN** the current node has multiple permitted edges or returns to an earlier node
- **THEN** the Workflow evaluates the encoded conditions against accumulated run data and records the selected edge without substituting a hard-coded human gate

### Requirement: Emit workflow telemetry

The workflow SHALL emit OpenTelemetry-compatible traces or events for ingress, queue consumption, state transitions, and external calls using a shared correlation id.

#### Scenario: Queryable run

- **WHEN** a workflow run processes an event
- **THEN** an OTEL-compatible backend or tool can correlate the delivery, transitions, and external calls without a custom application UI

### Requirement: Interpret structured agent outcomes inside the state machine

The Workflow SHALL validate and interpret each structured agent outcome against the encoded workflow definition, previous and current business states, accumulated run data, and project policy. Agent output MUST NOT directly select or perform a Linear state transition. A completed, blocked, or failed outcome SHALL result only in an action permitted by an edge from the current node, with provider prerequisites and idempotency receipts reconciled before any outward transition.

#### Scenario: Completed outcome permits autonomous continuation

- **WHEN** a valid completed outcome and its required provider receipts satisfy an autonomous state's exit conditions
- **THEN** the Workflow records the outcome and continues to the configured next state or agent step

#### Scenario: Completed outcome reaches a configured human gate

- **WHEN** an agent succeeds, all prerequisites are complete, and the encoded workflow selects a human gate as the next node
- **THEN** the Workflow records the state from which the gate is entered and enters `AWAITING_HUMAN_APPROVAL`

#### Scenario: Completed outcome launches another agent

- **WHEN** an agent succeeds and the selected workflow edge dispatches a follow-up agent rather than entering a human gate
- **THEN** the Workflow records the completed attempt and launches the next agent with the durable branch, work-product, working-note, artifact, and review context required by that node

#### Scenario: Agent reports blocked

- **WHEN** a valid blocked outcome is received
- **THEN** the Workflow records the blocker and follows the configured blocked-state action without treating the agent as a human approver

#### Scenario: Agent execution fails

- **WHEN** agent startup, authentication, execution, result validation, artifact persistence, or cleanup produces a failed outcome
- **THEN** the Workflow applies the configured retry or failure action and does not advance through a success transition

#### Scenario: System action lacks an exact execution receipt

- **WHEN** a system-action node has only artifact manifests or unrelated provider receipts and no successful or reconciled receipt for its exact configured action
- **THEN** the Workflow follows the configured failed edge and does not claim that the named action executed

#### Scenario: Agent output names a Linear transition

- **WHEN** an agent result includes or requests a Linear state change
- **THEN** the Workflow ignores the requested transition, records a contract violation, and applies only the state-machine action allowed by policy
