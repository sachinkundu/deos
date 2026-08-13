## Purpose

Store workflow artifacts and evidence packs as immutable, verifiable R2 objects with durable D1 provenance and explicit recovery semantics for partial failure.

## ADDED Requirements

### Requirement: Preserve artifact identity and content integrity

The system SHALL assign each artifact an immutable identity derived from its workflow context, artifact kind, and SHA-256 content hash, and SHALL verify that the bytes accepted by object storage match the recorded hash.

#### Scenario: New artifact is stored

- **WHEN** a sanitized artifact is persisted for a workflow run
- **THEN** its object identity, byte size, content type, and SHA-256 hash are returned and recorded without allowing later bytes to silently replace that identity

#### Scenario: Identical artifact is replayed

- **WHEN** the same workflow context, kind, and bytes are submitted again
- **THEN** the operation succeeds idempotently and refers to the existing immutable artifact

#### Scenario: Conflicting bytes target an existing identity

- **WHEN** bytes with a different SHA-256 hash are submitted for an identity already recorded
- **THEN** the system rejects the conflict, preserves the existing object, and records an auditable failure

### Requirement: Record complete durable provenance

The system SHALL persist provenance containing the workflow run, Linear issue, source delivery, correlation identifier, capability, artifact kind, content type, producer and producer version, creation time, object key, byte size, and SHA-256 hash.

#### Scenario: Reviewer resolves an artifact from a workflow run

- **WHEN** a reviewer queries D1 provenance for a workflow run
- **THEN** the record identifies the exact R2 object and all required source and producer fields needed to verify its origin

#### Scenario: Artifact belongs to no durable run

- **WHEN** an artifact request does not reference an existing workflow run
- **THEN** the system rejects it without marking provenance complete

### Requirement: Make cross-service partial failure recoverable

The system SHALL represent artifact persistence as an explicit pending, complete, or failed operation because R2 and D1 do not share one atomic transaction. It SHALL mark provenance complete only after the immutable object is confirmed and the corresponding D1 record is durable.

#### Scenario: R2 write fails before object confirmation

- **WHEN** object storage rejects or times out during a write
- **THEN** D1 records a retryable failure or retains pending state and does not report complete provenance

#### Scenario: D1 completion fails after R2 succeeds

- **WHEN** the object is confirmed in R2 but the D1 completion write fails
- **THEN** a retry can reconcile the object by immutable key and hash without uploading conflicting bytes

#### Scenario: Reconciliation finds an orphaned object

- **WHEN** recovery finds a valid immutable R2 object with pending D1 provenance
- **THEN** it verifies the object metadata and hash before completing the existing provenance operation

### Requirement: Sanitize stored artifacts and metadata

The system MUST apply an allowlist-based evidence policy before upload and MUST NOT store webhook secrets, API tokens, authorization headers, browser profiles, production credentials, or unapproved raw provider payloads in object bytes or metadata.

#### Scenario: Evidence contains forbidden data

- **WHEN** sanitization detects forbidden credential or provider fields
- **THEN** the artifact write is rejected and the forbidden bytes are not sent to R2

#### Scenario: Safe evidence pack is accepted

- **WHEN** an evidence pack contains only approved command output, durable identifiers, hashes, timestamps, and sanitized screenshots or references
- **THEN** the system stores it with the applicable policy version in provenance

### Requirement: Provide deployed verification without production access

Completion evidence SHALL use test resources to prove that one safe workflow artifact exists in R2 and has a matching D1 provenance record whose object identity, size, and hash can be verified read-only.

#### Scenario: Live test artifact is verified

- **WHEN** a safe test workflow stores an artifact in the deployed environment
- **THEN** read-only Cloudflare API or Wrangler evidence confirms the R2 metadata and matching D1 provenance without printing credentials or object contents that are not approved for review

#### Scenario: Only fake storage is exercised

- **WHEN** deterministic tests pass but no deployed R2 object and D1 provenance pair is verified
- **THEN** the change remains incomplete and the evidence is labeled synthetic

