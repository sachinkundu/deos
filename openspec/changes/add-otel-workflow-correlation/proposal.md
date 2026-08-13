## Why

A single workflow crosses HTTP ingress, asynchronous Queue processing, durable state transitions, and outbound Linear calls. Without one correlation identifier across those boundaries, operators cannot reliably reconstruct what happened to a delivery, distinguish retries from new work, or locate where a failed workflow stopped.

## What Changes

- Define one stable correlation identifier that propagates from a Linear delivery through ingress, Queue publication and consumption, workflow transitions, and outbound Linear calls.
- Define an OTEL-compatible event contract, required fields, outcome semantics, and redaction rules.
- Require queryable deployed telemetry plus a fresh provider-originated Linear-to-Cloudflare proof.
- Require deterministic propagation, retry, schema, and redaction tests across the Python and TypeScript boundaries that exist before the ingress migration.

## Non-goals

- Building a custom observability UI.
- Selecting or operating a third-party telemetry SaaS.
- Changing workflow state semantics or the `Human Approval` gate.
- Treating synthetic requests, unit tests, or dry runs as provider-originated proof.

## Capabilities

### New Capabilities

- `workflow-observability`: Correlate and safely query one workflow across provider ingress, asynchronous dispatch, durable transitions, and external calls.

### Modified Capabilities

None.

## Impact

- Linear issue: [SAC-80](https://linear.app/sachinkundu/issue/SAC-80/add-opentelemetry-workflow-correlation).
- Expected implementation areas after approval: ingress and Queue-consumer telemetry adapters, correlation fields carried in Queue/D1 data, Cloudflare observability configuration, deterministic tests, and executable evidence documentation.
