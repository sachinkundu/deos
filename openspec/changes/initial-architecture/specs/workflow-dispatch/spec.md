## Purpose

Convert accepted Linear events into durable workflow commands while keeping event receipt separate from workflow execution and making the first workflow definition explicit.

## ADDED Requirements

### Requirement: Dispatch accepted events

The dispatcher SHALL consume application events, load the applicable project policy, and create an auditable workflow command or transition.

#### Scenario: Accepted event

- **WHEN** the dispatcher receives a new application event for a configured project
- **THEN** it creates a durable workflow command linked to the delivery

#### Scenario: First workflow path

- **WHEN** the configured start transition is received
- **THEN** the dispatcher advances the run through `RECEIVED`, `QUEUED`, and `REQUIREMENTS_IN_PROGRESS` before entering `AWAITING_HUMAN_APPROVAL`

#### Scenario: Unknown project

- **WHEN** the event cannot be mapped to a configured project
- **THEN** it records the failure in the D1 delivery/audit record and performs no agent action
