## Why

DEOS workflow definition version 10 needs a deliberately tiny, repository-local canary that proves the native OpenSpec lifecycle can reach mechanical archive without deployment or provider dependencies.

## What Changes

- Add a newline-terminated repository marker at `canary/terminal-archive-v10.txt` with the exact content `terminal-mechanical-archive-v10`.
- Add one deterministic Node test that verifies the marker exists and has the exact required content.
- Keep the canary isolated from application deployment, release finalization, environment selection, rollback, external providers, and unrelated active OpenSpec changes.

## Capabilities

### New Capabilities

- `terminal-archive-canary-marker`: Defines the exact marker-file behavior used by the workflow v10 archive canary.

### Modified Capabilities

None.

## Impact

The implementation is limited to one new marker file and one focused Node test, plus this change's OpenSpec artifacts. It changes no application API, dependency, deployment, or external system.
