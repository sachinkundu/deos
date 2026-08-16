## 1. Runtime Contract and Durable Schema

- [x] 1.1 Pin one exact `@cloudflare/sandbox@next` release and matching container image, add the Workflow/Sandbox/R2 bindings, and regenerate checked Worker types.
- [x] 1.2 Add the versioned `workflow.deos.yaml` bundle, prompt files, result schemas, loader validation, canonical digesting, and deterministic definition tests.
- [x] 1.3 Add additive D1 migrations for immutable definitions, orchestration runs, dispatch intents, event inbox rows, transitions, attempts, credential leases, provider operations, artifact manifests, diagnostics, and cleanup work items.

## 2. Authenticated Event Dispatch

- [x] 2.1 Extend Linear ingress translation with actor type and prior-state evidence, enqueue every signed issue-state change for configured projects, and preserve existing HMAC, timestamp, delivery-id, and HTTP 200 invariants.
- [x] 2.2 Implement deterministic lineage, run sequence, Workflow instance, attempt, Sandbox, and operation identities plus D1 repository operations for run allocation and compare-and-set updates.
- [x] 2.3 Replace the direct Linear mutation consumer with dispatch-intent reconciliation that looks up or creates exactly one Cloudflare Workflow and routes later events through a deduplicated D1 inbox.
- [x] 2.4 Add deterministic dispatch tests for duplicate deliveries, lost create responses, failed mapping persistence, later active-run events, unmatched events, and a new run after a terminal run.

## 3. Executable Workflow State Machine

- [x] 3.1 Implement the typed workflow graph evaluator for agent, system-action, human-gate, loop, and terminal nodes without allowing agent-selected edges or state names.
- [x] 3.2 Implement the Cloudflare Workflow entrypoint that reloads D1 authority on every step, commits graph transitions with compare-and-set, and waits for deduplicated Linear events.
- [x] 3.3 Implement Workflow-owned Linear transition receipts using the app actor and ordered signed-delivery evidence, including human-gate decisions, unauthorized-actor repair, and manual reconciliation for ambiguity.
- [x] 3.4 Add deterministic state-machine tests for autonomous continuation, follow-up agents, loops, human approval/rejection, invalid results, provider prerequisites, duplicate events, repair, and concurrent newer human intent.

## 4. Supervised Sandbox Agent Attempts

- [x] 4.1 Build the pinned Sandbox image and trusted supervisor with Codex, fixed staging paths, JSONL output, schema-constrained final results, heartbeat files, and `danger-full-access` inside the disposable environment.
- [x] 4.2 Implement Sandbox process start/recovery with argv, explicit cwd/env, durable job specifications, heartbeat reconciliation, the 24-hour absolute limit, fresh retry attempts, and terminal destruction.
- [x] 4.3 Implement leased ChatGPT authentication encryption, protected R2 seed/refresh handling, conditional replacement, and failure-closed credential cleanup without exposing auth through argv, env, telemetry, or artifacts.
- [x] 4.4 Implement mechanical artifact collection with required-file/schema/size checks, credential rejection, SHA-256 verified create-only R2 writes, immutable manifests, and post-cleanup retrieval verification.
- [x] 4.5 Add deterministic Sandbox controller, liveness, auth lease/envelope, result validation, artifact policy, ambiguous R2 write, and cleanup tests using injectable platform boundaries.

## 5. Credentialless Provider Capabilities

- [x] 5.1 Implement schema-checked capability requests, trial-scope authorization, stable operation receipts, duplicate/ambiguous reconciliation, and denial before provider calls.
- [x] 5.2 Implement the repository-scoped GitHub work-product adapter with short-lived installation credentials, stable branch/PR markers, and sanitized durable receipts.
- [x] 5.3 Implement Linear shared-note and artifact-reference adapters while rejecting every agent-requested state transition; keep Workflow-only transitions and cleanup work-item updates separate.
- [x] 5.4 Add deterministic capability tests for allowed and denied targets/actions, credential isolation, duplicate effects, partial success, ambiguous responses, and required-receipt gating.

## 6. Operations, Telemetry, and Documentation

- [x] 6.1 Extend bounded structured telemetry across dispatch, Workflow, Sandbox, Codex outcome, artifacts, provider receipts, Linear repair, and cleanup without per-heartbeat or sensitive-content logs.
- [x] 6.2 Implement D1-known Sandbox reconciliation, the authenticated provider-inventory audit endpoint, and stable Linear cleanup work items for associated and standalone orphans.
- [x] 6.3 Update deployment, rollback, operator inspection, workflow authoring, credential bootstrap, and living architecture documentation plus the scheduled provider-inventory audit workflow.
- [x] 6.4 Run the complete deterministic Python and TypeScript suites, lint, type checking, generated-binding checks, migration checks, and strict OpenSpec validation.

## 7. Deployed Integration and Provider Proof

- [x] 7.1 Deploy additive resources with trial dispatch disabled, apply migrations, and verify binding/package/image parity through read-only provider inspection.
- [x] 7.2 Run a real bounded Sandbox/Codex integration attempt, preserve refreshed auth and checksum-verified R2 artifacts, and prove explicit Sandbox destruction.
- [x] 7.3 Run and label a synthetic signed-ingress proof through the deployed Queue, Workflow, Sandbox, D1, R2, and provider-capability path.
- [x] 7.4 Enable one test-project canary and use Linear MCP to trigger a provider-originated delivery through Workflow, Codex, GitHub/Linear work products, Human Approval, artifacts, and cleanup.
- [x] 7.5 Capture sanitized Linear and GitHub visual evidence plus Showboat deployment, D1, Workflow, Sandbox, R2, and telemetry evidence; attach it to the final implementation PR.
- [x] 7.6 Complete every task checkbox, inspect the full diff, and publish one ready-for-review implementation PR linked to SAC-91 and approved planning PRs #18, #19, and #20.
