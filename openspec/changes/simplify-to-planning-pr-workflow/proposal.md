## Why

The current DEOS definition spans the full delivery lifecycle, which makes a first live run difficult to observe and improve one step at a time. This first slice intentionally stops after proposal and specification planning so it can be proved and improved independently. Later slices will extend the same path through design, task generation, and implementation until it reaches the full workflow again.

## What Changes

- Add an inactive simplified workflow definition that, once explicitly enabled for a configured project and repository, is selected when a person moves a Linear issue carrying the `simple-workflow` label to `Todo`; an unlabeled issue or disabled selector continues to select the existing full workflow by default.
- Preserve authenticated event-time Linear label evidence before asynchronous dispatch so later label changes cannot alter which definition the accepted `Todo` event selects.
- Before planning starts, have DEOS keep the human assignee, delegate the issue to the DEOS agent, move it to `In Progress`, and confirm both provider fields by read-back.
- Run one OpenSpec planning agent that creates or updates one GitHub pull request containing only the proposal and required delta specifications while DEOS owns every Linear transition.
- Enter `Human Review` only after the planning work and its durable provider evidence are complete.
- Treat an authorized human transition to `In Progress` as a request to revise the same planning pull request, `Merging` as authorization for DEOS to merge it, and `Canceled` as a terminal stop.
- Have each revision acknowledge every affected GitHub review thread, state what changed or why no change was made, and leave the thread unresolved for the reviewer.
- Report the planning slice as successful only after DEOS verifies that the approved planning work is present on `origin/main`.
- Preserve every available policy-safe agent output and bounded process diagnostic before any terminal Sandbox cleanup, including failed and interrupted attempts.
- Add a small authenticated settings page that saves the project repository and guarded workflow controls in D1. GitHub App access remains a separate provider permission, and a saved change applies only when no workflow is active.
- Preserve the current deployed full workflow and all immutable historical definitions while the simplified definition remains inactive pending implementation and live provider proof.

## Non-goals

- Generate a design, implementation tasks, or runtime changes, or run an implementation agent as part of this first slice.
- Build a general workflow editor or change settings for an active run.
- Let an agent transition Linear, approve its own work, or merge a pull request directly.
- Activate or deploy the simplified definition as part of the planning-artifact review gates.

## Capabilities

### New Capabilities

- `simplified-planning-workflow`: Defines the proposal-and-specification graph, its label-based selection, its DEOS-owned delegation and start transition, its human decisions, its workflow-owned merge, and the proof required before the first planning slice succeeds.
- `workflow-repository-settings`: Defines the authenticated D1 repository setting, safe update rule, and read-back shown in the small portal page.

### Modified Capabilities

- `linear-event-ingress`: Preserves immutable provider-backed label-selection evidence from the authenticated event before asynchronous workflow selection.
- `workflow-dispatch`: Uses the D1 repository setting when it selects and freezes the simplified definition for a new issue run. It selects that definition only when its selector is enabled and authenticated event-time evidence shows that the accepted `Todo` transition had the `simple-workflow` Linear label; otherwise it selects and freezes the existing full definition.
- `workflow-state`: Interprets authorized human transitions from `Human Review` as three distinct configured decisions: `In Progress` requests revision of the same planning pull request, `Merging` authorizes the workflow-owned merge path, and `Canceled` terminates the run.

## Impact

- Adds a `simple-workflow` Linear-label selection rule, a separately selectable workflow definition, and its external agent prompt bundle without replacing the current production definition.
- Extends trusted workflow actions and GitHub reconciliation as needed to merge the authorized planning pull request and verify it on `origin/main`.
- Adds deterministic definition and orchestration coverage followed by a separately authorized Cloudflare deployment and provider-originated Linear canary.
- Strengthens the shared Sandbox controller so failed-agent transcripts and diagnostics survive cleanup for every workflow that uses it.
- Makes the deployment repository value a first-run seed. Later repository and workflow-control changes come from the authenticated D1 settings page and are read back before use.
- Establishes one proposal-and-specification traceability boundary from the triggering issue through the verified merge.
