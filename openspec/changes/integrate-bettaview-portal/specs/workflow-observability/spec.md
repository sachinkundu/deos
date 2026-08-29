## ADDED Requirements

### Requirement: Resolve a workflow from its governed pull request

The system SHALL resolve one workflow run from a configured repository and pull-request number by using durable governed-work records. It MUST NOT infer workflow identity from issue titles, pull-request comments, or storage scans.

#### Scenario: Governed pull request is known

- **WHEN** an allowed reader requests process data for a recorded repository and pull-request number
- **THEN** the system returns the matching run identity, issue identity, recorded head, and planning pull-request URL

#### Scenario: Pull request is not governed

- **WHEN** no durable governed-work record matches the repository and pull-request number
- **THEN** the system returns a not-found result and does not select another run heuristically

### Requirement: Expose a safe complete review story

The system SHALL provide an ordered read model for all retained trace-review phases, attempts, candidates, head bindings, author dispositions, manifests, provider operations, workflow visits, and cleanup outcomes for one governed run. Artifact content SHALL be allowlisted, selected through a complete manifest, read from its recorded object key, and verified against its recorded SHA-256 before release.

#### Scenario: Story contains failed and accepted review attempts

- **WHEN** a governed run has both failed and accepted review work
- **THEN** the read model keeps each attempt in order with its real outcome and exposes only its safe verified artifacts

#### Scenario: Stored object fails verification

- **WHEN** an allowlisted artifact is absent or its bytes do not match the durable hash
- **THEN** the system withholds that artifact, reports it unavailable, and does not substitute content from another attempt
