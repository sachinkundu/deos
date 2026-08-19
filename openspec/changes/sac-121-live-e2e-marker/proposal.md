## Why

SAC-122 needs a deliberately tiny, deterministic repository change that can prove the reconciled SAC-121 workflow lifecycle without deploying or releasing anything.

## What Changes

- Add one canary marker file with exact, specified bytes.
- Add a deterministic Node test that verifies the marker bytes exactly.
- Keep the change free of deployment and release behavior.
- At the terminal archive step, sync this delta specification to the main OpenSpec specifications and move the change under `openspec/changes/archive/`.

## Capabilities

### New Capabilities

- `sac-121-live-e2e-marker`: Defines the deterministic marker and verification contract for the SAC-121 PR #46 live workflow canary.

### Modified Capabilities

None.

## Impact

This change is limited to `canary/sac-121-pr46-e2e.txt`, a deterministic Node test, and the corresponding OpenSpec artifacts. It does not alter runtime APIs, dependencies, deployments, or releases.

Non-goals include exercising production behavior from the marker itself, adding credentials, and changing the workflow implementation.
