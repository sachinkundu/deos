## Why

The SAC-98 provider canary showed that a Cloudflare Workflow can return normally as `complete` while the DEOS run is terminally `blocked`, even when the condition can be repaired and the same governed run should continue. DEOS needs an explicit lifecycle contract that keeps D1 business state authoritative, distinguishes resumable conditions from final outcomes, and treats premature executor completion as a visible system error.

## What Changes

- Define the DEOS business lifecycle independently from its Cloudflare executor and keep D1 as the only operator-facing status authority.
- Distinguish final business outcomes, resumable capability or reconciliation waits, and unrecoverable executor or invariant failures.
- Require every resumable wait to persist both its exact authorized resume event and an exact authorized cancellation event.
- Require authorized resume or cancellation events to affect the same run idempotently without duplicating provider effects.
- Require unrecoverable executor or invariant failures to surface as Cloudflare `errored` and DEOS `failed` after bounded retries rather than as a successful Workflow return.
- Treat Cloudflare completion without a final DEOS outcome as `premature_workflow_completion`, fail the run safely, and create or update a stable operator-visible notice on the Linear issue.
- Reconcile confirmed out-of-band executor errors or termination into bounded DEOS failure causes without exposing provider status as an operator outcome; transient status-read failures preserve D1 state and retry safely.
- Require provider-originated proof of a waiting/resumption path, a cancellation path, and a final path.
- Treat SAC-101 as a D1-only presentation of the DEOS business graph; this change owns the hidden executor-to-business translation and durable state.

### Non-goals

- Building the SAC-101 issue-centred operator interface.
- Exposing Cloudflare Workflow status in an operator API or presenting it alongside the DEOS business graph.
- Making the Cloudflare-native Workflow graph authoritative for DEOS business state.
- Implementing every currently unsupported system action as part of the lifecycle correction.
- Replacing D1 with Cloudflare Workflow internal state.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-state`: Add explicit final, resumable, cancellable, and failed DEOS outcomes and map them to Cloudflare execution behavior.
- `workflow-dispatch`: Preserve resumable run identity and reconcile unexpected executor outcomes into bounded DEOS states without allocating a replacement run.

## Impact

- Affects the versioned workflow definition, evaluator and Workflow orchestration contract, D1 run and transition records, event inbox handling, executor reconciliation, and stable Linear operator notices.
- Requires a D1 migration for resumable statuses and definition-controlled resume and cancellation identities while preserving legacy run history.
- Requires deterministic lifecycle and replay coverage plus deployed provider-originated Linear and Cloudflare Workflow evidence.
- Tracked by Linear SAC-92 and derived from the SAC-98 provider canary; the shipped predecessor is archived as `2026-08-17-run-codex-in-cloudflare-sandbox`.
