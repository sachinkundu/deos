## MODIFIED Requirements

### Requirement: Freeze one sandbox tier for each new run

For each accepted `Todo` start event, the dispatcher SHALL pick one sandbox tier before it creates the run. New starts under the default release policy SHALL use Basic, whether the event contains `slow-ok`, no such label, or no usable label facts. Deliveries accepted under an older release policy SHALL retain that policy's meaning.

The dispatcher SHALL save the tier on the run. It MUST NOT read the issue's current labels to make this choice. A retry or replay SHALL use the saved tier. A later label change MUST NOT change the tier of a run that has started.

#### Scenario: Start event has no slow label

- **WHEN** a new default-policy start event has no `slow-ok` label
- **THEN** the dispatcher saves Basic as the run's sandbox tier

#### Scenario: Start event has the slow label

- **WHEN** a new default-policy start event has the exact `slow-ok` label
- **THEN** the dispatcher saves Basic as the run's sandbox tier

#### Scenario: Label facts are not available

- **WHEN** a new default-policy start event has no usable provider-backed label facts
- **THEN** the dispatcher saves Basic as the run's sandbox tier

#### Scenario: Labels change before queue work

- **WHEN** the current issue labels change before the Queue handles the accepted start event
- **THEN** the dispatcher uses the saved event facts and release policy without reading the new label state

#### Scenario: Labels change after run setup

- **WHEN** the issue gains or loses `slow-ok` after its run starts
- **THEN** the run keeps its saved tier and no work in flight is resized

#### Scenario: Start event is replayed

- **WHEN** Queue work for a run is retried after its tier was saved
- **THEN** the dispatcher reuses that tier and does not pick a new one

#### Scenario: An older delivery reaches dispatch after release

- **WHEN** a saved delivery uses the old policy that selects Standard-2 without `slow-ok`
- **THEN** dispatch retains that selection and does not rewrite the delivery or run
