## Purpose

Let operators reconstruct the lifecycle and outcome of a Linear-driven workflow across asynchronous service boundaries without exposing sensitive request or credential data.

## ADDED Requirements

### Requirement: Operator can trace one workflow across service boundaries

The system SHALL associate every observable stage of a relevant Linear-driven workflow with one stable correlation identifier.

#### Scenario: Operator follows a completed workflow

- **WHEN** an operator queries telemetry for a relevant Linear delivery or its workflow run
- **THEN** the result identifies one correlation identifier and shows the related ingress, asynchronous dispatch, durable transitions, and outbound Linear interaction

#### Scenario: Operator locates where a workflow stopped

- **WHEN** a workflow does not reach its expected terminal state
- **THEN** telemetry associated with its correlation identifier shows the last completed stage and the stage that failed or remained incomplete

### Requirement: Telemetry has consistent query semantics

The system SHALL expose OTEL-compatible structured observations with a time, service, workflow stage, outcome, correlation identifier, and available resource identifiers needed to locate the related delivery, issue, project, and workflow run.

#### Scenario: Successful stage is reported

- **WHEN** an observed workflow stage completes successfully
- **THEN** its terminal observation reports a successful outcome with the shared correlation identifier and relevant resource identifiers

#### Scenario: Failed stage is reported without false success

- **WHEN** an observed workflow stage fails
- **THEN** its terminal observation reports a failure outcome and does not report that stage as successful

### Requirement: Repeated processing remains understandable

The system SHALL keep observations for repeated processing associated with the original workflow correlation identifier while allowing an operator to distinguish individual attempts and their outcomes.

#### Scenario: Asynchronous processing is retried

- **WHEN** an existing workflow is processed more than once because of retry behavior
- **THEN** all attempts remain queryable under the same correlation identifier and each attempt has a distinguishable outcome

#### Scenario: Previously handled delivery is observed again

- **WHEN** the system observes a provider delivery that it has already handled
- **THEN** telemetry identifies the repeated delivery under the original correlation identifier rather than presenting it as a new workflow

### Requirement: Telemetry excludes sensitive data

Telemetry MUST NOT expose webhook signing secrets, API tokens, authorization headers, raw signed request bodies, or unapproved provider payload fields.

#### Scenario: Operator inspects workflow telemetry

- **WHEN** an operator reads observations from successful and failed workflow paths
- **THEN** event names, attributes, and error details contain none of the forbidden sensitive data

#### Scenario: Provider error contains sensitive material

- **WHEN** an external dependency returns an error containing request or credential material
- **THEN** telemetry exposes a safe error classification instead of the unfiltered provider response
