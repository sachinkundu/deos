## 1. Persistence and rollout foundations

- [ ] 1.1 Add an additive D1 migration for versioned project BettaView account links and append-only account audit facts, enforcing one current link per project without adding a reviewer role or storing provider credentials.
- [ ] 1.2 Add the nullable all-or-none frozen Access account, numeric GitHub user ID, Linear user ID, and account-policy version fields to run snapshots, and extend run allocation so only new runs freeze the current checked link.
- [ ] 1.3 Add review intent, gate-scoped lease, review part, attempt-generation, and proof-nonce tables with the approved primary keys, explicit `NOT NULL` key columns, active-generation/lease uniqueness, provider-record uniqueness, and immutable receipt fields.
- [ ] 1.4 Link existing provider operations, faults, signed deliveries, gate choices, transitions, and stable ops items to review intents without weakening their existing one-choice and one-traversal constraints.
- [ ] 1.5 Implement typed D1 stores and status projections for account links, intents, parts, attempts, leases, nonces, delivery deadlines, repair facts, and terminal outcomes; reject non-monotonic updates and ID/digest clashes.
- [ ] 1.6 Add migration and store tests proving all uniqueness/CAS constraints, write-once first-error behavior, all-or-none frozen identities, terminal-state immutability, and compatibility for routes and active runs created before the feature is enabled.

## 2. Checked account connection and run binding

- [ ] 2.1 Extend the existing route-administrator Settings contract to display and rotate one BettaView account connection per project using the existing authorization and route-revision compare-and-set.
- [ ] 2.2 Read the current Access identity and numeric GitHub user ID from trusted BettaView sessions, read the selected Linear user through private app access, and activate a new policy version only when all three stable IDs are proved and the required `Human Review`, `In Progress`, and `Merging` state IDs resolve exactly.
- [ ] 2.3 Persist safe provider-read and Settings-actor audit facts for successful and rejected connections while preserving original provider messages and causes and excluding tokens, assertions, and secrets.
- [ ] 2.4 Add deterministic tests for authorization denial, provider-read failure or mismatch, stale route revision, account rotation, immutable old versions, and new-run versus existing-run identity freezing.

## 3. Review intent authentication and gate lease

- [ ] 3.1 Add the private `ReviewContinuation` service entrypoint and BettaView service binding with backward-compatible deployment configuration, keeping the entrypoint unavailable as a public browser API (https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/).
- [ ] 3.2 Implement short-lived HMAC assertions over the method, canonical body digest, trusted Access account, numeric GitHub user ID, issued time, and one-use nonce; reject bad MACs, expired assertions, replayed nonces, and identity mismatches with safe durable diagnostics.
- [ ] 3.3 Define and validate the canonical review digest over the review, repository, gate-bound pull request/head, run, gate visit, review type, frozen person-link version, ordered parts/items, content digests, and target digests, ignoring any browser-supplied trusted identity fields.
- [ ] 3.4 Implement idempotent `prepareReview` handling that checks the immutable run link, exact open gate visit, exact frozen pull request/head, and GitHub live head before atomically inserting or recovering the intent and acquiring its exclusive gate lease.
- [ ] 3.5 Return the active intent's safe status for a competing review under `gate_review_in_progress`, and return `id_clash` with both safe digests when a review, part, or content-item ID is reused with different facts; allocate no permit, queue event, or provider operation in either case.
- [ ] 3.6 Add deterministic authentication and concurrency tests proving forged page identity, unlinked/closed pull requests, stale or forked heads, missing frozen IDs, duplicate prepare responses, and simultaneous intents cannot reach a provider write.

## 4. Local drafts and GitHub publication

- [ ] 4.1 Refactor BettaView drafts to create and persist a UUIDv7 review ID plus stable content-item IDs, bodies, targets, and digests locally, with no GitHub write, lease, review-ready event, or Linear request during create, edit, autosave, or reply drafting.
- [ ] 4.2 Detect legacy GitHub-backed drafts on feature-enabled projects, keep them readable, and block intent preparation until the reviewer submits or discards them in GitHub rather than adopting them into new lineage.
- [ ] 4.3 On Publish, revalidate Access and the user-scoped GitHub session, derive stable reply and atomic review-bundle part IDs, prepare the intent, and request a one-use permit only for the first incomplete part.
- [ ] 4.4 Validate each reply's top-level parent, repository, pull request, commit, visibility, live head, and reply relationship before the signed-in user posts a versioned hidden marker; verify the response user, inherited commit, parent relation, marker, and head before saving the receipt (https://docs.github.com/en/rest/pulls/comments).
- [ ] 4.5 Publish all new inline notes and the final `COMMENT`, `REQUEST_CHANGES`, or `APPROVE` choice in one user-scoped create-review request pinned to the frozen `commit_id`, with versioned bundle/item markers and no subset retry (https://docs.github.com/en/rest/pulls/reviews).
- [ ] 4.6 Validate the returned review ID, commit, numeric user, event, and bundle marker, then exhaust the review-comment pagination and record every inline host ID only after its target and marker match.
- [ ] 4.7 Implement paginated marker-and-facts read-back for lost GitHub responses: adopt one exact match, classify zero/multiple/conflicting/incomplete results as `host_check_required`, and allow a new generation only after a clear rejection or stronger trusted proof of absence.
- [ ] 4.8 Mark GitHub `done` and enqueue one durable review-ready event only after every reply and the atomic bundle have durable verified receipts and a final gate-bound live-head check succeeds.
- [ ] 4.9 Add deterministic GitHub adapter and route tests for COMMENT, REQUEST_CHANGES, approval with and without notes, replies only to top-level comments, multi-page read-back, partial bundle verification, rate/session errors, lost replies, exact-match adoption, and no duplicate host write.

## 5. Workflow-owned Linear continuation

- [ ] 5.1 Extend the frozen workflow graph and evaluator so COMMENT and REQUEST_CHANGES map to the configured `In Progress` edit edge and APPROVE maps to the configured `Merging` trusted-merge edge, without adding a gate or letting BettaView select an edge.
- [ ] 5.2 Consume review-ready events by reloading D1 authority and rechecking the frozen graph digest, open gate visit, complete GitHub receipts, frozen person link, exact pull request/head, and live GitHub head instead of trusting event payload facts.
- [ ] 5.3 Atomically upgrade the gate lease from `publishing` to `linear_pending`, prove no direct Linear choice or other intent owns the visit, and allocate the stable logical Linear operation and append-only generation only when a prior effect is proved absent.
- [ ] 5.4 Extend the Linear adapter to issue the mapped `issueUpdate` as the app actor and classify HTTP failures, GraphQL `errors`, `success != true`, missing issue data, and mismatched returned state as failed or unclear while retaining the first provider message, cause chain, and safe act facts (https://linear.app/developers/graphql; https://linear.app/developers/oauth-actor-authorization).
- [ ] 5.5 After a clear mutation response, save the receipt and frozen eight-hour delivery deadline, project `awaiting_delivery`, and defer the human choice, business transition, traversal, and lease release until exact signed provider delivery proof arrives.
- [ ] 5.6 Update Linear ingress to verify raw-body HMAC-SHA256, millisecond `Linear-Timestamp`, the approved 8-hour-15-minute past/5-minute future window, and durable `Linear-Delivery` uniqueness; persist/schedule accepted, ignored, and duplicate deliveries and return HTTP 200 within the four-second budget without provider work in the acknowledgement path (https://linear.app/developers/webhooks).
- [ ] 5.7 Correlate a signed delivery by issue, old and target state, app actor, pending operation, run, and current GitHub head, then use one guarded transaction to record the review as the human choice, mark Linear done, release the lease, append the auditable transition, and select exactly one graph path.
- [ ] 5.8 Preserve direct signed Linear events from the frozen human as the alternate authority path and add the lease/gate compare-and-set race handling so either the direct choice or BettaView intent wins once while the loser becomes a non-traversing conflict.
- [ ] 5.9 Add deterministic workflow, ingress, and adapter tests for every mapped review type, HTTP-200 GraphQL errors, false/missing/mismatched mutation results, delayed/duplicate/late/wrong-actor deliveries, deadline expiry, direct-choice races, interruption recovery, and exactly one choice, mutation generation, transition, and traversal.

## 6. Repair, retry, abandonment, and diagnostics

- [ ] 6.1 If the gate closes or the head advances before Linear allocation, revoke unused permits, record `abandoned_before_linear`, release the lease, and return exact published and unpublished items without treating the old-head review as a gate choice.
- [ ] 6.2 Implement replacement lineage with a new review ID and retained content-item IDs, adopting exact same-parent visible replies as `published_prior_intent` while excluding old-head inline notes/reviews unless an explicit edit or retarget creates a new item ID.
- [ ] 6.3 If the head advances after the Linear mutation, project `reverting`, start no graph path, run the existing stable restore-to-`Human Review` operation once, and terminalize as `abandoned_stale_after_linear` only after matching signed restoration delivery.
- [ ] 6.4 On missing or unclear restoration proof, retain the lease, project `host_check_required`, preserve the primary error, and create or update one stable ops item; ensure any cleanup or diagnostic failure is additional context and never masks the provider failure.
- [ ] 6.5 Reconcile an expired Linear delivery deadline by scanning the signed inbox once; link one exact event, otherwise save `linear_delivery_missing`, retain the lease, require host checking, and repair a target-state issue before allowing any later generation.
- [ ] 6.6 Implement action-specific one-use retry and abandon tokens so retry resumes only the first provably incomplete GitHub part or Linear operation, voluntary abandon is allowed only before Linear allocation with no uncertain GitHub result, and done, uncertain, or terminal records never reopen.
- [ ] 6.7 Add deterministic failure-matrix tests covering stale heads before and after Linear, replacement suppression, unavailable status reads, unauthorized automation repair, failed diagnostic writes, operator retain/abandon limits, and preservation/redaction of original GitHub, Linear, D1, and service-auth causes.

## 7. BettaView status and Settings experience

- [ ] 7.1 Add the checked-account Settings UI using the existing route-administrator flow, showing provider-read readiness and policy version without presenting the link as GitHub repository permission or adding a reviewer approval step.
- [ ] 7.2 Add Publish controls for COMMENT, REQUEST_CHANGES, and APPROVE, block unlinked/closed/stale-head reviews with reload guidance, and ensure the browser payload and bundle contain no Linear credential, trusted identity override, graph edge, or direct Linear request.
- [ ] 7.3 Render GitHub and Linear as separate status steps with goal state, safe labels, published-part links, final outcome, continuation result, redacted provider detail, and unknown/host-check states that never appear successful.
- [ ] 7.4 Show Retry, Abandon, reload, and replacement actions only from the server's action-specific token and projected state; keep a completed GitHub step visibly done when Linear fails or reverts.
- [ ] 7.5 Add responsive UI and Worker route tests for local draft behavior, every step/outcome projection, safe failure copy, stale/unlinked gates, legacy drafts, action visibility, session renewal, and absence of browser-to-Linear traffic or secrets.

## 8. Deterministic verification

- [ ] 8.1 Run the D1 migration suite and focused account-link, review-store, lease, nonce, marker/read-back, ingress, Linear transition, workflow race/repair, BettaView Worker, and UI tests; retain the exact commands and results.
- [ ] 8.2 Run the complete repository tests, type checks, generated Worker binding checks, BettaView tests, `npm run bettaview:build`, and `npm run portal:build`, fixing any regression without weakening the approved behavior.
- [ ] 8.3 Exercise synthetic authenticated service ingress with correctly signed assertions and synthetic Linear webhook ingress separately, proving rejection, idempotency, timeout-window, duplicate-acknowledgement, and exact D1 classification without describing either as provider-originated end to end.
- [ ] 8.4 Add a deterministic failure-injection demonstration for lost GitHub and Linear responses, paginated read-back, restart recovery, stale-head repair, and first-error/cause-chain retention, with read-only D1 evidence that no provider act or traversal repeats.

## 9. Staged rollout and behavior proof

- [ ] 9.1 Deploy the backward-compatible Linear ingress first, read back the active version at 100% traffic, and use a real Linear safe resource to prove signed retry delivery, `Linear-Delivery` deduplication, HTTP 200 acknowledgement within five seconds, and expected D1 inbox classification.
- [ ] 9.2 Deploy and read back the trusted DEOS Worker with `ReviewContinuation`, stores, workflow handling, reconciliation, and repair before deploying the BettaView caller; keep the project feature disabled during compatibility checks.
- [ ] 9.3 Deploy BettaView from `portal/bettaview/`, read back the active version at 100% traffic, verify the live browser, and enable one test project only after the checked account link, three required Linear state IDs, service assertion, and legacy-draft preconditions pass.
- [ ] 9.4 On a real safe pull request, signed-in reviewer session, and linked Linear issue, capture provider-originated proof that COMMENT and REQUEST_CHANGES publish once then reach `In Progress`, and APPROVE with and without notes publishes once then reaches `Merging` through matching signed app deliveries and exactly one workflow traversal.
- [ ] 9.5 Capture provider-originated failure and recovery proof for a rejected GitHub write, interrupted post-review Linear work, delayed retry/read-back, and stale-head repair, showing the task does not move before GitHub is durably complete and uncertain work is not repeated.
- [ ] 9.6 Record read-only D1 evidence for intents, leases, attempts, provider-native receipts, signed deliveries, choices, transitions, faults, and repairs, and package Showboat command output with sanitized browser screenshots of the checked Settings state, GitHub/Linear two-step outcomes, triggering pull request, and resulting Linear issue state.
- [ ] 9.7 Re-run all checks and recapture synthetic, provider-originated, D1, deployment-version, and browser proof against the exact final tree; document the staged rollback order and verify it preserves active leases, receipts, original diagnostics, and already committed workflow choices.
