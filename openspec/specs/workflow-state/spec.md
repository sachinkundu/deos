# Workflow State Specification

## Purpose

Track workflow progress, approvals, runs, transitions, and audit history so automation remains observable and cannot bypass human decisions.

## Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record authoritative business-state transitions in D1, SHALL distinguish agent execution state from business workflow state, and SHALL represent human approval as an explicit node surfaced through the Linear board column `Human Review`. The encoded workflow definition SHALL describe nodes, decision edges, loops, autonomous actions, agent dispatches, human gates, terminal outcomes, and the configured Linear state that selects each human decision edge. The Workflow manager SHALL be the sole authority that initiates Linear state transitions and SHALL select the next action from the previous state, current state, accumulated run data, provider results, and agent outcome. A selected simplified run SHALL begin with a trusted system action that preserves the human assignee, delegates the issue to the DEOS app user, and moves it from `Todo` to `In Progress` before agent execution. For the simplified planning gate, the three authorized decisions SHALL be `In Progress` for revision of the same planning pull request, `Merging` for the workflow-owned merge path, and `Canceled` for terminal cancellation.

#### Scenario: Approval required

- **WHEN** the Workflow reaches a state designated by policy as a human gate after all prerequisite work succeeds
- **THEN** it enters `AWAITING_HUMAN_APPROVAL`, moves the issue into the `Human Review` board column, and does not advance automatically

#### Scenario: State continues autonomously

- **WHEN** a valid agent outcome reaches a state that policy defines as autonomous
- **THEN** the Workflow selects and records the next state or agent dispatch without requiring a human approval event

#### Scenario: Simplified run takes ownership of admitted work

- **WHEN** the simplified Workflow starts from an accepted human `Backlog` to `Todo` transition
- **THEN** it records one trusted provider action that delegates the issue to the DEOS app user, preserves the human assignee, confirms `In Progress`, and advances to agent execution only after provider read-back succeeds

#### Scenario: Human resumes workflow

- **WHEN** a configured decision transition out of the `Human Review` board column is received from Linear with actor identity verified as an authorized human
- **THEN** the Workflow records the human decision and actor and selects the edge mapped to that exact provider state using the state from which the gate was entered, the current gate, and accumulated run data

#### Scenario: Simplified planning revision is requested

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `In Progress`
- **THEN** the Workflow records a revision-requested decision and dispatches the configured planning revision edge for the same run and pull request

#### Scenario: Simplified planning merge is authorized

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `Merging`
- **THEN** the Workflow records a merge-authorized decision and selects only the configured trusted merge edge

#### Scenario: Simplified planning run is canceled

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `Canceled`
- **THEN** the Workflow records a canceled decision and selects the configured terminal cancellation edge without merging or dispatching another agent

#### Scenario: Human transition has no configured decision edge

- **WHEN** an authorized human moves an issue from `Human Review` to a provider state not mapped by the active gate
- **THEN** the Workflow records the unmatched event, selects no edge, and restores or retains the active human gate according to policy

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

### Requirement: Give every genuine workflow traversal a durable identity

The Workflow SHALL assign a durable visit identity to each genuine visit to a workflow node and SHALL derive each selected edge traversal from the visit that selected it. A traversal identity MUST be unique within the workflow run for a later genuine traversal of the same edge, and MUST remain stable when durable execution replays or retries that same logical traversal. D1 SHALL contain exactly one transition record for each genuine traversal.

#### Scenario: First traversal of an edge

- **WHEN** the Workflow selects an edge from the current node for the first time in a run
- **THEN** it records one transition with the durable identity of that traversal and advances the run to the selected node

#### Scenario: Durable execution replays the same traversal

- **WHEN** durable execution retries or replays a logical traversal that D1 has already recorded
- **THEN** the Workflow reuses that traversal's identity, does not add another transition record, does not advance the run again, and does not repeat a provider effect

#### Scenario: A loop traverses the same edge again

- **WHEN** the encoded workflow returns to an earlier node and genuinely selects an edge already traversed in the same run
- **THEN** the later traversal receives a new durable identity and D1 records a separate transition even when its from-node, to-node, outcome, and cause match the earlier traversal

### Requirement: Keep the authoritative run and transition ledger in agreement

The authoritative run-node update and its transition-ledger insert SHALL commit as one atomic state change guarded by the expected current visit and node. A successful state change MUST update the run to the selected next node and insert exactly one matching transition record; if either write cannot be committed, neither write SHALL take effect.

#### Scenario: Transition commits successfully

- **WHEN** the expected visit and current node still match and the transition identity has not been recorded
- **THEN** D1 advances the run and inserts its matching transition record in the same commit

#### Scenario: Concurrent attempts commit one traversal

- **WHEN** two executions concurrently attempt to commit the same logical traversal from the same expected visit
- **THEN** exactly one execution advances the run and records the transition, while the other reconciles the already-recorded traversal without adding a row or advancing again

#### Scenario: Stale attempt loses a compare-and-set

- **WHEN** an execution attempts a transition from a visit or current node that is no longer authoritative
- **THEN** it changes neither the run nor the transition ledger and reloads D1 authority before deciding whether any further action is valid

#### Scenario: Transition identity conflicts with different facts

- **WHEN** a proposed transition identity already names a transition with different run, visit, edge, cause, actor, or provider-operation facts
- **THEN** the Workflow fails the commit as an identity conflict and does not treat it as a replay

### Requirement: Scope human-gate entry operations to the gate visit

Each operation that moves a Linear issue into a configured human-gate state SHALL have a stable identity scoped to the workflow run and the durable visit to that gate. Retrying or reconciling one gate visit MUST reuse its existing operation, while a later genuine visit to the same gate MUST use a new operation.

#### Scenario: Human-gate entry is retried

- **WHEN** the Workflow retries or reconciles entry into the same durable human-gate visit
- **THEN** it reuses the visit's provider operation and does not issue a second Linear transition for that visit

#### Scenario: Workflow returns to the same human gate

- **WHEN** a loop or rejection path creates a later genuine visit to a human gate already visited in the run
- **THEN** the Workflow creates a new visit-scoped provider operation and moves the Linear issue into the configured human-gate state for the new visit
