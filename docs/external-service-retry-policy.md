# External-service failure policy

Owner decision, 18 September 2026: temporary failures of external services are
expected. Retry them safely before stopping the workflow or asking the owner to
intervene. A provider outage must not discard completed implementation work.

## Required behavior at every boundary

1. Preserve the original error, stack/cause, service, operation, attempt identity
   and timestamps. Keep recovered failures in the failure log too.
2. Retry temporary failures with a finite attempt/time budget, increasing delay
   and jitter. Honor a trusted provider retry time. Use one budget at the owning
   operation boundary; avoid multiplying nested retry loops.
3. Keep the saved implementation, approved inputs, review feedback and evidence.
   Keep the live environment and exact session when they are healthy. Restart
   from the latest verified checkpoint if the process/environment was lost.
4. For a write with an uncertain result, reconcile the existing operation before
   sending it again. Use stable operation IDs and readback. Never blindly replay
   an uncertain browser click; reconcile or reset the complete saved scenario.
5. When retries are exhausted, save and verify recoverable state and diagnostics
   before destroying the runtime. Then report a clear error, retry history and
   recovery point to the owner, and stop. A failed checkpoint/cleanup must retain
   both its own error and the original cause, with an explicit recovery hold.
6. Recoverable external-service errors stay quiet for the owner. Notify after
   exhaustion or when action is needed. Invalid credentials, permission errors,
   invalid requests and implementation/test defects need classification rather
   than repeated identical calls. Do not change models, spend reset credits,
   bypass gates or weaken proof to turn a failure into success.

## First fix: author model capacity

`container/provider-retry.mjs` gives Codex author turns three additional attempts
after an explicitly recognized transient terminal provider failure. Delays are
15, 45 and 120 seconds with up to 20% jitter, bounded by the existing attempt
deadline. The budget is shared across completion-repair turns. The model is
unchanged. Once a thread exists, retry uses that exact session and the existing
sandbox, workspace and runtime. Before a thread exists, the saved initial prompt
can be submitted again. The resume instruction requires receipt reconciliation
before any action is repeated.

The first implementation recognizes the observed model-capacity response,
temporary provider unavailability and terminal stream disconnection. Arbitrary
tool output cannot request a provider retry. It does not yet classify every
provider error or parse provider-specific retry headers from the Codex CLI.

On exhaustion, normal failure collection captures the implementation recovery
patch and diagnostics before sandbox cleanup. The original error and retry
journal are included in the checksum-verified artifact manifest on both recovery
and failure. No user failure notification is sent during these internal retries.
No remote deployment has occurred for this change.

## Coverage audit and remaining work

This is a required platform policy, **not a claim of universal implementation**.

| Boundary | Current mechanism inspected | Remaining work |
| --- | --- | --- |
| Codex author turns | New bounded same-session retries; failure recovery patch | Live canary verification; structured rate-limit/retry-time handling |
| Claude review runners | Separate invocation journal, failure classification and trusted retry-not-before | Add bounded safe continuation using the reviewer journal; do not replay the whole reviewer as a Codex session |
| Workflow D1/R2 and system steps | Thrown step errors use Cloudflare Workflow retries | Audit paths that return failure outcomes instead of throwing; prove exhaustion retains the original error and state |
| GitHub and Linear writes | Existing markers, operation receipts and reconciliation | Audit every terminal response/transport failure and provider retry-after handling; keep writes idempotent |
| Temporary Worker/D1/R2 provisioning | Resource ownership and reconciliation | Automate transient readiness recovery currently performed by the agent; verify deletion retries |
| Sandbox checkout | Existing capped checkout backoff | Audit startup/process transport errors separately from model errors |
| Browser commands | Saved scenario and receipt rules | No individual action replay after ambiguous transport; verify safe scenario recovery |
| Completion notification | Two attempts and heartbeat reconciliation | Preserve delivery errors and make fallback outcome observable; do not invalidate a completed implementation because an optional wake hint failed |

Cloudflare's step retry contract is documented in
[Sleeping and retrying](https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/).
The author process capacity failure was a returned failed attempt, so step retries
alone did not repair it. A generic retry around all fetch calls would not safely
cover these different boundaries.

## Validation

- 630 tests passed, 1 existing skip; TypeScript checks passed.
- A disposable Linux container ran the actual changed supervisor with a fake
  Codex executable. The first turn saved a file and emitted the observed capacity
  failure. The second invocation resumed the exact session/model, found the file,
  and completed. Both transcript turns, the original error, retry journal and
  saved-work patch survived. The delay was 16,841ms.
- This is local fault-injection proof, not a real provider outage/recovery claim.
  `scripts/prove-provider-retry.mjs` is the executable fixture.
- Active SAC-246 attempt `01a0b3b2-fdfc-762b-9cf2-eea18365d827` was running when
  preparation finished. The deployed runtime was left untouched.
