# Linear Event Ingress Specification

## Purpose

Receive Linear webhook events safely and turn relevant, authenticated deliveries into durable asynchronous work.

## Requirements

### Requirement: Authenticate and classify deliveries

The ingress boundary SHALL validate the raw request, reject invalid or stale signatures, and use an anti-corruption layer (ACL) to classify accepted events as relevant, irrelevant, or duplicate. For an accepted issue event that can start a workflow, the ACL SHALL derive immutable label-selection evidence from the authenticated Linear payload and include that evidence in the normalized application event before asynchronous dispatch. Workflow selection MUST NOT depend on a later read of the issue's current labels.

#### Scenario: Invalid delivery

- **WHEN** a request has an invalid signature or timestamp
- **THEN** the boundary rejects it without enqueueing work

#### Scenario: Relevant delivery

- **WHEN** a valid event matches the configured project and transition policy
- **THEN** the boundary records the delivery and enqueues an application event containing the source delivery id, issue, project, transition, actor, occurrence time, and immutable event-time label-selection evidence

#### Scenario: Provider payload translation

- **WHEN** the ACL receives a Linear webhook payload
- **THEN** it produces the application event without exposing provider-specific fields to workflow logic while preserving normalized label identities or explicit evidence that the required label data was unavailable

#### Scenario: Provider payload lacks usable label evidence

- **WHEN** an otherwise valid start event does not contain usable provider-backed label-selection evidence
- **THEN** the boundary records and enqueues explicit unavailable evidence so downstream selection fails safely to the existing full workflow instead of reading current labels

### Requirement: Acknowledge safely

The ingress boundary SHALL acknowledge accepted, irrelevant, and duplicate deliveries without executing workflow actions synchronously.

#### Scenario: Duplicate delivery

- **WHEN** a valid delivery identifier has already been recorded
- **THEN** the boundary returns a successful duplicate response and does not enqueue a second event
