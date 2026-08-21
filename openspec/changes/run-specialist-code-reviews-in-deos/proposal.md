## Why

DEOS currently sends the `code_review` node to a general Codex job even though the dedicated review bot has already proven exact-head GitHub reviews, accepted diff-line comments, and history-aware rechecks. Integrating that proven reviewer into the Cloudflare workflow gives each implementation an independent, durable review before evidence verification and makes repeated review cycles useful instead of duplicative.

## What Changes

- Give each `code_review` attempt a trusted pull-request target tied to the DEOS run, implementation work product, current GitHub head, and review iteration.
- Run a pinned review-bot build directly inside a fresh Cloudflare Sandbox as the `code_review` executor, without an outer Codex agent launching the bot's own specialist reviewers and coordinator.
- Extend the trusted GitHub capability boundary to provide complete pull-request, diff, and review-history inputs; publish exact-head reviews and thread replies; read accepted objects back; and keep GitHub App credentials outside the Sandbox.
- Require freshness validation, diff-anchor validation, idempotent provider writes, matching D1 receipts, retained R2 review artifacts, and confirmed Sandbox cleanup before the review outcome can advance the workflow.
- Map `changes_requested` back to implementation and `approved` to evidence verification using the existing reviewed workflow edges.
- Prove the composed path separately with deterministic local checks, a deployed Cloudflare Sandbox run against a disposable real pull request, GitHub provider read-back, D1/R2 evidence, and visual proof.

### Non-goals

- Automatically resolving GitHub review threads.
- Adding a public review webhook or supporting arbitrary unapproved repositories.
- Changing the review bot's proven finding and recheck semantics.
- Completing the broader credentialless-gateway scope of SAC-96 outside the GitHub review operations required here.
- Redesigning the DEOS operator interface.

## Capabilities

### New Capabilities

- `specialist-code-review`: Bind a DEOS review attempt to an exact pull-request head and complete review history, run the specialist review pipeline, publish or recheck findings safely, and produce a deterministic workflow outcome with durable proof.

### Modified Capabilities

- `sandbox-agent-execution`: Allow a reviewed workflow job to select a pinned direct executor while preserving bounded execution, protected Codex authentication, liveness, artifact collection, and cleanup guarantees.
- `provider-capability-access`: Add narrowly scoped GitHub review reads and writes with exact-target authorization, freshness checks, idempotent reconciliation, provider read-back, and complete durable receipts while credentials remain outside the Sandbox.

## Impact

The change affects the DEOS workflow definition and job inputs, Sandbox image and controller, GitHub capability router and adapter, D1 provider-operation records, R2 artifact collection, telemetry, tests, and provider-proof evidence. The review bot becomes a pinned runtime dependency of the DEOS Sandbox image. The first deployed proof will also measure the Cloudflare container resources and concurrent Codex authentication behavior needed by the specialist roster.
