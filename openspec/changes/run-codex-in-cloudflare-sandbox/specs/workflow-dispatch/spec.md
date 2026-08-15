## MODIFIED Requirements

### Requirement: Dispatch accepted events

The asynchronous Queue consumer, which is separate from HTTP ingress, SHALL load the applicable project policy and dispatch each accepted application event. Before creating a Workflow instance, it SHALL derive a stable instance identity from the durable issue-run identity. It SHALL establish an auditable mapping from the issue run to that one Workflow instance and SHALL acknowledge the Queue message only after both the instance and mapping are confirmed.

#### Scenario: Accepted event

- **WHEN** the dispatcher receives a new application event for a configured project and issue run
- **THEN** it finds or creates the Workflow instance at the stable instance identity, links it to the delivery, issue, and workflow correlation identifier, and records the mapping

#### Scenario: First workflow path

- **WHEN** the configured start transition is received
- **THEN** the dispatcher preserves the `RECEIVED` and `QUEUED` audit history, establishes durable Workflow dispatch, and leaves subsequent agent execution and business-state transitions to that Workflow

#### Scenario: Unknown project

- **WHEN** the event cannot be mapped to a configured project
- **THEN** it records the failure in the D1 delivery or audit record and performs no agent action

#### Scenario: Provider-backed queue consumption

- **WHEN** a relevant provider-originated delivery is enqueued and consumed by the deployed Queue consumer
- **THEN** the consumer records durable consumption evidence and persists the Workflow instance mapping and initial business state in D1

#### Scenario: Queue delivery is retried after dispatch

- **WHEN** the Queue redelivers an event whose Workflow instance mapping is already established
- **THEN** the dispatcher reuses the recorded instance and does not create another Workflow instance or repeat an initial transition

#### Scenario: Durable dispatch cannot be established

- **WHEN** the Workflow instance or its authoritative mapping cannot be confirmed
- **THEN** the consumer does not acknowledge successful dispatch, records a safe failure category, and requires reconciliation by the stable instance identity before any retry can attempt creation

#### Scenario: Instance creation succeeds before mapping persistence fails

- **WHEN** the provider creates the stable Workflow instance but the D1 mapping write is not confirmed
- **THEN** the retry locates that instance by its stable identity, repairs or confirms the mapping, and does not create a second instance or launch a duplicate agent attempt

## ADDED Requirements

### Requirement: Route later Linear events to the mapped Workflow instance

The dispatcher SHALL route later accepted Linear events for an active issue run to its recorded Workflow instance and SHALL preserve the provider delivery identifier, event type, issue and project identifiers, provider timestamp, actor identity, and actor type needed for a state-machine decision. A later event MUST NOT create a replacement instance merely because the existing Workflow is waiting.

#### Scenario: Active Workflow receives a later event

- **WHEN** a new accepted Linear event belongs to an issue run with an active Workflow mapping
- **THEN** the event is durably delivered to that Workflow instance with its actor attribution and correlation identifier intact

#### Scenario: Later delivery is duplicated

- **WHEN** a later Linear delivery with an already handled delivery identifier is observed again
- **THEN** the duplicate is acknowledged and audited without sending another Workflow event or repeating a state transition

#### Scenario: Later event has no Workflow mapping

- **WHEN** an event that is not a configured start event has no active or resumable Workflow mapping
- **THEN** the system records an unmatched-event outcome and does not create a Workflow instance or mutate Linear state

#### Scenario: New run follows a terminal run

- **WHEN** project policy accepts a new start event after the prior issue run has reached a terminal state
- **THEN** the dispatcher creates a new uniquely identified Workflow instance and preserves the prior run's mapping and audit history
