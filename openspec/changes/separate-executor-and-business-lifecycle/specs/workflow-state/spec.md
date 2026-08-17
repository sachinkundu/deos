## MODIFIED Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record authoritative business-state transitions in D1, SHALL distinguish agent execution state from business workflow state, and SHALL represent human approval as an explicit node surfaced through the Linear board column `Human Review`. The encoded workflow definition SHALL describe nodes, decision edges, loops, autonomous actions, agent dispatches, human gates, resumable waits, failure actions, and final business outcomes. The Workflow manager SHALL be the sole authority that initiates Linear state transitions and SHALL select the next action from the previous state, current state, accumulated run data, provider results, and agent outcome. Every orchestration decision SHALL record the DEOS run status independently from the Cloudflare execution disposition.

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

#### Scenario: Run reaches a final business outcome

- **WHEN** the governed process reaches a definition-declared final outcome such as `succeeded`, `denied`, or `canceled`
- **THEN** D1 records that final DEOS status and terminal node before the Workflow returns normally, while Cloudflare completion remains executor evidence rather than a substitute for that business outcome

#### Scenario: Run reaches a resumable condition

- **WHEN** a missing capability, incomplete system action, or ambiguous provider effect can be reconciled so the same run may continue
- **THEN** D1 records `awaiting_capability` or `manual_reconciliation_required`, the current node, transition cause, and exact expected event without setting a terminal timestamp, and the same Workflow instance waits durably for that event

#### Scenario: Authorized reconciliation resumes the run

- **WHEN** the exact expected event is received from a source and actor authorized by the frozen workflow definition
- **THEN** the Workflow consumes it once, records the resumption, and continues the same run and instance without repeating a completed provider effect

#### Scenario: Unexpected event arrives while waiting

- **WHEN** an event does not match the persisted expected event or its authorization policy
- **THEN** the Workflow audits the event without resuming the run, changing the wait state, or allocating a replacement instance

#### Scenario: Executor or invariant failure is unrecoverable

- **WHEN** an executor path or durable invariant still fails after its configured bounded retries and D1 remains available to record the outcome
- **THEN** D1 records DEOS `failed` with a bounded safe cause and the Workflow terminates by error rather than returning a successful executor result

#### Scenario: Definition uses an ambiguous blocked terminal

- **WHEN** a new workflow definition uses one `blocked` outcome for both final and resumable conditions
- **THEN** definition validation rejects it and requires explicit final, waiting, or failure semantics

### Requirement: Interpret structured agent outcomes inside the state machine

The Workflow SHALL validate and interpret each structured agent outcome against the encoded workflow definition, previous and current business states, accumulated run data, and project policy. Agent output MUST NOT directly select or perform a Linear state transition. A completed, blocked, or failed outcome SHALL result only in an action permitted by an edge from the current node, with provider prerequisites and idempotency receipts reconciled before any outward transition. The definition SHALL classify every non-success action as a bounded retry, a resumable wait with an exact expected event, a final business outcome, or an unrecoverable failure.

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
- **THEN** the Workflow applies the definition's explicit final or resumable action, records the blocker, and does not treat the agent as a human approver or infer terminality from the word `blocked`

#### Scenario: Agent execution fails

- **WHEN** agent startup, authentication, execution, result validation, artifact persistence, or cleanup produces a failed outcome
- **THEN** the Workflow applies the configured bounded retry, resumable wait, or unrecoverable failure action and does not advance through a success transition

#### Scenario: System action lacks an exact execution receipt

- **WHEN** a system-action node has only artifact manifests or unrelated provider receipts and no successful or reconciled receipt for its exact configured action
- **THEN** the Workflow refuses the success edge and applies the definition's explicit bounded retry, resumable wait, or unrecoverable failure action without claiming that the named action executed

#### Scenario: Recoverable system action lacks an exact execution receipt

- **WHEN** a system-action node has no successful or reconciled receipt for its exact configured action and the definition classifies the missing capability as recoverable
- **THEN** the Workflow records the exact capability or reconciliation event required and waits durably instead of following a terminal blocked edge

#### Scenario: Unrecoverable system action lacks an exact execution receipt

- **WHEN** a system-action node has no successful or reconciled receipt for its exact configured action and the definition classifies the invariant as unrecoverable after bounded retries
- **THEN** the Workflow records DEOS `failed` with a bounded safe cause and terminates by error without claiming that the named action executed

#### Scenario: Agent output names a Linear transition

- **WHEN** an agent result includes or requests a Linear state change
- **THEN** the Workflow ignores the requested transition, records a contract violation, and applies only the state-machine action allowed by policy
