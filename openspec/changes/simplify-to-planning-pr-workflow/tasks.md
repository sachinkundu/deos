## 1. Provider contracts and controlled-trial preflight

- [x] 1.1 Re-read the current Linear webhook and GraphQL label contracts, GitHub ready pull-request and merge contracts, and installed `@cloudflare/sandbox` 1.0-preview types; record the exact fields and API calls the implementation will use without inferring them from fabricated payloads.
- [x] 1.2 Identify the real Linear test project, `Todo`, `Human Review`, `In Progress`, `Merging`, and `Canceled` state identities, the exact `simple-workflow` label, and the controlled GitHub test repository; verify the existing provider credentials have only the permissions required by the design without starting a workflow.
- [x] 1.3 Add deterministic provider-adapter contract tests for the selected Linear label read and GitHub publication, merge, and read-back response shapes, clearly classifying those tests as synthetic coverage rather than live E2E evidence.

## 2. Additive persistence and stable identities

- [x] 2.1 Add an additive D1 migration for `workflow_definition_selectors`, the bounded selection-evidence columns on `orchestration_runs`, `run_work_products`, and the protected rendered-prompt object reference and digest on `agent_attempts`.
- [x] 2.2 Implement typed D1 stores for selector registration/read-back, frozen run selection, run-scoped planning branch allocation, planning pull-request identity, manifest/head updates, merge state, verification state, and rendered-prompt evidence.
- [x] 2.3 Derive `deos/planning/<stable-run-digest>` deterministically from the run identity and enforce repository, base `main`, branch, pull-request, and planning-digest consistency on every update.
- [x] 2.4 Add migration and store tests for disabled-by-default selectors, foreign keys, uniqueness, immutable definition collisions, retry read-back, concurrent work-product allocation, and preservation of existing rows and historical definitions.

## 3. Bundle the simple definition and exact planning prompt

- [x] 3.1 Extend workflow job parsing with an optional bounded capability-action list, extend `human_gate` parsing with exact state-to-outcome decisions, and register only the two new trusted system actions while preserving definitions that omit the new fields.
- [x] 3.2 Refactor the workflow bundle into an immutable definition registry that retains `openspec-delivery` version 11 as the default and adds `simple` version 1 without modifying either canonical snapshot after load.
- [x] 3.3 Add `config/prompts/openspec-planning.md` with the exact static prompt in `design.md`, and add the `simple` YAML graph containing only planning, three-way human review, trusted merge, trusted verification, and terminal/failure nodes.
- [x] 3.4 Render the planning job envelope with the service-authored OpenSpec change, run, node, visit, attempt, deadline, declared inputs/context, bounded JSON, planning-publication request, and no generic Linear or merge capability instructions.
- [x] 3.5 Persist the exact rendered prompt to protected R2 before Sandbox execution, store its key and SHA-256 digest on the attempt, and fail startup if that service-authored evidence cannot be written and read back.
- [x] 3.6 Add exact-string tests for the first visit's complete `/deos/run/prompt.md`, static prompt digest, protected R2 copy, action scope, `Visit: 1`, service-authored change identity, required `tasks.md` generation, exact review-only pull-request template, readability limits, and absence of copied Linear content, an implementation-status statement, `deos-linear`, raw credentials, direct merge, and generic provider instructions.
- [x] 3.7 Add definition tests for the simple graph, prompt and schema bundling, capability scope, version/digest stability, invalid decision maps, unsupported actions, and restoration of existing frozen full-workflow definitions.

## 4. Select and freeze the workflow at dispatch

- [x] 4.1 Implement a trusted, bounded Linear GraphQL label resolver for new accepted `Todo` events and record the provider observation used for selection without exposing the access token or raw response.
- [x] 4.2 Register all bundled definitions and the exact `simple-workflow` selector with the selector disabled by default, while retaining the full definition in `project_workflow_policies` as the default.
- [x] 4.3 Change the controlled start transition to the actual Linear state name `Todo`, select `simple` only when the exact label is confirmed and the repository-scoped selector is enabled, and otherwise select the existing full definition.
- [x] 4.4 Freeze the selected definition and selection evidence atomically with run allocation before creating the Workflow instance; reuse that decision across Queue retries and ignore later label or selector changes for the active run.
- [x] 4.5 Add Queue and D1 tests for labeled enabled selection, unlabeled fallback, disabled-selector fallback, provider-read failure, duplicate delivery, allocation races, later label changes, historical definition restoration, and unchanged full-workflow dispatch.

## 5. Interpret three-way human decisions safely

- [x] 5.1 Update human-gate evaluation to match an authorized departure from `Human Review` against the active node's exact decision map, producing distinct `revision_requested`, `merge_authorized`, and `canceled` outcomes for the simple definition.
- [x] 5.2 Route an unauthorized or unmapped departure through the existing visit-scoped restore-to-`Human Review` operation and select no business edge; retain the global approved/rejected behavior for gates without a decision map.
- [x] 5.3 Update the orchestrator and durable transition recording so a revision loops to a fresh planning visit, merge authorization reaches only the trusted merge node, cancellation terminates, and replay reuses the same visit/transition identity.
- [x] 5.4 Add evaluator and Workflow tests for all three decisions, unknown states, integration/bot/unknown actors, restore failure, duplicate deliveries, repeated revision loops, and immutable historical gates.

## 6. Materialize revision context and publish one planning PR

- [x] 6.1 Materialize the OpenSpec change identity for the planning job even though it is not a one-artifact native operation, and include the run-scoped remote branch, recorded pull request, cumulative patch, prior results, bounded Linear human feedback, and bounded GitHub review feedback as untrusted task data.
- [x] 6.2 Extend signed attempt grants and the capability router so the simple planning job can invoke only `github.publish_planning_work_product`; reject generic publication, Linear actions, merges, other repositories, other changes, other branches, and expired or mismatched attempts.
- [x] 6.3 Implement `publish_planning_work_product` as a complete manifest replacement limited to `.openspec.yaml`, `proposal.md`, `specs/**/spec.md`, `design.md`, and `tasks.md` inside the service-authored change directory, including safe removal of stale planning files only within that directory.
- [x] 6.4 Validate the exact pull-request title and review-only body structure, reject copied Linear issue content, recompute the review notes' Flesch Reading Ease and Flesch-Kincaid grade, reject text outside the configured limits before any provider write, then create or update the one ready-for-review pull request on the run-scoped branch, reconcile partial file/PR success by stable operation identity, and persist its number separately from the GitHub database id.
- [x] 6.5 Recompute and store the sorted planning-manifest digest and remote head SHA after publication, and reject a completed agent result unless the exact successful/reconciled receipt and complete planning manifest are attributed to the same run and attempt.
- [x] 6.6 Add capability, adapter, materializer, and controller tests for the first publication, revision on the same PR, required PR fields, copied Linear content, readability boundary scores, score recomputation, stale-file deletion, ambiguous responses, request-digest conflicts, missing artifacts, forbidden paths, receipt mismatches, branch substitution, feedback bounds, and fresh-Sandbox reconstruction.

## 7. Merge and verify through trusted workflow actions

- [x] 7.1 Implement `github.merge_planning_pull_request` in the trusted Worker using the recorded repository, PR number, base `main`, remote head branch, expected head SHA, human-gate visit, and idempotent provider-operation identity.
- [x] 7.2 Reconcile ambiguous merge responses by reading the same pull request before retrying, and fail safely for closed-unmerged, changed-base, changed-head, conflict, required-policy rejection, or any pull request not recorded for the run.
- [x] 7.3 Implement `github.verify_planning_merge` as a separate read-back action that confirms the recorded PR merged, confirms the merge commit on `main`, fetches every approved planning path, and matches the stored manifest digest before writing its own receipt.
- [x] 7.4 Wire both action controllers into Workflow services so the simple graph reaches `done` only after exact merge and verification receipts, while incomplete or ambiguous operations remain non-successful and reconcilable.
- [x] 7.5 Add deterministic tests for successful merge/verification, replay, response loss, merge races, head/base substitution, conflicts, missing files, content drift, provider database-id versus PR-number handling, and absence of merge credentials from Sandbox prompts and artifacts.

## 8. Prove the complete graph deterministically

- [x] 8.1 Add an orchestration test that starts from a labeled enabled `Todo`, freezes `simple`, dispatches the first planning attempt, validates the exact rendered prompt and publication receipt, and reaches `Human Review` with one PR.
- [x] 8.2 Extend the test through `In Progress`, a fresh revision attempt, cumulative context restoration, same-branch publication, same-PR reconciliation, and a second visit to `Human Review`.
- [x] 8.3 Extend the test through `Merging`, trusted merge, independent `origin/main` verification, terminal success, complete D1 transition history, protected prompt evidence, complete R2 manifests, and confirmed Sandbox cleanup.
- [x] 8.4 Add sibling tests for unlabeled and disabled-selector full-workflow fallback, `Canceled`, unmapped/unauthorized repair, planning failure, missing receipts, merge failure, verification failure, Queue replay, and selector changes after allocation.
- [x] 8.5 Run strict OpenSpec validation, TypeScript tests and type checks, Python tests on every supported version, Ruff format/lint, Pyright, binding generation/checks, migration checks, `git diff --check`, and both Wrangler deploy dry-runs; fix only failures caused by this change and report unrelated baseline failures factually.

## 9. Deploy inactive and verify the safe default

- [ ] 9.1 Package the implementation, tasks, completed task checkboxes, tests, prompt artifact, provider-contract references, and deterministic evidence in one ready-for-review implementation PR linked to PR 54 and the three changed capabilities.
- [ ] 9.2 After implementation approval, apply the additive remote D1 migration and deploy the Workers with the simple selector still disabled; capture provider output and read back the definition registry, selector row, migration constraints, and unchanged full default.
- [ ] 9.3 Confirm existing active and historical runs retain their frozen definition digests, no labeled or unlabeled issue has been dispatched by the inactive selector, and no Sandbox or provider operation was created by deployment alone.

## 10. Prompt approval and provider-originated test-repository canary

- [ ] 10.1 Stop before enabling the selector or moving a test issue to `Todo`; present the exact static prompt, deterministic fully rendered first prompt, prompt SHA-256, and simple definition digest to the user and record explicit approval.
- [ ] 10.2 After approval, enable only the repository-scoped `simple-workflow` selector, create or prepare a real Linear test issue with the exact label, and capture visual proof before a human moves it to `Todo`.
- [ ] 10.3 Prove the provider-originated start delivery reached the Queue and Workflow, D1 froze the simple definition and label evidence, R2 retained the exact first rendered prompt and agent artifacts, and GitHub received one readable, correctly structured planning pull request with proposal, specs, design, and tasks only.
- [ ] 10.4 Exercise one real `In Progress` revision with bounded human feedback and prove a fresh Sandbox attempt updated the same branch and pull request before returning to `Human Review`.
- [ ] 10.5 Move the issue to `Merging` as the human authorization, then prove the trusted action merged the recorded head and the independent read-back found the approved planning digest on `origin/main` before the run reached success.
- [ ] 10.6 Query D1 and R2 for the complete selection, visit, transition, attempt, prompt, artifact, provider-operation, merge, verification, and cleanup records; retain Showboat output and sanitized screenshots and do not substitute synthetic ingress or unit tests for this E2E claim.
- [ ] 10.7 Disable the selector after the controlled canary unless continued activation is separately authorized, confirm no live Sandbox or pending cleanup remains, and attach the full provider, durable-state, and visual evidence to the implementation PR.
