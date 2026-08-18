# Workflow Observability Specification

## Purpose

Let operators reconstruct the lifecycle and outcome of a Linear-driven workflow across asynchronous service boundaries without exposing sensitive request or credential data.


## Requirements

### Requirement: Operator can trace one workflow across service boundaries

The system SHALL associate every observable stage of a relevant Linear-driven workflow with one stable correlation identifier, including ingress, Queue consumption, Workflow dispatch and execution, sandbox lifecycle, Codex execution, durable artifact persistence, provider capability operations, and Workflow-owned Linear transitions.

#### Scenario: Operator follows a completed workflow

- **WHEN** an operator queries telemetry for a relevant Linear delivery or its workflow run
- **THEN** the result identifies one correlation identifier and shows the related ingress, asynchronous dispatch, Workflow instance, sandbox attempts, Codex outcome, artifact manifest, provider operations, durable transitions, and outbound Linear interaction

#### Scenario: Operator locates where a workflow stopped

- **WHEN** a workflow does not reach its expected terminal or human-gate state
- **THEN** telemetry associated with its correlation identifier shows the last completed stage and whether dispatch, Workflow execution, sandbox startup, authentication, agent execution, artifact persistence, provider access, state transition, or cleanup failed or remained incomplete

### Requirement: Telemetry has consistent query semantics

The system SHALL expose OTEL-compatible structured observations with a time, service, workflow stage, outcome, correlation identifier, and available resource identifiers needed to locate the related delivery, issue, project, workflow run and instance, sandbox and agent attempt, artifact manifest, and provider operation. Identifiers SHALL be sufficient to join telemetry to durable D1 audit records without requiring sensitive content in telemetry.

#### Scenario: Successful stage is reported

- **WHEN** an observed workflow stage completes successfully
- **THEN** its terminal observation reports a successful outcome with the shared correlation identifier and the stage's relevant resource identifiers

#### Scenario: Failed stage is reported without false success

- **WHEN** an observed workflow stage fails
- **THEN** its terminal observation reports a service-authored failure outcome and does not report that stage or dependent stages as successful

#### Scenario: Operator joins telemetry to durable evidence

- **WHEN** an operator follows a workflow, attempt, artifact, or provider-operation identifier from telemetry
- **THEN** the corresponding D1 audit record or durable artifact reference can be located without matching on issue titles, comments, or other provider content

### Requirement: Repeated processing remains understandable

The system SHALL keep observations for repeated processing associated with the original workflow correlation identifier while allowing an operator to distinguish Queue deliveries, Workflow step attempts, durable node visits and edge traversals, sandbox attempts, Codex runs, artifact writes, and provider capability attempts and outcomes. Workflow-step telemetry SHALL report a duplicate outcome only when the same durable traversal is replayed; a later genuine traversal of the same edge SHALL have a distinct traversal identity and SHALL be reported as its own successful outcome.

#### Scenario: Asynchronous processing is retried

- **WHEN** an existing workflow stage is processed more than once because of retry behavior
- **THEN** all attempts remain queryable under the same correlation identifier and each attempt has a distinguishable identity and outcome

#### Scenario: Previously handled delivery is observed again

- **WHEN** the system observes a provider delivery that it has already handled
- **THEN** the delivery is ignored without starting or advancing another workflow, and telemetry records only a duplicate outcome under the original correlation identifier

#### Scenario: Provider operation is reconciled after an ambiguous response

- **WHEN** the system checks whether a timed-out provider operation already succeeded
- **THEN** telemetry distinguishes the original attempt, reconciliation check, and any safe retry under the same stable operation and workflow identifiers

#### Scenario: Recorded workflow traversal is replayed

- **WHEN** durable execution repeats a workflow step for a traversal identity already recorded in D1
- **THEN** workflow-step telemetry reports that traversal as a duplicate under its existing identity and does not imply that another graph traversal occurred

#### Scenario: Workflow later repeats the same edge

- **WHEN** the workflow genuinely traverses an edge again after returning to its source node
- **THEN** workflow-step telemetry reports a successful traversal with a new traversal identity and does not classify it as a duplicate of the earlier edge traversal

### Requirement: Telemetry excludes sensitive data

Telemetry MUST NOT expose webhook signing secrets, OpenAI or provider API tokens, ChatGPT-managed authentication material, authorization headers, raw signed request bodies, raw Codex event content, repository patches, validation output, or artifact bodies. Provider-derived attributes MUST be limited to the Linear delivery, issue, and project identifiers and sanitized GitHub resource identifiers; telemetry MUST NOT include issue titles, descriptions, comments, user details, repository file contents, prompts, agent messages, or other provider payload fields. Error observations MUST use service-authored categories and SHALL include a stable opaque reference to an access-controlled diagnostic record when detailed source errors are available. The diagnostic record SHALL preserve the original error as far as possible after removing credentials and other forbidden secrets.

#### Scenario: Operator inspects workflow telemetry

- **WHEN** an operator reads observations from successful and failed workflow paths
- **THEN** event names, attributes, and error details contain none of the forbidden sensitive data

#### Scenario: External dependency fails

- **WHEN** an external dependency reports a failure
- **THEN** telemetry records a service-authored error category and protected diagnostic reference without writing the dependency's raw response into telemetry

#### Scenario: Authorized operator follows an error reference

- **WHEN** an authorized operator opens the diagnostic reference from a failed observation
- **THEN** the operator can inspect the access-controlled original or minimally redacted error needed for debugging and correlate it with the workflow stage and attempt

#### Scenario: Codex or validation emits sensitive output

- **WHEN** captured process output includes a credential, authentication cache content, prompt, source content, or provider response
- **THEN** that content is excluded from telemetry and handled only by the artifact policy appropriate to the run
