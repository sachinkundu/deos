## MODIFIED Requirements

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
