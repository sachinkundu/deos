## 1. Provider contracts and deterministic boundaries

- [x] 1.1 Verify Linear's Issue update and webhook contracts with a short-lived DEOS issue, including event-time fields, actor, timestamp unit, description changes, and exact marker removal after a human edit.
- [x] 1.2 Verify GitHub pull-request body update and read-back behavior with a test pull request, including whether strong ETag preconditions work.
- [x] 1.3 Add deterministic tests for the app/provider path decision, exact candidate identity, and release guard before enabling either path.

## 2. Durable site authority

- [x] 2.1 Add migrations for the single environment row, stable staging manifest, lease queue, lease and fence history, scoped resources, operations, provider event inbox, proof, cleanup, closure, repair, and first-failure records.
- [x] 2.2 Implement the app/provider path decision using one saved service-manifest revision and exact patch hash and candidate commit.
- [ ] 2.3 Implement idempotent lease requests, fair queue validation, and atomic single-owner grant against a stable staging base.
- [ ] 2.4 Implement heartbeat, write-fence checks, dead-waiter expiry, and scheduled recovery without treating age or timeout as proof of a free site.
- [ ] 2.5 Implement first-error retention across D1 and create-only object storage, preserving the original message, stack, causes, operation, and lease facts.

## 3. Staging base and isolated test services

- [ ] 3.1 Put managed staging deploys behind a stable release pointer with full service manifests, 100% traffic read-back, and blocked drift or interrupted updates.
- [ ] 3.2 Prepare lease-named test services and stores from fixed staging build inputs, excluding live and staging data bindings and provider secrets.
- [ ] 3.3 Read each running test service version back and block agent and provider writes until every service matches the saved base.
- [ ] 3.4 Save plans before remote creates, reconcile uncertain replies by fixed names and work IDs, and retain per-resource ownership and create-fence facts.

## 4. Scoped agent, browser, and provider use

- [ ] 4.1 Admit only a trusted current-team Linear task and save its issue, run, attempt, lease, candidate, repository, branch, and pull-request scope.
- [ ] 4.2 Add a fresh lease-bound demo Sandbox and narrow agent capability; check the current D1 fence on each action and reject staging or live release actions.
- [ ] 4.3 Add a separate lease app origin, service identity, one-use launch code, short host-only app session, and per-request fence check without exposing keys to the agent or page.
- [ ] 4.4 Restrict GitHub writes to the saved repository, branch, and pull request; re-read team membership before each Linear write.
- [ ] 4.5 Add the trusted `test_issue_marker_patch` action with a versioned keyed marker, saved before/after hashes, idempotent insert/find/remove, and preservation of human edits.
- [ ] 4.6 Route one signed Linear webhook delivery using all saved event-time facts, atomically claim a live expectation, and retry a durable test Queue dispatch without rerouting duplicates.
- [ ] 4.7 Claim test Queue work with expiring tokens and stable work IDs; save the observed result against the exact task, run, lease, commit, pull request, and base.

## 5. Proof, cleanup, and portal

- [ ] 5.1 Store raw captures privately and generate public proof only from allowlisted, versioned sanitization with metadata removal, fixed masks, and OCR validation.
- [ ] 5.2 Attach safe images, command proof, data read-back, and provider receipts to the pull-request body; preserve other body text and read back the body and every attached item before deletion.
- [ ] 5.3 Fence writes first, settle accepted work, remove only resources owned by the run and lease, and prove each app item, provider fixture, deploy, session, identity, and secret absent.
- [ ] 5.4 Add revision-bound, Access-protected, audited item-level retry or repair; never waive proof or absence and never force the site free.
- [ ] 5.5 Atomically close only after proof and absence checks, complete the exact test attestation, and save a durable close receipt.
- [ ] 5.6 Create and read back the final report after close, then replace the pull-request body's pending marker with its lasting URL without reclaiming the free site.
- [ ] 5.7 Add the Access-protected `deos-test.voxdez.com` status page, separate from app origins, with the issue key and title leading the active view and safe preparing, cleaning, blocked, and free states.

## 6. Workflow and release integration

- [ ] 6.1 Register a new immutable implementation workflow version with `shared_test_demo` after build and before evidence review and native verification; leave frozen runs unchanged.
- [ ] 6.2 Make every matching app/provider candidate wait for a complete lease-bound test, and save an exact `test_not_required` decision only for a nonmatching candidate.
- [ ] 6.3 Add the exact-commit staging and live release guard in observe-only mode, with enforcement enabled only after the full SAC-182 proof.
- [ ] 6.4 Cover grant races, stale attempts, staging drift, wrong versions, old sessions, wrong scopes, event duplicates, uncertain remote replies, proof failures, interrupted cleanup, and first-error preservation with deterministic tests.

## 7. Remote proof and review

- [ ] 7.1 Apply the migration and deploy the coordinator, isolated test app, portal, and new workflow version only after checking live attempts and configured bindings.
- [ ] 7.2 Resume SAC-182 as newly admitted work and show the lease, pinned staging base, portal issue identity, real app use, scoped GitHub result, and provider-made Linear event in D1.
- [ ] 7.3 Attach and read back sanitized provider and task screens, Showboat commands, D1 reads, and provider receipts on the implementation pull request.
- [ ] 7.4 Prove owned resource removal, absence, free state, final report, and subsequent safe lease eligibility; then enable the release guard.
- [ ] 7.5 Run OpenSpec validation, type checks, focused and full tests, inspect the diff, and publish one ready-for-review implementation pull request citing the approved planning PRs and requirement coverage.
