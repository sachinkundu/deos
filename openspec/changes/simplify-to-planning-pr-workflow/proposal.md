## Why

The current DEOS definition spans the full delivery lifecycle, which makes a first live run difficult to observe and improve one step at a time. A smaller planning-only workflow will provide a concrete, independently provable foundation before task generation and implementation are added.

## What Changes

- Add an inactive simplified workflow definition selected when a person moves a configured Linear issue carrying the `simple-workflow` label to `Todo`; an issue without that label continues to select the existing full workflow by default.
- Run one OpenSpec planning agent that creates or updates one GitHub pull request containing the proposal, specifications, and design while DEOS owns every Linear transition.
- Enter `Human Review` only after the planning work and its durable provider evidence are complete.
- Treat an authorized human transition to `In Progress` as a request to revise the same planning pull request, `Merging` as authorization for DEOS to merge it, and `Canceled` as a terminal stop.
- Report the planning slice as successful only after DEOS verifies that the approved planning work is present on `origin/main`.
- Preserve the current deployed full workflow and all immutable historical definitions while the simplified definition remains inactive pending implementation and live provider proof.

## Non-goals

- Generate implementation tasks or run an implementation agent.
- Build the workflow visibility or settings portal.
- Let an agent transition Linear, approve its own work, or merge a pull request directly.
- Activate or deploy the simplified definition as part of the planning-artifact review gates.

## Capabilities

### New Capabilities

- `simplified-planning-workflow`: Defines the planning-only graph, its label-based selection, its human decisions, its workflow-owned merge, and the proof required before the planning slice succeeds.

### Modified Capabilities

- `workflow-dispatch`: Selects and freezes the simplified definition for a new issue run only when the accepted `Todo` transition has the `simple-workflow` Linear label; otherwise selects and freezes the existing full definition.
- `workflow-state`: Interprets authorized human transitions from `Human Review` as three distinct configured decisions: `In Progress` requests revision of the same planning pull request, `Merging` authorizes the workflow-owned merge path, and `Canceled` terminates the run.

## Impact

- Adds a `simple-workflow` Linear-label selection rule, a separately selectable workflow definition, and its external agent prompt bundle without replacing the current production definition.
- Extends trusted workflow actions and GitHub reconciliation as needed to merge the authorized planning pull request and verify it on `origin/main`.
- Adds deterministic definition and orchestration coverage followed by a separately authorized Cloudflare deployment and provider-originated Linear canary.
- Establishes one planning-slice traceability boundary from the triggering issue through the verified merge.
