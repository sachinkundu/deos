## Why

SAC-122 needs a minimal, deterministic canary to exercise the reconciled SAC-121 PR #46 workflow lifecycle while keeping the repository change auditable and free of deployment or release effects.

## What Changes

- Add a marker file at `canary/sac-121-pr46-e2e.txt` with the exact bytes `sac-121-pr46-live-e2e\n`.
- Add a deterministic Node test that compares the marker's raw bytes and fails on any difference.
- Require the terminal archive step to sync the delta specification into the main OpenSpec specifications before archiving the change.
- Publish exactly one final GitHub work product per agent attempt.
- Do not deploy or release anything.

## Capabilities

### New Capabilities

- `sac-121-live-e2e-marker`: Defines the exact canary marker, its deterministic raw-byte verification, terminal OpenSpec sync and archive behavior, the single-work-product constraint, and the prohibition on deployment or release.

### Modified Capabilities

None.

## Impact

The change affects only the new canary marker, its Node verification test, and the OpenSpec lifecycle artifacts for this bounded canary. It adds no runtime API or dependency and performs no deployment or release.

## Non-goals

- Changing the deployed SAC-121 implementation or any existing workflow capability.
- Deploying, releasing, or otherwise mutating a runtime environment.
- Transitioning the Linear issue or creating downstream OpenSpec artifacts in this proposal step.
