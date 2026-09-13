## ADDED Requirements

### Requirement: Freeze one sandbox tier for each new run

For each accepted `Todo` start event, the dispatcher SHALL pick one sandbox tier before it creates the run. It SHALL pick Basic when the event-time label facts prove that the issue had the exact `slow-ok` label. It SHALL pick Standard-2 in all other cases. This includes events with no such label and events whose label facts are not available.

The dispatcher SHALL save the tier on the run. It MUST NOT read the issue's current labels to make this choice. A retry or replay SHALL use the saved tier. A later label change MUST NOT change the tier of a run that has started.

#### Scenario: Start event has no slow label

- **WHEN** an accepted `Todo` start event proves that the issue did not have the exact `slow-ok` label.
- **THEN** the dispatcher saves Standard-2 as the run's sandbox tier.

#### Scenario: Start event has the slow label

- **WHEN** an accepted `Todo` start event proves that the issue had the exact `slow-ok` label.
- **THEN** the dispatcher saves Basic as the run's sandbox tier.

#### Scenario: Label facts are not available

- **WHEN** an accepted `Todo` start event has no usable provider-backed label facts.
- **THEN** the dispatcher saves Standard-2 as the run's sandbox tier.

#### Scenario: Labels change before queue work

- **WHEN** the current issue labels change before the Queue handles the accepted start event.
- **THEN** the dispatcher uses the event-time label facts and does not read the new label state.

#### Scenario: Labels change after run setup

- **WHEN** the issue gains or loses `slow-ok` after its run starts.
- **THEN** the run keeps its saved tier and no work in flight is resized.

#### Scenario: Start event is replayed

- **WHEN** Queue work for a run is retried after its tier was saved.
- **THEN** the dispatcher reuses that tier and does not pick a new one.
