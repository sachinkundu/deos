## 1. Correlation and telemetry contracts

- [x] 1.1 Add the deterministic workflow correlation helper and versioned, closed telemetry envelope in Python and TypeScript, backed by a shared schema fixture.
- [x] 1.2 Add an additive D1 migration that persists delivery correlation, backfills historical deliveries, and normalizes existing workflow-run correlation identifiers.
- [x] 1.3 Add the required correlation identifier to the Queue payload and validate it against deterministic workflow identity before consumer state changes.

## 2. Instrument workflow boundaries

- [x] 2.1 Instrument relevant ingress delivery persistence and Queue publication with structured terminal outcomes, duplicate handling, and safe D1/Queue failure categories.
- [x] 2.2 Instrument each Queue attempt, durable workflow transition, and outbound Linear update with stable identifiers, attempt metadata, and exactly one terminal outcome.
- [x] 2.3 Replace raw Linear dependency errors with typed service-authored failure categories while preserving the existing Queue retry and workflow-state behavior.

## 3. Deterministic verification

- [x] 3.1 Add Python contract tests for correlation stability, required observation fields, closed values, and forbidden sensitive fields.
- [x] 3.2 Add TypeScript tests for propagation, duplicate-safe processing, retry attempt observations, transition ordering, successful Linear updates, and each safe failure category.
- [x] 3.3 Add TypeScript type checking and CI coverage using current Cloudflare Worker types, and validate both Wrangler configurations with observability enabled at full sampling.

## 4. Deployment and provider proof

- [x] 4.1 Inspect the exact Cloudflare D1, Queue, and Worker targets; apply the migration; deploy ingress before the strict consumer; and purge only the dedicated test queue if an inspected backlog requires it.
- [x] 4.2 Trigger a fresh provider-originated Linear transition and capture matching D1 state plus persisted Workers Logs query evidence under one correlation identifier.
- [x] 4.3 Record sanitized executable and visual evidence that distinguishes provider-originated proof from synthetic validation and documents the known state-first Linear retry limitation.

## 5. Repository workflow alignment

- [x] 5.1 Update the review-gated OpenSpec skill so proposal, specs, and design remain approval gates while tasks and implementation proceed internally to one final PR by default after design approval.
- [x] 5.2 Replace the stale deleted-skill references in `AGENTS.md` with the maintained repository procedure while preserving the inline demo-first requirements.
- [x] 5.3 Run the complete Python, TypeScript, lint, type, strict OpenSpec, migration, and Wrangler validation suite; inspect the full diff; and mark tasks complete only where evidence exists.
