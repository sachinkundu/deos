## Why

The current default DEOS flow ends when the plan pull request is merged. People need one more gate to check that the design fits the repo before code work starts.

## What Changes

- Keep the plan review and merge. Each plan gate visit saves its gate, work type, and pull request. An allowed person can move it from `Human Review` to `In Progress` for a plan change, `Merging` to approve the merge, or `Canceled` to stop. A change uses the saved plan pull request. A trusted step reads back the saved plan pull request after a lost reply. It does not make or merge another pull request. It checks the base, head, merge state, and approved proposal and specs at the merge commit on the default branch. It saves GitHub and repo proof. A closed pull request, wrong base or head, conflict, failed policy, or missing plan file stops design work. Missing file proof asks for repair. A checked plan merge starts a new design job.
- Give the design job the approved plan and the repo rules and architecture text from its base commit. The job writes and checks the OpenSpec design only. It has no GitHub write access.
- A trusted step opens one run-scoped design branch and a separate pull request to the default branch. It reads back the open pull request, branch, base, and head before review. It saves those facts and the provider receipt. A retry finds and uses the same pull request. If these facts do not match, the run records a safe failure. Keep that branch and pull request when a person asks for changes.
- Add a design review visit to the same visible human approval stage used for plan review. The plan and design visits stay distinct in saved state. The stage shows artifacts from both visits and highlights the artifacts for the active visit. Design review opens only after the trusted step reads back the run's branch, base, head, and open pull request. An allowed person can move it from `Human Review` to `In Progress` for a new draft, `Merging` to approve the merge, or `Canceled` to stop. A change request starts a fresh job with the saved design, approved plan, repo guide, prior result, and bounded notes. The job restores the saved design and review facts and does not need the old sandbox. It updates the same branch and pull request. The post adds one short reply to each changed root review thread. Each reply says what changed or why no change was made, and it leaves the thread open. Each plan and design gate visit saves its active gate, work type, and pull request. Late choices from old visits do not affect the active gate. An unknown state change does no work and keeps or restores that gate.
- End the flow after a person approves the design merge and the trusted GitHub action completes. The action checks the saved pull request and approved head, asks for the merge, and reads the pull request back once to record the merge commit. DEOS checks its saved gate visit, pull request, head, and action receipt. It does not add a later check that downloads the design or asks GitHub or Linear to prove their work. A retry uses the same saved action and does not ask for a second merge. A missing or mismatched DEOS record stops success.
- Show design work, review, change loops, merge and check work, and the end state in the workflow view. Use only saved run and visit facts. Mark design work active during its job or post, and show its saved pull request when ready. Mark design review as waiting and link its choice to the Linear issue. Show each return visit and its cycle count. Mark merge and check active until a saved success visit makes them and the end state complete. Do not guess from state or time.

### Non-goals

- Do not create tasks, write app code, deploy, or archive the change.
- Only an allowed person can approve a merge at the active gate. Only trusted steps can merge plan work. An agent cannot approve or merge its own work.
- Do not change old run data or its saved workflow graph. Show the frozen graph as saved, with no new or guessed design stage.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `simplified-planning-workflow`: Continue the current default flow through a new design pull request, review loop, merge, and check.
- `workflow-state`: Keep the plan gate and design gate apart and route each human choice to the right work.
- `workflow-observability`: Show the new design steps, return path, merge, and end state in the workflow view.

## Impact

The change affects the saved workflow graph, design job input and output rules, trusted GitHub work, human gate state, durable run data, and the workflow view. It also needs tests and real proof for both review gates and both pull request merges.
