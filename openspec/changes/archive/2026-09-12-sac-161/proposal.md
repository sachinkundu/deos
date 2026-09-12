## Why

Each portal search replaces the issue list. A person must search again to return to earlier work, and a reload restores only one issue.

## What Changes

- Save up to ten unique issue searches per person. Keep them after a page reload.
- Show the saved issues in the sidebar, with the last search first.
- Move an issue to the top when it is found again. Do not add a copy or drop an older issue.
- Let each saved issue open its workflow view from the sidebar.
- Deploy and check the feature on staging before it can reach production.

### Non-goals

- Change an issue or workflow state, or change how a run is picked.
- Save a failed search or an issue with no workflow view.

## Capabilities

### New Capabilities

- `portal-recent-issues`: Saves a private, bounded issue search list and uses it for sidebar navigation.

### Modified Capabilities

None.

## Impact

- The DEOS workflow portal sidebar and its issue search flow.
- Authenticated portal API routes and durable search history in D1.
- Portal tests for order, deduplication, limits, identity scope, reloads, and workflow opening.
- The staging check required before the normal production release.
