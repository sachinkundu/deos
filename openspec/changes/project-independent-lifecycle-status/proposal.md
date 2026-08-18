## Why

Cloudflare Workflow status currently describes executor behavior while D1 records the DEOS business lifecycle, but operators and future consumers do not have one bounded projection that exposes both without collapsing them. SAC-92 established the distinct lifecycle meanings; SAC-103 makes those meanings observable and consumable before the SAC-101 operator interface is built.

## What Changes

- Add a read-only runtime projection that joins one D1-authoritative run to its recorded Cloudflare Workflow instance and returns both lifecycle layers under independently named fields.
- Emit structured lifecycle observations for waiting, final, executor-error, and executor-complete/business-non-success combinations using `cloudflare.execution.status`, `deos.run.status`, `deos.current_node`, `deos.transition.cause`, and a bounded `deos.expected_event` when the run is resumable.
- Derive transition causes and expected-event summaries from allowlisted service-authored and frozen-definition data; never forward raw matcher JSON, provider content, payloads, comments, or error bodies.
- Provide an authenticated, read-only issue/run projection contract for the later SAC-101 operator view without implementing that view.
- Prove the deployed projection by comparing remote D1, Cloudflare Workflow status, and Workers Observability for the same run and instance.

### Non-goals

- Building the SAC-101 operator UI or choosing its presentation design.
- Making Cloudflare Workflow status authoritative for DEOS business outcomes.
- Replacing the SAC-92 lifecycle, wait, failure, or completion-reconciliation rules.
- Exposing raw provider payloads, exact stored matcher JSON, issue content, credentials, or protected diagnostic bodies.
- Treating Cloudflare `complete` as DEOS success or as sufficient evidence to move Linear to Done.

## Capabilities

### New Capabilities

- `workflow-status-projection`: Define the authenticated read model that joins a DEOS run, its Workflow instance, current transition cause, and bounded expected-event summary without changing business state.

### Modified Capabilities

- `workflow-observability`: Require lifecycle observations to expose Cloudflare executor and DEOS business status independently for waiting and terminal paths and to remain joinable to the same run and Workflow instance.

## Impact

- Affects the TypeScript orchestration Worker, D1 read queries, Cloudflare Workflow instance-status reads, structured Workers Logs fields, authentication/configuration for the internal status route, deterministic projection tests, and deployed evidence capture.
- Depends on the SAC-92 lifecycle implementation and its D1 statuses, wait records, safe failure causes, and completion reconciler being present on the implementation base before SAC-103 runtime work begins.
- Introduces the server-side contract consumed later by SAC-101 while keeping the UI out of this change.
