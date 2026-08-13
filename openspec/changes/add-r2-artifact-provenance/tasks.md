## 1. Define durable artifact state

- [ ] 1.1 Add additive D1 migrations for deterministic artifact operations, immutable artifact provenance, status constraints, foreign keys, and lookup/idempotency indexes.
- [ ] 1.2 Extend the provider-neutral artifact contract and deterministic fakes with operation identity, SHA-256, size, content type, provenance, and pending/complete/failed outcomes.
- [ ] 1.3 Define the allowlisted evidence policy, safe path-component rules, canonical metadata encoding, and credential-shaped rejection fixtures.

## 2. Implement immutable R2 persistence

- [ ] 2.1 Implement content-addressed key generation and conditional R2 writes with SHA-256 verification and the minimal safe custom metadata set.
- [ ] 2.2 Implement the D1-first pending operation, R2 confirmation, and transactional D1 provenance completion sequence.
- [ ] 2.3 Implement idempotent reconciliation for missing objects, confirmed objects with pending D1 state, exact replays, and hash or metadata conflicts without automatic deletion.
- [ ] 2.4 Integrate one sanitized evidence-pack write into the existing test workflow without enabling live specialist-agent execution.

## 3. Prove deterministic failure handling

- [ ] 3.1 Add tests for successful storage, exact replay, conflicting bytes, invalid workflow run, sanitization rejection, and provenance lookup.
- [ ] 3.2 Add tests for R2 failure before confirmation, D1 failure after R2 success, reconciliation completion, repeated retry, and persistent conflict.
- [ ] 3.3 Run the full relevant Python and TypeScript suites/type checks, Ruff, Wrangler dry runs, migration validation, and strict OpenSpec validation.

## 4. Capture deployed R2 and D1 evidence

- [ ] 4.1 Apply the additive migration and deploy the approved code only to the isolated test D1/R2 resources.
- [ ] 4.2 Store one safe workflow evidence pack and use read-only Cloudflare queries to verify its R2 identity, size, metadata/hash, and matching complete D1 provenance.
- [ ] 4.3 Attach executable and sanitized visual evidence to the SAC-79 implementation PR, mark `initial-architecture` task 6 complete, and request approval before starting SAC-78.

