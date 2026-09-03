## Why

The workflow portal shows review success before its checks are done. This can make people think a plan or design is ready for human review too soon.

## What Changes

- Show each required self-check and independent review for planning and design. Read its state from saved flow and review facts, not from age, Linear state, or the presence of a pull request.
- Use five clear states: Not started, Running, Needs work, Failed, and Passed. Show green checks and success text only for Passed. Show Failed with a red label and failure icon.
- Save the exact safe failure reason in the durable failed outcome. Name the failed stage in the portal. Show the exact saved category and any bounded exit, timeout, and signal facts. A transcript or artifact may add support, but it is not the main error message.
- Retry an eligible transient failure on its own within a saved bound. Do not retry a non-transient failure on its own. Offer Retry stage only when manual retry is eligible and no retry is active. If it is not offered, explain why. A retry starts a new attempt at the failed stage in the same run. Keep prior attempts and completed stages intact and visible.
- Keep a published planning or design pull request visible after a later failure. Do not claim that it reached human review. Show GitHub and BettaView actions together wherever the pull request appears.
- Keep the workflow map and details panel in sync. Mark work ready for human review only after all checks required by its saved workflow have passed.

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
