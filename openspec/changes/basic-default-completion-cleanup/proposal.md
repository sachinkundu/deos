## Why

The SAC-171 trials did not show a clear speed gain from Standard-2. Completed reviewers also left their parent sandbox waiting for the next five-minute poll. New work should use Basic, and finished work should reach collection promptly.

## What Changes

- Use the existing Basic release policy for new starts. Keep saved tiers on old deliveries and runs.
- Have the trusted supervisor notify the workflow after it has finalized output, on success or failure.
- Treat the notification as a wake-up hint. Keep process checks, artifact checks, and cleanup ordering in the existing controller.
- Keep the heartbeat as recovery when no notification arrives.

Non-goals: resizing active runs, adding a new tier label, changing models or human gates, external message delivery, and a fixed trial-count requirement.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-dispatch`: Basic becomes the default for new starts.
- `sandbox-agent-execution`: completed supervisors wake collection without waiting for the heartbeat.

## Impact

The ingress release config, container supervisor, capability endpoint, and workflow event loop change. The current TypeScript Worker and JavaScript supervisor own these paths. No new service, dependency, or database migration is needed.
