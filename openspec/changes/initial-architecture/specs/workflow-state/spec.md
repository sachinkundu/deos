## Purpose

Track workflow progress, approvals, runs, transitions, and audit history so automation remains observable and cannot bypass human decisions.

## ADDED Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record transitions and SHALL represent human approval as an explicit state.

#### Scenario: Approval required

- **WHEN** a workflow reaches a step requiring human approval
- **THEN** it enters an approval state and does not advance automatically

#### Scenario: Auditable transition

- **WHEN** a workflow state changes
- **THEN** the system records the prior state, next state, actor or cause, and timestamp

