## Why

New runs use the small sandbox tier, even when more CPU and memory could make agent work faster. People also need a cheap choice for work that can take longer.

## What Changes

- Use the Standard-2 sandbox tier for each new run by default.
- Use the Basic tier when the issue has the exact `slow-ok` label as it moves to `Todo`.
- Save the chosen tier on the run and each sandbox attempt. Use it for all author and review sandboxes, even after a retry. A later label change does not resize the run.
- Show the saved tier in the portal. Record enough timing data to compare the two tiers in a controlled trial.
- Keep the same agent roles, model routes, review rules, and human approval gates for both tiers.

### Non-goals

- Do not change review rules, model routes, or human approval gates.
- Do not use this speed trial to choose the long-term default.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workflow-dispatch`: Picks and freezes Standard-2 or Basic from the labels on the accepted start event.
- `sandbox-agent-execution`: Uses the frozen tier for every author, review, and retry sandbox in the run.
- `workflow-observability`: Shows the saved tier and records timing facts for a fair speed check.

## Impact

This change affects run setup, sandbox creation, saved run facts, telemetry, and the portal. It also needs tests for both labels, missing label facts, retries, and later label changes. Provider rights and human gates stay the same.
