## Purpose

Move the deployed Linear HTTP ingress adapter from Python to TypeScript without changing its authenticated, idempotent, asynchronous provider contract or weakening rollback safety.

## ADDED Requirements

### Requirement: Preserve the proven Linear ingress contract

The TypeScript ingress Worker SHALL preserve the existing outcomes for method handling, exact raw-body HMAC-SHA256 verification, millisecond timestamp freshness, `Linear-Delivery` idempotency, provider payload translation, event classification, and HTTP responses.

#### Scenario: Relevant delivery is accepted

- **WHEN** Linear sends a valid, fresh, relevant delivery to the TypeScript Worker
- **THEN** the exact request bytes are authenticated, one delivery is recorded, one compatible application event is enqueued, and HTTP `200` is returned

#### Scenario: Irrelevant delivery is ignored safely

- **WHEN** a valid delivery does not match the configured project and transition policy
- **THEN** it is durably classified as irrelevant, no Queue message is published, and HTTP `200` is returned

#### Scenario: Duplicate delivery is acknowledged safely

- **WHEN** a valid `Linear-Delivery` identifier already exists in D1
- **THEN** no second Queue message is published and HTTP `200` is returned with a duplicate outcome

#### Scenario: Invalid or stale delivery is rejected

- **WHEN** the signature is invalid, required signature headers are missing, or the millisecond timestamp is outside the allowed window
- **THEN** no delivery or Queue message is created and the response matches the approved invalid-delivery contract

#### Scenario: Unsupported method is used

- **WHEN** a request uses a method other than the supported webhook method
- **THEN** the Worker returns the existing method-not-allowed contract without executing ingress logic

### Requirement: Preserve durable and asynchronous compatibility

The migrated Worker SHALL preserve the application-event fields, D1 delivery schema, Queue message schema, correlation identifier, project filters, transition names, and downstream `Human Approval` behavior used by the existing Queue consumer.

#### Scenario: Existing Queue consumer receives a migrated event

- **WHEN** the TypeScript ingress Worker publishes a relevant application event
- **THEN** the unchanged Queue consumer can create or resume the workflow without schema translation or destructive data migration

#### Scenario: Existing D1 data remains available

- **WHEN** the TypeScript Worker is deployed against the existing test D1 database
- **THEN** prior delivery, workflow run, transition, and consumption records remain readable and valid

### Requirement: Provide a reversible runtime cutover

The migration SHALL retain a known-good Python Worker version and compatible bindings until the TypeScript deployment has passed provider-originated verification, and SHALL document an executable rollback.

#### Scenario: Candidate fails before promotion

- **WHEN** deterministic, dry-run, synthetic, or provider-originated candidate validation fails
- **THEN** the candidate is not promoted and the proven Python deployment remains or is restored as the active version

#### Scenario: Failure occurs after promotion

- **WHEN** the promoted TypeScript Worker violates the ingress contract
- **THEN** the operator can roll back to the recorded Python version without reversing a destructive schema or binding change

### Requirement: Gate Python adapter removal on live proof

The obsolete Python HTTP adapter and its adapter-specific tests SHALL remain available until a real Linear delivery reaches the deployed TypeScript Worker and produces fresh relevant delivery plus Queue-consumption evidence.

#### Scenario: Provider-originated proof succeeds

- **WHEN** Linear emits a test issue transition to the promoted TypeScript Worker
- **THEN** executable evidence identifies the deployed version, HTTP success, fresh relevant D1 row, compatible Queue message consumption, expected workflow state, and sanitized provider configuration

#### Scenario: Only direct signed requests pass

- **WHEN** locally generated signed requests pass but Linear has not emitted a verified delivery
- **THEN** the Python adapter is not removed and the migration remains incomplete

### Requirement: Enforce migration quality gates

The migration SHALL pass the parity suite, TypeScript tests and complete type checks, linting, retained Python domain tests, Wrangler dry runs, and strict OpenSpec validation before promotion or cleanup.

#### Scenario: A quality gate fails

- **WHEN** any required parity, test, lint, type, dry-run, or OpenSpec gate fails
- **THEN** promotion and Python adapter removal are blocked

#### Scenario: Contract case lacks parity coverage

- **WHEN** an existing valid, invalid, stale, irrelevant, duplicate, retry, or method-handling outcome has no TypeScript parity case
- **THEN** the migration is not ready for provider-originated verification
