## 1. Durable gate and work-product state

- [x] 1.1 Add an additive D1 migration for design work products, design candidates, and visit-scoped human gate bindings with strict keys, checks, and foreign keys.
- [x] 1.2 Add typed D1 stores for deterministic design branches, design publication and merge receipts, accepted design candidates, and gate-visit read-back.
- [x] 1.3 Bind each plan or design Human Review visit to its work type, pull request, branch, base, and approved head before the Linear gate transition.
- [x] 1.4 Claim a human decision against the exact open gate binding in the same guarded transaction that advances the run.
- [x] 1.5 Add migration and store tests that prove old rows are unchanged, duplicate or mismatched writes fail closed, and foreign-key checks stay empty.

## 2. Checked plan merge

- [x] 2.1 Extend the trusted GitHub adapter to read a saved pull request, default branch, and allowlisted files at an exact commit without exposing credentials.
- [x] 2.2 Add trusted plan-merge verification that checks the saved pull request identity, approved head, merge commit, default-branch reachability, and every accepted proposal/spec manifest entry.
- [x] 2.3 Persist the plan merge verification receipt and block design allocation when provider or repository proof is missing or mismatched.
- [x] 2.4 Add a bounded repair notice and exact retry path for `planning_merge_files_unproved` without creating or merging another pull request.
- [x] 2.5 Test successful, reconciled, ambiguous, closed, wrong-head, wrong-base, conflict, missing-file, changed-file, and duplicate verification paths.

## 3. Design-only agent and candidate

- [x] 3.1 Add a typed design OpenSpec job and prompt that uses `/opsx:continue`, has no provider access, and permits only the named change's `design.md`.
- [x] 3.2 Materialize the approved proposal, complete delta specs, prior accepted design, bounded review feedback, and allowlisted repository guidance from the checked base commit.
- [x] 3.3 Start design Sandboxes from the checked plan merge commit and restore only the hash-verified cumulative patch selected by D1.
- [x] 3.4 Add supervisor completion checks for the exact design path, strict OpenSpec validation, whitespace, and required design sections.
- [x] 3.5 Build, persist, read back, and index immutable design candidates and validation receipts under separate R2 and D1 identities.
- [x] 3.6 Reject absent designs, extra changed paths, plan/spec edits, tasks or app code, invalid OpenSpec, unsafe guidance, bad review replies, and Worker/supervisor verification mismatches.
- [x] 3.7 Add deterministic unit and integration tests for first design attempts, revisions, context bounds, candidate hashing, R2 ambiguity, and candidate reuse rules.

## 4. Trusted design publication and merge

- [x] 4.1 Add a GitHub design publisher that creates the deterministic run branch at the checked commit, writes only `design.md`, and opens one ready pull request to `main`.
- [x] 4.2 Read back and persist the design branch, base, head, open pull request identity, design hash, and provider receipt before Human Review.
- [x] 4.3 Reconcile lost or repeated publication calls to the same saved branch and pull request without deleting approved plan files or creating duplicates.
- [x] 4.4 Update the same design pull request for each revision and post one idempotent reply to every affected root human review thread without resolving it.
- [x] 4.5 Add a trusted design merge action that requires the active design gate binding and approved head, performs one merge request and read-back, and records the merge commit before success.
- [x] 4.6 Test first publish, revision publish, incomplete replies, wrong pull request, wrong head/base, closed/draft pull requests, ambiguous calls, prior merges, rejected merges, and duplicate actions.

## 5. Workflow graph and lifecycle

- [x] 5.1 Advance `simple-traceability` to the next immutable version with plan verification, design author, publish, review, revision, merge, and terminal nodes.
- [x] 5.2 Route plan approval only to plan merge/check and design approval only to design merge, while keeping both gates on the visible Human Review state.
- [x] 5.3 Keep cancellation, unknown state changes, late deliveries, and replayed deliveries scoped to the active saved gate visit.
- [x] 5.4 Allow eligible failed design author or publication work to retry without replaying the completed plan and without reusing a destroyed Sandbox.
- [x] 5.5 Register and select the new default definition through the existing scheduled deployment path while preserving all older frozen snapshots and digests.
- [x] 5.6 Add definition, evaluator, orchestrator, lifecycle, inbox, stage-retry, and completion-reconciler tests for the full plan-to-design path and both review loops.

## 6. Workflow view

- [x] 6.1 Extend the portal data model with safe design work-product and gate-visit fields selected only from D1.
- [x] 6.2 Map the frozen new graph to planning, independent review, shared human approval, plan merge/check, design work, design merge/check, and completion stages.
- [x] 6.3 Show all plan and design gate visits in the shared Human Review stage, highlight the active or selected visit, and display its saved artifacts and pull request.
- [x] 6.4 Show design revision return edges and cycle counts from saved design rounds, and keep older graphs free of inferred design stages.
- [x] 6.5 Add portal model, manifest, API, and UI tests for active design work, both gate visits, revision loops, merge progress, successful completion, safe links, and old-run compatibility.

## 7. Repository checks and operator documentation

- [x] 7.1 Update current architecture and operator documentation for the two-gate default flow, separate work products, trusted checks, retry rules, and rollback order.
- [x] 7.2 Generate checked Worker bindings if configuration types change and verify migration ordering, deployment scripts, and route selection read-back.
- [x] 7.3 Run focused Python, Worker, portal, migration, and OpenSpec tests while implementing each slice.
- [x] 7.4 Run the full Python matrix, Ruff, TypeScript checks, Worker tests, portal tests and build, generated-binding check, strict OpenSpec validation, and `git diff --check`.

## 8. Provider-originated sample-project proof

- [x] 8.1 Read back the live sample-project route, selected definition, digest, dispatch state, active runs, and provider access before deployment or canary mutation.
- [x] 8.2 Deploy the D1 migration, Worker, Workflow definition, and portal with sample-project dispatch disabled, then read back the deployed versions and selected digest.
- [x] 8.3 Enable only the DEOS sample-project route and create a real Linear issue for a CLI that searches Google and uses an LLM to return a concise two-paragraph summary of found articles.
- [x] 8.4 Drive the real signed Linear flow through plan generation, Human Review, plan merge, checked plan proof, design generation, and the separate design Human Review gate.
- [x] 8.5 Add a root design review comment, request a design change through Linear, and prove the same design pull request is updated with an open thread reply.
- [x] 8.6 Approve the design merge through Linear and prove the run reaches saved terminal success with two distinct gate visits, pull requests, approved heads, and merge receipts.
- [x] 8.7 Prove the sample repository ends with the generated proposal, all delta specs, and design, with no tasks, app code, deployment, or archive output from the workflow.
- [x] 8.8 Capture sanitized D1, R2, Linear, GitHub, Cloudflare Workflow, Sandbox cleanup, foreign-key, and Access-protected portal screenshot evidence.
- [x] 8.9 Disable sample-project dispatch, read back the safe rollback state, and attach the executable evidence and screenshots to the final implementation pull request.
