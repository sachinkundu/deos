## ADDED Requirements

### Requirement: New runs use the simple workflow by default
For every accepted project start event that has no active run, the dispatcher SHALL select the current enabled `simple` workflow definition from project policy. It SHALL freeze that definition identity, version, digest, and default-policy selection evidence on the new run. Linear labels MUST NOT select or change the workflow definition. The project dispatch control SHALL be the only operator switch that admits a new run.

#### Scenario: Start event has no labels
- **WHEN** an accepted start event has no Linear labels and project dispatch is enabled
- **THEN** the dispatcher creates a run with the current simple definition and records default-policy selection

#### Scenario: Start event has the former selector label
- **WHEN** an accepted start event includes the former `simple-workflow` label
- **THEN** the dispatcher selects the same simple definition without treating the label as selection evidence

#### Scenario: Label evidence is unavailable
- **WHEN** an accepted start event has unavailable label evidence
- **THEN** the dispatcher still selects the current simple definition because labels do not control dispatch

#### Scenario: Dispatch is disabled
- **WHEN** a start event arrives while project dispatch is disabled
- **THEN** the dispatcher records the unmatched event and creates no workflow run

#### Scenario: Historical run used an older definition
- **WHEN** an operator or executor loads a run created before the default changed
- **THEN** the system restores that run's frozen definition and selection record without rewriting it to the new default
