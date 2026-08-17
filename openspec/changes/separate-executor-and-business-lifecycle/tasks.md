## 1. Durable Lifecycle State

- [x] 1.1 Add a tested copy-and-swap D1 migration that preserves legacy runs, expands authoritative run statuses, keeps resumable runs unique, and creates durable wait and reconciliation records with their required constraints and indexes.
- [x] 1.2 Extend the D1 orchestration store with guarded APIs for persisting, loading, consuming, canceling, and auditing waits while preserving exact run, node, delivery, and matcher identities.
- [x] 1.3 Add deterministic migration and store coverage for legacy-row preservation, foreign keys, active-run uniqueness, duplicate wait consumption, and resume/cancellation races.

## 2. Versioned Workflow Contract

- [x] 2.1 Extend version 4 workflow definitions with typed final, wait, and failure nodes plus sanitized resume and cancellation event descriptors while preserving immutable version 3 restore behavior.
- [x] 2.2 Reject ambiguous version 4 blocked terminals, incomplete waits, unsafe matchers, missing lifecycle edges, and failure nodes without bounded service-authored causes.
- [x] 2.3 Publish the reviewed version 4 canary definition for the recoverable `openspec.create_tasks` path and update authoring documentation for the typed lifecycle contract.
- [x] 2.4 Add definition and evaluator tests for version compatibility, matcher authorization, explicit blocked classification, exact system-action receipts, and every typed control action.

## 3. Same-Instance Runtime Semantics

- [x] 3.1 Make final nodes durably commit their final DEOS status before normal Workflow return and make failure nodes durably commit a safe failed outcome before throwing a non-retryable executor error.
- [x] 3.2 Implement durable capability and reconciliation waits that persist both exact matchers before `waitForEvent`, then resume or cancel only along the frozen definition edges on the same run and Workflow instance.
- [x] 3.3 Audit unexpected or unauthorized events without changing the wait, and make duplicate deliveries and repeated wait execution idempotent without repeating provider effects.
- [x] 3.4 Add deterministic orchestrator coverage for waiting, authorized resumption, authorized cancellation, unexpected events, racing/duplicate deliveries, final return, failure throw, and interrupted wait entry.

## 4. Dispatch And Completion Reconciliation

- [x] 4.1 Treat both resumable DEOS statuses as active mappings so later accepted Linear events are inboxed and sent to the recorded Workflow instance without allocating a replacement run or attempt.
- [x] 4.2 Add a guarded completion reconciler that compares Cloudflare instance status with D1, records `premature_workflow_completion` only from the inspected non-final state, and audits comparison conflicts without overwriting newer business state.
- [x] 4.3 Create or reuse one stable Linear operator work item for each reconciled run and safe failure cause without transitioning the issue to Done.
- [x] 4.4 Run completion reconciliation from the scheduled Worker alongside existing cleanup and add deterministic coverage for idempotent notices, repeated reconciliation, D1 races, and final/waiting/errored executor states.

## 5. Validation And Operational Documentation

- [x] 5.1 Update the as-built architecture and deployment/runbook documentation with separate executor/business semantics, migration safeguards, rollback, and read-only D1 evidence queries.
- [x] 5.2 Run strict OpenSpec validation, TypeScript and Python tests, type/binding checks, migration rehearsal and invariant queries, linting, and Wrangler dry-run validation with trial dispatch disabled.

## 6. Provider-Originated Proof

- [x] 6.1 Back up and baseline remote D1 with dispatch disabled, apply the migration, deploy version 4 support, and verify the registered definition digest before enabling only the test-project canary.
- [ ] 6.2 Use real Linear transitions to prove a resumable missing-capability wait and same-run resumption, a separate same-run cancellation, and a normal final outcome with correlated Cloudflare and D1 evidence.
- [ ] 6.3 Prove an executor-error path and idempotent premature-completion reconciliation with the stable operator-visible Linear work item, and capture sanitized Showboat plus visual evidence without exposing credentials or raw provider payloads.
- [ ] 6.4 Disable trial dispatch after proof, verify final remote invariants and cleanup, and package the completed checklist and evidence according to the approved delivery path.
