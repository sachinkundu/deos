## Why

Reviewers must leave BettaView to move a linked Linear task after a review. This extra step can stall work and can leave GitHub and Linear out of sync.

## What Changes

- Send each BettaView review as one tracked intent for the exact pull request, head, linked run, and human gate.
- Bind the allowed Access, GitHub, and Linear user IDs in project setup. Freeze that checked link for each run.
- Move the linked Linear task to `In Progress` after a comment or change request is saved on GitHub.
- Move the linked Linear task to `Merging` after an approval is saved on GitHub, with or without comments.
- Let the trusted DEOS workflow make and check the Linear change. The browser does not get a Linear key or direct state access.
- Show the GitHub and Linear results as separate steps. Read back an unclear host write before any retry. Keep the first error and key act facts in a safe store, and show no secrets.

### Non-goals

- Do not add a new workflow gate or allow an agent or service account to make a human choice.
- Do not let BettaView merge work.
- Do not continue a run from an unlinked pull request, an old head, or a closed human gate.

## Capabilities

### New Capabilities

- `bettaview-review-continuation`: Links one GitHub review result to a safe, clear, and retryable Linear workflow update.

### Modified Capabilities

- `workflow-state`: Accepts a checked BettaView review choice as a human gate decision and keeps the Workflow in charge of Linear state.

## Impact

This change affects the BettaView review routes and status view, the private DEOS service binding, the workflow decision path, Linear state updates, and durable review receipts.

The GitHub review API accepts a head commit and `COMMENT`, `REQUEST_CHANGES`, or `APPROVE`: https://docs.github.com/en/rest/pulls/reviews. Its review comment API also gives saved comment IDs and facts for read-back: https://docs.github.com/en/rest/pulls/comments.

Linear's `issueUpdate` mutation accepts a state ID, and clients must check GraphQL errors: https://linear.app/developers/graphql. A state change made with app actor access is shown as an app act, not a human act: https://linear.app/developers/oauth-actor-authorization.

Cloudflare does not pass an Access context through a service binding: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/. The trusted caller must pass proof that the next service checks.
