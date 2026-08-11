## Purpose

Convert accepted Linear events into durable workflow commands while keeping event receipt separate from workflow execution.

## ADDED Requirements

### Requirement: Dispatch accepted events

The dispatcher SHALL consume normalized events, load the applicable project policy, and create an auditable workflow command or transition.

#### Scenario: Accepted event

- **WHEN** the dispatcher receives a new normalized event for a configured project
- **THEN** it creates a durable workflow command linked to the delivery

#### Scenario: Unknown project

- **WHEN** the event cannot be mapped to a configured project
- **THEN** it records the failure and performs no agent action

