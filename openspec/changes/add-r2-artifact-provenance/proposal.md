## Why

deos can persist and trace workflow state, but it cannot yet prove which exact artifact bytes a run produced or recover safely when R2 and D1 writes do not complete together. This change closes the remaining initial-architecture gap with immutable, verifiable artifact provenance and sanitized evidence capture against the existing Cloudflare test resources.

## What Changes

- Define one canonical artifact manifest and provenance contract linking exact bytes to their workflow run, source Linear delivery, correlation identifier, issue, capability, artifact kind, content type, producer and version, creation time, R2 key, and SHA-256 digest.
- Store artifacts and evidence packs in R2 under immutable or content-addressed identities, with D1 records that distinguish pending, complete, conflicting, and recoverable writes.
- Make replays idempotent, reject conflicting bytes for an existing artifact identity, and make partial R2/D1 failures auditable and retryable without reporting incomplete provenance as complete.
- Sanitize evidence before persistence and prohibit secrets, authorization data, raw signed webhook bodies, unapproved provider payloads, and production credentials in object bytes, object metadata, manifests, or D1 provenance.
- Add deterministic contract tests, then trigger a fresh provider-originated Linear workflow and verify its resulting R2 object and D1 provenance record through read-only Cloudflare APIs, keeping synthetic validation distinct from provider-backed evidence.

## Capabilities

### New Capabilities

- `artifact-provenance`: Persist immutable workflow artifacts and sanitized evidence with verifiable manifests, durable provenance state, idempotent replay, conflict detection, recovery semantics, and R2/D1 linkage proof.

### Modified Capabilities

None.

## Impact

- Extends the artifact and state ports, deterministic fakes, and the production Cloudflare adapter used by the workflow path.
- Adds an R2 binding to the producing Worker as needed and a D1 migration for provenance and recovery state.
- Uses the existing `deos-sample-project-artifacts` R2 bucket and `deos-sample-project` D1 database as the provider-backed test target.
- Adds deterministic tests, provider-originated Linear-to-R2/D1 verification, and sanitized executable and visual evidence to the final implementation PR.

## Non-goals

- Artifact browsing or operator UI.
- Production retention, lifecycle, legal-hold, or deletion policy.
- Live specialist-agent execution or sandbox/workspace management.
- Persisting production credentials, browser profiles, or unsanitized Linear payloads.
- The separate TypeScript HTTP ingress migration tracked by SAC-78.
