## Why

The initial architecture calls for replacing the deployed Python HTTP adapter only after its proven Linear contract can be preserved and re-demonstrated. SAC-78 makes that migration reviewable as a runtime-boundary change, while retaining readable Python domain code unless a concrete runtime or tooling constraint justifies moving it.

## What Changes

- Define a behavior-parity contract for valid, invalid, stale, irrelevant, duplicate, and retried Linear deliveries.
- Replace the Cloudflare HTTP ingress adapter with TypeScript while preserving exact raw-body verification, millisecond timestamps, `Linear-Delivery` idempotency, ACL output, D1/Queue schemas, correlation, and HTTP response semantics.
- Define a staged deployment, rollback, provider-originated verification, and post-proof cleanup sequence.
- Require TypeScript tests and full type checks while retaining relevant Python domain tests until the adapter cutover is proven.
- Remove the obsolete Python HTTP adapter only after a real Linear transition produces fresh durable Queue/D1 evidence through the TypeScript Worker.

## Non-goals

- Changing Linear filters, application-event fields, workflow state semantics, or the `Human Approval` gate.
- Replacing the existing TypeScript Queue consumer.
- Migrating unrelated Python domain code without a demonstrated runtime or tooling need.
- Treating direct signed POSTs as provider-originated proof.

## Capabilities

### New Capabilities

- `ingress-runtime-migration`: Preserve the deployed Linear ingress contract through a reversible Python-to-TypeScript Worker cutover and provider-originated verification.

### Modified Capabilities

None.

## Impact

- Linear issue: [SAC-78](https://linear.app/sachinkundu/issue/SAC-78/migrate-the-http-ingress-worker-from-python-to-typescript).
- Expected implementation areas after approval: TypeScript ingress entrypoint and bindings, contract/parity tests, Wrangler configuration, deployment and rollback documentation, CI/type-check gates, and eventual Python adapter cleanup.
- No destructive D1 migration or Queue contract break is authorized.
