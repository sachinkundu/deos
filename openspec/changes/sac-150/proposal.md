## Why

The workflow portal shows review success before its checks are done. This can make people think a plan or design is ready for human review too soon.

## What Changes

- Show each required self-check and independent review for planning and design. Read its state from saved flow and review facts, not from age, Linear state, or the presence of a pull request.
- Use four clear states. A check is not started before work begins. It is running while a review job or final check is active, even if it had an older result. It needs work when no job is active and an author fix, reply, or retry is due. It has passed when its work and final check are done, its proof matches the current work, and no fix, reply, or retry is due.
- Show success text and green checks only when the matching check has passed for the current plan or design.
- Keep the workflow map and details panel in sync.
- Mark work ready for human review only after all checks required by its saved workflow have passed.

### Non-goals

- Do not change which checks a saved workflow requires.
- Do not change review rules, repair limits, or human approval rules.
- Do not add check steps to old saved workflows.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-observability`: Show the real state of planning and design checks without early success cues.

## Impact

The change affects the workflow map, its details panel, and the saved review data shown by the portal. It also needs portal tests for each state, current proof, and old workflows.
