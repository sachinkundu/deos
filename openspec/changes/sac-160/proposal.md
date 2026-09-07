## Why

A finished DEOS workflow can leave its Linear issue open. The issue should show as Done when the workflow succeeds, even if that update cannot reach Linear.

## What Changes

- After a workflow reaches its successful end state, ask Linear to move its issue to Done.
- Retry the request up to a set limit only for known transient Linear API errors.
- Keep the workflow complete if the request or its retries fail.
- Do not add a receipt, state check, repair job, or other application record for this update.

### Non-goals

- Do not move issues to Done for failed, blocked, denied, or canceled workflows.
- Do not prove that Linear applied the update or repair an issue that stays open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-state`: Add a best-effort Linear Done update after successful workflow completion.

## Impact

The workflow terminal path and the Linear client will change. Tests will cover successful requests, safe retries, and ignored failures. No new data store, migration, or operator process is needed.
