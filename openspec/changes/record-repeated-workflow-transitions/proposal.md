## Why

Workflow loops can traverse the same successful edge more than once, but the current transition identity collapses a later genuine traversal into the first. This lets the authoritative run node advance while the durable transition ledger omits that advancement and telemetry mislabels it as a replay duplicate.

## What Changes

- Give every genuine visit to a workflow node or traversal of an edge a durable identity that remains stable across a replay of that same logical traversal.
- Record exactly one transition-ledger entry for each genuine traversal, including later traversals of the same edge with the same outcome and cause.
- Make the authoritative run-node compare-and-set and its transition-ledger record agree atomically and surface stale or conflicting attempts without silently advancing only one representation.
- Distinguish a replay of an already-recorded traversal from a genuine later traversal in workflow-step telemetry.
- Prove loop behavior with deterministic concurrency and replay coverage, then with a provider-originated canary that traverses the same successful edge twice.

### Non-goals

- Changing workflow graph semantics, edge selection, or which nodes require human review.
- Replacing D1 as the authority for business workflow state and transition history.
- Redesigning identities for sandbox attempts, provider operations, or Linear deliveries that already have independent idempotency contracts.
- Building the issue-centred operator interface tracked separately by SAC-101.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-state`: Require a durable per-traversal identity, exactly one audit row per genuine edge traversal, replay idempotency, and atomic agreement between run state and transition history.
- `workflow-observability`: Distinguish replayed workflow steps from later genuine traversals of the same edge so operators are not shown a false duplicate outcome.

## Impact

- Affects workflow orchestration identity, the D1 orchestration run and transition write path, and the `workflow_transitions_v2` schema or associated migration strategy.
- Affects workflow-step telemetry attributes and outcomes used to reconstruct repeated graph traversal.
- Requires deterministic tests for first traversal, replay, loop return, repeated edge traversal, and concurrent or stale compare-and-set attempts.
- Requires a deployed provider-originated Linear canary with durable D1 and Workers Observability evidence.
- Tracked by Linear SAC-111; the defect was observed during the SAC-110 canary run.
