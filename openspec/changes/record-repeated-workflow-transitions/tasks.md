## 1. Durable Visit Identity

- [x] 1.1 Add an additive D1 migration that backfills run and transition visit sequences and enforces one transition per source visit
- [x] 1.2 Add deterministic visit and traversal identity helpers with focused identity tests

## 2. Atomic Transition Commit

- [x] 2.1 Extend orchestration records and transition inputs with source and target visit sequences
- [x] 2.2 Replace the split run/ledger write with one visit-guarded transactional D1 batch
- [x] 2.3 Classify exact replay, stale compare-and-set, and identity conflict from durable transition facts

## 3. Workflow and Provider Lineage

- [x] 3.1 Make Workflow step names and transition commits use the authoritative visit identity
- [x] 3.2 Scope Linear human-gate entry operations to the durable gate visit
- [x] 3.3 Emit visit and traversal identifiers in workflow-step telemetry and reserve duplicate for exact replay

## 4. Deterministic Verification

- [x] 4.1 Cover first traversal, exact replay, loop return, repeated edge traversal, stale authority, and concurrent attempts
- [x] 4.2 Cover same-visit human-gate retry and later genuine gate revisit behavior
- [x] 4.3 Validate migration backfill and uniqueness against a local D1 database
- [x] 4.4 Run TypeScript tests, type and binding checks, Python tests, Ruff, strict OpenSpec validation, and Worker dry-runs

## 5. Provider-Originated Proof

- [x] 5.1 Apply the migration and deploy the Worker with dispatch disabled, verifying the remote schema and deployed version
- [x] 5.2 Drive a bounded Linear-originated canary through two genuine traversals of the same edge
- [x] 5.3 Disable dispatch and capture read-only D1, Workers Observability, provider-state, and visual evidence in the repository and PR
