# Design self-review limit

Workflow version 21 stops internal design review after three accepted author
responses in the current round. It publishes the latest validated design and
continues to independent review. Reaching this limit is not a failed run or a
passed review. The stored review findings remain unchanged.

The exit requires completed responses and destroyed Sandboxes. It records a
`workflow.review_limit` receipt before taking the `limit_reached` edge. The
receipt replaces only the self-review pass requirement. Independent review must
still match the published design and PR head. Human approval is still required.

A response that was already dispatched at the old limit can finish on retry.
The portal can upgrade a failed version 20 self-review or self-response stage to
version 21. The upgrade checks the frozen definition: only its version and the
new limit edge may differ. It keeps earlier planning work and creates the usual
audited replacement execution. No direct run-state edits are needed.

Independent review has its own response allowance in version 21. Internal
responses no longer consume that allowance.

Verification: `npm test` and `npm run typecheck`. The focused tests in
`tests/design-review-limit.test.ts` cover the cap, replay, unfinished cleanup,
round isolation, exact-head independent proof, and the narrow definition upgrade.
Production success must be checked after the operator uses Retry; deployment
alone does not prove that the recovered run completed.
