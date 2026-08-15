## MODIFIED Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record authoritative business-state transitions in D1, SHALL distinguish agent execution state from business workflow state, and SHALL represent human approval as an explicit state surfaced through the Linear board column `Human Approval`. The Workflow state machine SHALL be the sole authority that initiates Linear state transitions and selects whether to continue autonomously, launch another agent, record a blocked or failed outcome, or wait at a designated human gate.

#### Scenario: Approval required

- **WHEN** the Workflow reaches a state designated by policy as a human gate after all prerequisite work succeeds
- **THEN** it enters `AWAITING_HUMAN_APPROVAL`, moves the issue into the `Human Approval` board column, and does not advance automatically

#### Scenario: State continues autonomously

- **WHEN** a valid agent outcome reaches a state that policy defines as autonomous
- **THEN** the Workflow selects and records the next state or agent dispatch without requiring a human approval event

#### Scenario: Human resumes workflow

- **WHEN** a configured approval or rejection transition out of the `Human Approval` board column is received from Linear with actor identity verified as an authorized human
- **THEN** the Workflow records the actor and advances to `APPROVED` or `REJECTED`

#### Scenario: Automated event attempts to approve a human gate

- **WHEN** an approval-shaped event is attributable to an agent, integration, bot, unknown actor, or unauthorized human
- **THEN** the Workflow records the rejected decision event, remains in `AWAITING_HUMAN_APPROVAL`, and performs no approval or rejection transition

#### Scenario: Auditable transition

- **WHEN** a business workflow state changes
- **THEN** the system records the prior state, next state, verified actor or system cause, triggering delivery or agent outcome, workflow run, and timestamp in D1

#### Scenario: Workflow execution resumes after interruption

- **WHEN** durable Workflow execution resumes or retries a state-machine step
- **THEN** it reconciles the D1 authoritative state before making a transition and does not repeat an already recorded provider effect

## ADDED Requirements

### Requirement: Interpret structured agent outcomes inside the state machine

The Workflow SHALL validate and interpret each structured agent outcome against the current business state and project policy. Agent output MUST NOT directly select or perform a Linear state transition. A completed, blocked, or failed outcome SHALL result only in a state-machine action permitted for the current state, with provider prerequisites and idempotency receipts reconciled before any outward transition.

#### Scenario: Completed outcome permits autonomous continuation

- **WHEN** a valid completed outcome and its required provider receipts satisfy an autonomous state's exit conditions
- **THEN** the Workflow records the outcome and continues to the configured next state or agent step

#### Scenario: Completed outcome reaches the first-slice human gate

- **WHEN** the controlled first-slice agent succeeds and all required artifacts, provider operations, and cleanup outcomes are complete
- **THEN** the Workflow records those prerequisites and enters `AWAITING_HUMAN_APPROVAL`

#### Scenario: Agent reports blocked

- **WHEN** a valid blocked outcome is received
- **THEN** the Workflow records the blocker and follows the configured blocked-state action without treating the agent as a human approver

#### Scenario: Agent execution fails

- **WHEN** agent startup, authentication, execution, result validation, artifact persistence, or cleanup produces a failed outcome
- **THEN** the Workflow applies the configured retry or failure action and does not advance through a success transition

#### Scenario: Agent output names a Linear transition

- **WHEN** an agent result includes or requests a Linear state change
- **THEN** the Workflow ignores the requested transition, records a contract violation, and applies only the state-machine action allowed by policy
