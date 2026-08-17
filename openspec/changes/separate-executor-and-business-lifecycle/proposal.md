## Why

The SAC-98 provider canary showed that a Cloudflare Workflow can return normally as `complete` while the DEOS run is terminally `blocked`, even when the condition can be repaired and the same governed run should continue. DEOS needs an explicit lifecycle contract that keeps D1 business state authoritative, distinguishes resumable conditions from final outcomes, and prevents provider executor status from being mistaken for business success.

## What Changes

- Define separate, explicitly named Cloudflare execution and DEOS business lifecycle states.
- Distinguish final business outcomes, resumable capability or reconciliation waits, and unrecoverable executor or invariant failures.
- Require resumable conditions to persist the exact expected event and wait durably on the same Workflow instance and DEOS run.
- Require an authorized reconciliation event to resume the same run idempotently without duplicating provider effects.
- Require unrecoverable executor or invariant failures to surface as Cloudflare `errored` and DEOS `failed` after bounded retries rather than as a successful Workflow return.
- Require final and waiting telemetry and status projections to expose both lifecycle layers without collapsing them.
- Require provider-originated proof of both a waiting/resumption path and a final path.
- Treat SAC-101 as the operator presentation of this contract; this change owns the runtime meaning and durable state.

### Non-goals

- Building the SAC-101 issue-centred operator interface.
- Making the Cloudflare-native Workflow graph authoritative for DEOS business state.
- Implementing every currently unsupported system action as part of the lifecycle correction.
- Replacing D1 with Cloudflare Workflow internal state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-state`: Define final, resumable, and failed DEOS outcomes and their mapping to Cloudflare execution behavior.
- `workflow-dispatch`: Route authorized reconciliation events to the same waiting run without allocating a replacement instance.
- `workflow-observability`: Project Cloudflare execution status and DEOS business status independently in telemetry and operator-facing status data.

## Impact

- Affects the versioned workflow definition, evaluator and Workflow orchestration contract, D1 run and transition records, event inbox handling, status projections, and bounded telemetry.
- Requires a D1 migration for resumable status, expected-event identity, and independent executor-status observations while preserving legacy run history.
- Requires deterministic lifecycle and replay coverage plus deployed provider-originated Linear and Cloudflare Workflow evidence.
- Tracked by Linear SAC-92 and derived from the SAC-98 provider canary; the shipped predecessor is archived as `2026-08-17-run-codex-in-cloudflare-sandbox`.
