## Purpose

Associate OpenSpec planning documents and deterministic evidence with workflow runs so each automated action has durable provenance.

## ADDED Requirements

### Requirement: Associate artifacts with runs

The system SHALL store or reference proposals, specifications, designs, tasks, and evidence packs with the workflow run that produced or consumed them.

#### Scenario: Artifact produced

- **WHEN** a workflow step produces an OpenSpec artifact
- **THEN** the artifact is durably stored with its run and capability association

#### Scenario: Deterministic evidence

- **WHEN** a test or verification step completes
- **THEN** its result and relevant inputs are retained as evidence for the run

