## Why

Design work can expose a flaw in an approved plan. The design author can now change only the design, so the plan and design may stay out of sync.

## What Changes

- Let a design author change the proposal, delta specs, and design in one design pull request when the author finds a plan flaw or a person asks for the change.
- Check the full plan and design as one candidate. Reject missing plan files, invalid specs, or edits outside the allowed change files.
- Keep this work in the Design phase and on the same design pull request. Do not send it back through the Planning phase.
- Show the exact plan changes beside the last approved plan. When a design check is due, check the design against the changed plan. For a later human edit with no new check, show that old proof is stale.
- Require a fresh human choice for the current pull request head before merge. Treat the full plan as one approved version. On merge, make the new plan and choice current while keeping all earlier versions and approvals in history.
- Put the graph, file scope, checks, author prompt, and pinned guidance in a new fixed flow version. Runs that began on an older version keep their saved rules and guidance.

### Non-goals

- Do not let the design author change tasks, code, main specs, archive files, or another OpenSpec change.
- Do not give an agent GitHub, Linear, merge, or approval rights.
- Do not erase or rewrite an earlier plan version or approval.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `simplified-planning-workflow`: Let design work revise the approved proposal and delta specs with the design in one checked design pull request, without reopening Planning.
- `workflow-state`: Bind the design gate to the full changed plan and design, require a fresh human choice, and keep the prior approval history.
- `workflow-observability`: Show the plan changes, their approval state, and the plan and design versions covered by each review and human choice.

## Impact

This change affects design author scope, candidate checks, OpenSpec validation, design publication, review input, fixed flow data, approval records, merge proof, and the workflow view. Provider rights and human gate ownership stay the same.
