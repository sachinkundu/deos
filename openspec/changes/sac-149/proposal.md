## Why

People can now review a design before it is merged. Yet no other agent checks that design first. Early checks can find gaps and show which pull request version was checked.

## What Changes

- Give the first design a read-only Codex self-check before a person sees it. This check uses the saved author model and thought level. The first draft then gets a review with the saved outside model.
- Keep the first draft private while its author fixes gaps. Publish the valid draft before its outside review.
- Skip the self-check for each later design change. Review the exact changed pull request head before a person sees it again.
- Give each outside concern to the design author. Save whether it was applied, declined, or needed no text change. If the design changes, review the new head before a person sees it.
- Save each result with the design, approved plan, repo base, model, round, and exact pull request head. Mark the proof stale when those facts change.
- Preserve complete valid planning, design, and review context. Do not reject, truncate, or omit it because of an unmeasured local byte, character, file-count, finding-count, or reply-count ceiling.
- Let a person see the result, proof, and exact pull request head that was checked. Do not start the design gate until the needed proof is valid and current.
- Only a real person can approve the design merge. An agent result, review result, check, or comment cannot approve it.

### Non-goals

- Do not let a review agent edit a design.
- Do not add design review steps to the saved graphs of old runs.

## Capabilities

### New Capabilities

- `openspec-design-review`: Checks the first design and each later design change before human review. It binds the result and evidence to the exact design and pull request head.

### Modified Capabilities

- `simplified-planning-workflow`: Adds the required design checks between design authoring and each visit to the design human gate.
- `workflow-observability`: Shows each design review round, its result, its evidence, and the exact pull request version that was checked.

## Impact

The change affects the saved workflow graph, design jobs, review jobs, design candidates, review proof, pull request checks, human gate rules, and the protected review view. It also needs tests for first drafts, later changes, stale proof, author responses, and real human choices.
