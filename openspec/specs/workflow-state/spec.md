# Workflow State Specification

## Purpose

Track workflow progress, approvals, runs, transitions, and audit history so automation remains observable and cannot bypass human decisions.

## Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record transitions in D1 and SHALL represent human approval as an explicit state surfaced through the Linear board column `Human Review`.

#### Scenario: Approval required

- **WHEN** a workflow reaches a step requiring human approval
- **THEN** it enters `AWAITING_HUMAN_APPROVAL`, moves the issue into the `Human Review` board column, and does not advance automatically

#### Scenario: Human resumes workflow

- **WHEN** a configured approval or rejection transition out of the `Human Review` board column is received from Linear
- **THEN** the workflow records the actor and advances to `APPROVED` or `REJECTED`

#### Scenario: Auditable transition

- **WHEN** a workflow state changes
- **THEN** the system records the prior state, next state, actor or cause, and timestamp

### Requirement: Emit workflow telemetry

The workflow SHALL emit OpenTelemetry-compatible traces or events for ingress, queue consumption, state transitions, and external calls using a shared correlation id.

#### Scenario: Queryable run

- **WHEN** a workflow run processes an event
- **THEN** an OTEL-compatible backend or tool can correlate the delivery, transitions, and external calls without a custom application UI
