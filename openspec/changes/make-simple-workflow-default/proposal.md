## Why

The proven simple workflow still needs a Linear label even though it is now the workflow we want to use. The portal build also sends `/settings` to the visualization instead of the existing settings interface.

## What Changes

- **BREAKING** Make the existing simple workflow the default for every accepted start event. A `simple-workflow` label no longer selects a definition.
- Keep workflow dispatch as the operator switch for admitting new runs and remove the obsolete simple-workflow selector from settings.
- Serve the approved workflow visualization at `/` only. Serve the existing project settings interface at `/settings` and `/settings/`.
- Preserve the larger workflow definition and every frozen historical run. Do not change the simple workflow's planning, Human Review, merge, verification, or terminal behavior.
- Do not remove bounded Linear label evidence from webhook ingress in this change. It remains compatible event evidence but does not affect workflow selection.

## Capabilities

### New Capabilities

- `operator-portal-routing`: Defines the separate root visualization and settings destinations in the Access-protected portal.

### Modified Capabilities

- `workflow-dispatch`: Makes the existing simple definition the default and removes label-based definition selection for new runs.

## Impact

The change affects bundled-definition selection, Queue dispatch, selector registration, portal settings contracts, frontend builds, Worker asset routing, tests, and the deployed Queue and portal Workers. It does not change the simple workflow definition, agent prompt, provider capabilities, governed pull request, or merge path.
