## Purpose

Receive Linear webhook events safely and turn relevant, authenticated deliveries into durable asynchronous work.

## ADDED Requirements

### Requirement: Authenticate and classify deliveries

The ingress boundary SHALL validate the raw request, reject invalid or stale signatures, and classify accepted events as relevant, irrelevant, or duplicate.

#### Scenario: Invalid delivery

- **WHEN** a request has an invalid signature or timestamp
- **THEN** the boundary rejects it without enqueueing work

#### Scenario: Relevant delivery

- **WHEN** a valid event matches the configured project and transition policy
- **THEN** the boundary records the delivery and enqueues a normalized event

### Requirement: Acknowledge safely

The ingress boundary SHALL acknowledge accepted, irrelevant, and duplicate deliveries without executing workflow actions synchronously.

#### Scenario: Duplicate delivery

- **WHEN** a valid delivery identifier has already been recorded
- **THEN** the boundary returns a successful duplicate response and does not enqueue a second event

