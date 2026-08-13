## Why

Workflow runs currently have durable D1 state but no approved contract for immutable artifacts or evidence packs in R2. SAC-79 defines how stored bytes and D1 provenance remain verifiable, idempotent, sanitized, and recoverable before implementation begins.

## What Changes

- Define a canonical artifact manifest, immutable R2 identity, key layout, content hashing, and metadata contract.
- Link every artifact to its workflow run, Linear issue, source delivery, correlation identifier, capability, kind, and producing tool through D1 provenance.
- Define safe behavior for replay, byte conflicts, R2/D1 partial failure, retry, and reconciliation.
- Require evidence sanitization and explicitly forbid secrets, credentials, browser profiles, and unapproved raw provider payloads.
- Require deterministic fake-backed tests before a safe deployed R2/D1 verification through read-only Cloudflare evidence queries.

## Non-goals

- Building an artifact browsing UI.
- Defining production retention, legal-hold, or lifecycle policy.
- Executing live specialist agents.
- Storing production credentials or unsanitized provider data.

## Capabilities

### New Capabilities

- `artifact-provenance`: Store immutable workflow artifacts and evidence packs in R2 with complete, durable, and recoverable D1 provenance.

### Modified Capabilities

None.

## Impact

- Linear issue: [SAC-79](https://linear.app/sachinkundu/issue/SAC-79/add-r2-artifact-provenance-and-deterministic-evidence-capture).
- Expected implementation areas after approval: artifact domain model and storage port, R2 and D1 adapters, migrations, Queue-consumer integration, deterministic tests, deployment configuration, and executable evidence documentation.
- Uses the existing test R2 and D1 resources; no production data path is authorized.

