## 1. Provider contract and durable evidence

- [x] 1.1 Record the current Linear webhook label shape and GitHub publication, merge, and read-back contracts used by the implementation, distinguishing deterministic adapter coverage from provider-originated proof.
- [x] 1.2 Extend the authenticated Linear ACL with bounded `available` or `unavailable` event-time label evidence, a deterministic evidence digest, and focused ingress tests for valid, missing, and malformed label payloads.
- [x] 1.3 Persist the label evidence and digest with the delivery, carry both through Queue, and reject dispatch when Queue evidence does not match the delivery record.

## 2. Immutable definition selection

- [x] 2.1 Add the D1 selector, frozen run-selection, planning work-product, and protected prompt-evidence schema without rewriting historical definitions or runs.
- [x] 2.2 Register the simple definition and repository-scoped `simple-workflow` selector disabled by default while preserving the existing full workflow as the default.
- [x] 2.3 Select `simple` only for an enabled selector and exact authenticated event-time label evidence; record `label_absent`, `label_evidence_unavailable`, or `selector_disabled` for every safe fallback.
- [x] 2.4 Freeze the selected definition, source delivery, evidence digest, label, and reason before Workflow creation, and reuse that choice across Queue retries.

## 3. Simple workflow and human decisions

- [x] 3.1 Load the full and simple YAML definitions into an immutable registry and keep the full definition unchanged as the default.
- [x] 3.2 Add the simple planning graph with one agent job, a three-way human gate, trusted merge and verification actions, and explicit terminal failure or cancellation outcomes.
- [x] 3.3 Parse optional per-gate decision maps and route exact human `In Progress`, `Merging`, and `Canceled` transitions without changing legacy approved/rejected gates.
- [x] 3.4 Restore `Human Review` and select no edge for bot, app, unknown-actor, unauthorized, or unmapped departures.

## 4. Narrow planning agent contract

- [x] 4.1 Add the exact static planning prompt and render the trusted run, attempt, change, branch, pull-request, prior-result, patch, and bounded-feedback context into the protected final prompt.
- [x] 4.2 Persist and read back the exact rendered prompt in protected R2 before Sandbox execution, storing its object key and SHA-256 digest on the attempt.
- [x] 4.3 Grant only `github.publish_planning_work_product` and reject Linear transitions, review resolution, merge, generic publication, foreign repositories, branches, or OpenSpec changes.
- [x] 4.4 Limit the complete planning manifest to the named change's `.openspec.yaml`, `proposal.md`, and one or more `specs/**/spec.md` files; reject design, tasks, main specs, archive files, code, links, unsafe paths, or partial manifests.
- [x] 4.5 Enforce strict OpenSpec validation, whole-file readability limits, the fixed review pull-request structure, and exact saved or reconciled GitHub receipts before entering `Human Review`.

## 5. Same pull request revisions

- [x] 5.1 Allocate one deterministic `deos/planning/<run-digest>` branch and work-product record per run with separate GitHub database id and pull-request number fields.
- [x] 5.2 Reconstruct each fresh revision attempt from the durable patch, prior result, same branch and pull request, and bounded human or GitHub feedback.
- [x] 5.3 Replace the complete allowed manifest on the expected remote head, safely remove only stale files inside the named change, and reconcile ambiguous provider responses without opening a second pull request.

## 6. Trusted merge and verification

- [x] 6.1 Merge only the recorded planning pull request after the exact human `Merging` decision, checking repository, base `main`, branch, expected head, file digest, and provider policy.
- [x] 6.2 Reconcile ambiguous merge responses by reading the same pull request and fail safely for changed identity, closed-unmerged, conflict, or required-policy rejection.
- [x] 6.3 Independently verify the merge commit on `origin/main`, re-read every approved planning file, confirm no forbidden file was added, and require a matching manifest digest before terminal success.

## 7. Deterministic validation

- [x] 7.1 Cover available, absent, unavailable, tampered, and disabled selector evidence; Queue replay; allocation races; and preservation of historical definitions.
- [x] 7.2 Cover the exact first prompt, protected prompt evidence, capability scope, allowed files, readability bounds, same-PR revisions, ambiguous responses, merge, and final read-back.
- [x] 7.3 Run named strict OpenSpec validation, TypeScript tests and typecheck, Python tests, Ruff, binding generation checks, migration checks, Worker dry-runs, and `git diff --check`.

## 8. Deploy inactive for shared testing

- [x] 8.1 Apply the additive remote D1 migration and deploy the implementation branch with the simple selector still disabled.
- [x] 8.2 Read back the registered full and simple definitions, disabled selector, migration constraints, full definition as the default with the intended `Todo` start and dispatch off, and absence of deployment-triggered Sandbox or provider operations.
- [x] 8.3 Provide the deployed endpoint, exact first prompt, prompt digest, definition digest, and a controlled provider-originated test sequence; stop before enabling the selector or moving a test issue to `Todo` so the live canary can be run with the user.

## 9. Correct the Todo handoff

- [x] 9.1 Revise the simple definition so a trusted claim action preserves the human assignee, delegates the issue to the DEOS app user, and confirms `In Progress` before the planning agent starts.
- [x] 9.2 Add durable, idempotent Linear claim handling with provider read-back and focused tests for success, replay, ambiguity, and conflicting human intent.
- [x] 9.3 Validate and deploy the correction, read back definition version 2, then leave SAC-129 in Backlog for a human-triggered Todo test.

## 10. Preserve failed-agent evidence

- [x] 10.1 Capture patch, provider references, JSONL, validation, result, and bounded supervisor status whenever available after any terminal agent outcome.
- [x] 10.2 Persist and verify an immutable failure manifest before cleanup, retain the manifest on the failed attempt, emit the bounded failure category, and keep the Sandbox recoverable when collection fails.
- [x] 10.3 Add deterministic failure, interruption, policy-rejection, and persistence-failure tests; validate and deploy the branch; then re-arm SAC-129 and verify the new run through D1, R2, Linear, and Workers telemetry.
- [x] 10.4 Keep the Codex JSONL stream supervisor-owned and return a bounded reason when trusted planning publication validation denies a request.

## 11. Acknowledge review threads

- [x] 11.1 Require each revision to reply on every affected human GitHub review thread, state what changed or why no change was made, reconcile reply retries, and never resolve a thread.

## 12. Connect a test repository

- [x] 12.1 Preserve the D1 repository setting when setup runs again.
- [x] 12.2 Add an Access-protected settings page with safe save and read-back.
- [x] 12.3 Use the D1 repository for selection and Sandbox checkout.
- [x] 12.4 Grant the GitHub App access to the test repository and prove both sides of the connection.

## 13. Add guarded workflow controls

- [x] 13.1 Add separate D1 revision and editor fields for workflow controls.
- [x] 13.2 Add authenticated dispatch and simple workflow switches with active-run guards and read-back.
- [x] 13.3 Validate and deploy the portal while both live controls stay off.

## 14. Give settings a stable route

- [x] 14.1 Add URL-backed `/` and `/settings` views with browser history and route tests.
- [x] 14.2 Validate, deploy, and verify the live `/settings` route.

## 15. Remove repeated settings

- [x] 15.1 Keep editable values in the main cards and unique details in the right-hand card.
- [x] 15.2 Validate and deploy the cleaned settings page.

## 16. Freeze the D1 repository before Sandbox startup

- [x] 16.1 Remove the deployment repository from Sandbox runtime authority and render checkout and publication instructions from the repository frozen in the durable job.
- [ ] 16.2 Add regression coverage where the saved D1 repository differs from the deployment seed, then validate, deploy, and read back the live mapping before another provider test.
