## MODIFIED Requirements

### Requirement: Dispatch accepted events

The asynchronous Queue consumer, which is separate from HTTP ingress, SHALL load the applicable project policy and select the workflow definition for each accepted start event before allocating a run. For an accepted `Todo` transition, it SHALL select the enabled simplified planning definition only when the immutable event-time label-selection evidence carried by the application event establishes that the issue had the exact `simple-workflow` Linear label; otherwise it SHALL select the existing full definition as the default. It MUST NOT read the issue's current labels to make that selection. Before creating a Workflow instance, it SHALL derive a stable instance identity from the durable issue-run identity. It SHALL freeze the selected definition name, version, digest, and selection evidence on the run, establish an auditable mapping from the issue run to that one Workflow instance, and SHALL acknowledge the Queue message only after both the instance and mapping are confirmed. For a selected simplified run, Workflow dispatch SHALL begin at its trusted Linear claim action; planning-agent dispatch MUST wait for confirmed delegation and the `In Progress` read-back.

#### Scenario: Accepted event

- **WHEN** the dispatcher receives a new application event for a configured project and issue run
- **THEN** it finds or creates the Workflow instance at the stable instance identity, links it to the delivery, issue, selected definition, and workflow correlation identifier, and records the mapping

#### Scenario: Labeled Todo selects the simplified definition

- **WHEN** an accepted `Todo` transition carries immutable event-time evidence of the exact `simple-workflow` label and the simplified selector is enabled for the configured project and repository
- **THEN** the dispatcher allocates the run with the simplified definition and freezes its version, digest, label-selection evidence, and source delivery

#### Scenario: Todo without the label selects the full definition

- **WHEN** an accepted `Todo` transition carries immutable event-time evidence that it did not have the exact `simple-workflow` label
- **THEN** the dispatcher allocates the run with the existing full definition and freezes its version and digest

#### Scenario: Event-time label evidence is unavailable

- **WHEN** an accepted `Todo` transition carries explicit evidence that provider-backed label membership was unavailable
- **THEN** the dispatcher selects the existing full definition, records the safe fallback, and does not read current issue labels

#### Scenario: Simplified selector is inactive

- **WHEN** an accepted `Todo` transition carries immutable event-time evidence of the `simple-workflow` label but the simplified selector is disabled
- **THEN** the dispatcher uses the existing full definition and records that the inactive selector did not change the default selection

#### Scenario: Labels change before asynchronous dispatch

- **WHEN** the issue's current labels differ from the authenticated event-time evidence before the Queue message is consumed
- **THEN** the dispatcher selects the definition from the event-time evidence and does not let the later label state change that selection

#### Scenario: Label changes after allocation

- **WHEN** an issue's labels change after its run has frozen a definition
- **THEN** the active run continues with the recorded definition and later events do not reselect or replace it

#### Scenario: First workflow path

- **WHEN** the configured start transition is received
- **THEN** the dispatcher preserves the `RECEIVED` and `QUEUED` audit history, establishes durable Workflow dispatch, and leaves subsequent agent execution and business-state transitions to that Workflow

#### Scenario: Simplified Workflow starts with trusted claim

- **WHEN** the dispatcher creates a Workflow instance with the simplified definition
- **THEN** the instance starts with its DEOS-owned Linear claim action and does not dispatch the planning agent until that action completes with durable provider evidence

#### Scenario: Unknown project

- **WHEN** the event cannot be mapped to a configured project
- **THEN** it records the failure in the D1 delivery or audit record and performs no agent action

#### Scenario: Provider-backed queue consumption

- **WHEN** a relevant provider-originated delivery is enqueued and consumed by the deployed Queue consumer
- **THEN** the consumer records durable consumption evidence and persists the Workflow instance mapping, selected definition, selection evidence, and initial business state in D1

#### Scenario: Queue delivery is retried after dispatch

- **WHEN** the Queue redelivers an event whose Workflow instance mapping is already established
- **THEN** the dispatcher reuses the recorded instance and frozen definition and does not create another Workflow instance, re-evaluate labels, or repeat an initial transition

#### Scenario: Durable dispatch cannot be established

- **WHEN** the Workflow instance or its authoritative mapping cannot be confirmed
- **THEN** the consumer does not acknowledge successful dispatch, records a safe failure category, and requires reconciliation by the stable instance identity before any retry can attempt creation

#### Scenario: Instance creation succeeds before mapping persistence fails

- **WHEN** the provider creates the stable Workflow instance but the D1 mapping write is not confirmed
- **THEN** the retry locates that instance by its stable identity, repairs or confirms the mapping, and does not create a second instance or launch a duplicate agent attempt
