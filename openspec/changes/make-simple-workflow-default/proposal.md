## Why

The proven simple workflow still depends on a Linear label and stops after planning. New issues should enter one clear default flow, and the portal must keep its settings page separate from the workflow map.

## What Changes

- **BREAKING** Make the simple workflow the default for every accepted start event. A `simple-workflow` label no longer selects a definition.
- Replace the planning-only agent step with one governed delivery step. It creates the proposal, delta specs, design, tasks, implementation, validation, and one pull request in one agent attempt.
- Keep Human Review as the explicit approval gate. Revision returns to a fresh delivery attempt on the same governed pull request; approval moves to automatic merge and verification.
- Retire the simple-workflow selector control from settings. Keep dispatch as the operator switch for admitting new runs.
- Serve the workflow visualization only at `/`. Serve the existing project settings interface at `/settings` and `/settings/`.
- Preserve frozen historical definitions and recorded runs. Do not rewrite older label-selected or planning-only runs.
- Do not remove the larger workflow definition in this change. It remains available for later migration work but is not the default.

## Capabilities

### New Capabilities

- `operator-portal-routing`: Defines the separate root visualization and settings destinations in the Access-protected portal.

### Modified Capabilities

- `workflow-dispatch`: Makes the simple definition the default and removes label-based definition selection for new runs.
- `sandbox-agent-execution`: Requires one delivery agent attempt to produce the complete OpenSpec plan, implementation, validation, and governed pull request.
- `provider-capability-access`: Governs one stable full-delivery pull request across the initial attempt and any revision attempts.

## Impact

The change affects the bundled workflow definition, Queue dispatch selection, durable work-product records, sandbox job inputs and prompts, GitHub capability validation, automatic merge verification, portal settings contracts, frontend routing, migrations, deployment configuration, and provider canary evidence. It requires a new immutable simple workflow version and additive D1 migration. Existing runs keep their frozen definitions and history.
