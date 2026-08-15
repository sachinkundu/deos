## MODIFIED Requirements

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

The system SHALL keep observations for repeated processing associated with the original workflow correlation identifier while allowing an operator to distinguish Queue deliveries, Workflow step attempts, sandbox attempts, Codex runs, artifact writes, and provider capability attempts and outcomes.

#### Scenario: Asynchronous processing is retried

- **WHEN** an existing workflow stage is processed more than once because of retry behavior
- **THEN** all attempts remain queryable under the same correlation identifier and each attempt has a distinguishable identity and outcome

#### Scenario: Previously handled delivery is observed again

- **WHEN** the system observes a provider delivery that it has already handled
- **THEN** the delivery is ignored without starting or advancing another workflow, and telemetry records only a duplicate outcome under the original correlation identifier

#### Scenario: Provider operation is reconciled after an ambiguous response

- **WHEN** the system checks whether a timed-out provider operation already succeeded
- **THEN** telemetry distinguishes the original attempt, reconciliation check, and any safe retry under the same stable operation and workflow identifiers

### Requirement: Telemetry excludes sensitive data

Telemetry MUST NOT expose webhook signing secrets, OpenAI or provider API tokens, ChatGPT-managed authentication material, authorization headers, raw signed request bodies, raw Codex event content, repository patches, validation output, or artifact bodies. Provider-derived attributes MUST be limited to the Linear delivery, issue, and project identifiers and sanitized GitHub resource identifiers; telemetry MUST NOT include issue titles, descriptions, comments, user details, repository file contents, prompts, agent messages, or other provider payload fields. Error details MUST use service-authored categories rather than raw dependency responses.

#### Scenario: Operator inspects workflow telemetry

- **WHEN** an operator reads observations from successful and failed workflow paths
- **THEN** event names, attributes, and error details contain none of the forbidden sensitive data

#### Scenario: External dependency fails

- **WHEN** an external dependency reports a failure
- **THEN** telemetry records a service-authored error category and does not write the dependency's raw response

#### Scenario: Codex or validation emits sensitive output

- **WHEN** captured process output includes a credential, authentication cache content, prompt, source content, or provider response
- **THEN** that content is excluded from telemetry and handled only by the artifact policy appropriate to the run

## ADDED Requirements

### Requirement: Completion evidence distinguishes synthetic and provider-originated proof

The implementation evidence SHALL label synthetic ingress separately from provider-originated end-to-end proof. Completion of the integration SHALL require a real Linear event to reach the deployed Worker, Queue, Workflow, Sandbox, Codex run, durable artifact store, required GitHub and non-transition Linear effects, D1 audit trail, and designated `Human Approval` state under one correlation identifier. The evidence package SHALL include sanitized visual proof of the provider configuration and resulting provider state.

#### Scenario: Synthetic ingress is exercised

- **WHEN** a locally generated signed request reaches the deployed Worker
- **THEN** the evidence identifies it as synthetic ingress proof and does not claim that Linear emitted the event

#### Scenario: Provider-originated path completes

- **WHEN** Linear emits a fresh event from the controlled test issue and the deployed workflow reaches `Human Approval`
- **THEN** remote evidence shows the correlated provider delivery, Queue consumption, Workflow instance, sandbox and Codex attempt, artifact manifest, provider receipts, D1 transitions, and final Linear state

#### Scenario: Reviewer inspects visual proof

- **WHEN** the implementation is presented for review
- **THEN** sanitized screenshots show the enabled Linear configuration and the triggering or resulting provider state without exposing secrets
