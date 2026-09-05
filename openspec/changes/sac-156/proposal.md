## Why

DEOS can finish an approved run while its Linear issue stays in `Merging`. The work then looks active, so a person must check the run and close the issue by hand.

## What Changes

- After the human merge choice, check that the saved pull request has the expected base and head, meets merge rules, was merged to `main`, and put the approved plan files there. Then use a trusted final step to move the issue to `Done`.
- Give this step a stable key based on the run and last node. Save each call result and check Linear after each call. A retry will reuse the same step and accept an issue that is already in `Done`.
- Keep a run open when the final move fails or cannot be proved. Save the fault and a recovery link. Let staff retry only the final step without a new review, merge, or agent run.
- Do not let an agent result start this move. The Workflow still owns each Linear state change. It will compare the current state with the saved source state, keep a newer state, and save a clash for staff to fix.

### Non-goals

- Keep the human review and merge choice as they are. The final move can run only after both choices pass.
- Do not mark a run as done when its work failed or was not approved.
- Do not repeat work that was complete before the final move failed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `simplified-planning-workflow`: Move the issue to `Done` only after the approved plan is merged and checked.
- `workflow-state`: Make the final Linear move safe to retry, clear to staff, and easy to recover.

## Impact

The change affects the saved workflow graph, its final Linear action, and the run records used for retry and support. It also needs tests for success, replay, an unclear reply, a hard fault, and a state clash.
