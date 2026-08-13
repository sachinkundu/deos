## Purpose

Make every accepted Linear-driven workflow safely traceable across asynchronous Cloudflare boundaries using stable, queryable telemetry without requiring a custom UI.

## ADDED Requirements

### Requirement: Propagate one stable workflow correlation identifier

The system SHALL use the authenticated source delivery identifier as the stable correlation identifier for an accepted Linear application event and SHALL preserve it across ingress, Queue publication, Queue consumption, the workflow run, state transitions, and outbound Linear calls.

#### Scenario: Relevant delivery crosses both Workers

- **WHEN** a new authenticated Linear delivery is classified as relevant and processed by the Queue consumer
- **THEN** ingress, Queue, workflow, D1 run, and outbound-call observations expose the same correlation identifier

#### Scenario: Queue retry preserves correlation

- **WHEN** Cloudflare retries a Queue message for an existing application event
- **THEN** the retry emits the original correlation identifier and does not allocate a new workflow correlation identifier

#### Scenario: Duplicate provider delivery is acknowledged

- **WHEN** ingress receives a delivery whose `Linear-Delivery` identifier is already recorded
- **THEN** telemetry classifies the request as duplicate using that delivery identifier and no second Queue publication or workflow transition is reported

### Requirement: Emit a consistent cross-boundary event contract

The system SHALL emit structured OTEL-compatible events with an event name, observation time, service identity, correlation identifier, outcome, and the identifiers needed to locate the related delivery, issue, project, and workflow run when those identifiers are available.

#### Scenario: Workflow transitions are observable

- **WHEN** a workflow transition is durably recorded
- **THEN** an event records the prior state, next state, cause, workflow run identifier, and shared correlation identifier

#### Scenario: External Linear call is observable

- **WHEN** the Queue consumer calls Linear to move an issue into `Human Approval`
- **THEN** start and terminal events identify the target service, issue, correlation identifier, and success or failure outcome without exposing authorization data

#### Scenario: Irrelevant delivery is observable

- **WHEN** an authenticated delivery does not match the configured project and transition policy
- **THEN** ingress emits an ignored outcome and does not emit Queue publication, consumption, or workflow-transition success events for that delivery

### Requirement: Report failures and retries without false success

The system SHALL emit a failure outcome before propagating a processing error and SHALL emit success only after the corresponding operation has completed.

#### Scenario: Queue publication fails

- **WHEN** recording succeeds but Queue publication fails
- **THEN** telemetry records the publication failure with the shared correlation identifier and does not report successful publication

#### Scenario: Linear API call fails

- **WHEN** the Linear API returns an HTTP or GraphQL failure
- **THEN** telemetry records a sanitized failure classification and the Queue message remains eligible for the configured retry behavior

#### Scenario: Retried transition is already durable

- **WHEN** a Queue retry encounters a workflow transition already present in D1
- **THEN** telemetry reports a replay or duplicate outcome rather than a second successful state change

### Requirement: Exclude secrets and signed request content

Telemetry MUST NOT include webhook signing secrets, API tokens, authorization headers, the raw signed request body, or unapproved provider payload fields.

#### Scenario: Telemetry attributes are inspected

- **WHEN** deterministic redaction tests inspect every emitted event from valid and failing paths
- **THEN** forbidden secret values, raw bodies, and authorization data are absent from event names, attributes, and error text

#### Scenario: Provider error contains sensitive text

- **WHEN** an external dependency returns an error containing request or credential material
- **THEN** telemetry emits an allowlisted error classification rather than the unfiltered provider response

### Requirement: Prove queryability with a provider-originated run

Completion evidence SHALL include a real Linear event received by the deployed Worker and a query that reconstructs its ingress, asynchronous processing, durable transitions, and outbound call using the shared correlation identifier.

#### Scenario: Reviewer follows one live delivery

- **WHEN** a test issue is transitioned in Linear after the instrumented Workers are deployed
- **THEN** executable evidence shows a fresh relevant D1 delivery and queryable telemetry for ingress, Queue consumption, every expected transition, and the Linear call

#### Scenario: Only synthetic evidence exists

- **WHEN** validation consists only of locally signed requests, unit tests, or Wrangler dry runs
- **THEN** the change remains incomplete and is labeled synthetic rather than provider-originated proof

