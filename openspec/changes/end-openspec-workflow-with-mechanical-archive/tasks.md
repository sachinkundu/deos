## 1. Immutable Terminal Graph

- [x] 1.1 Advance the bundled workflow to version 10, route `openspec_verify` through `final_approval` directly to `sync_and_archive`, and remove active deploy/release-finalization nodes and job configuration.
- [x] 1.2 Remove the unused release-finalization prompt import from the current bundle while preserving parser compatibility for older frozen definitions.
- [x] 1.3 Add deterministic definition tests for the exact terminal tail, absent release nodes/jobs, native archive instruction, and immutable snapshot restoration.

## 2. Trusted Archive Continuation

- [x] 2.1 Fail archive attempt allocation closed when no completed cumulative patch reference is available.
- [x] 2.2 Add deterministic controller coverage for the archive-specific patch prerequisite and retain exact instruction, trusted change identity, digest verification, artifact, and cleanup coverage.
- [x] 2.3 Reconcile later GitHub publications on one forced attempt branch into its existing pull request with the new operation's exact marker.
- [x] 2.4 Make pending-attempt startup idempotent after a transient Sandbox-destruction failure by clearing the exact stale repository checkout before cloning.

## 3. Operator Documentation

- [x] 3.1 Update workflow-authoring and current-architecture documentation to describe final approval as the last authority gate and native archive as mechanical closure.
- [x] 3.2 Update deployment/canary guidance with version-10 registration, provider-originated proof, archive artifact inspection, release-node absence, Sandbox cleanup, and dispatch-disable checks.

## 4. Deterministic Validation

- [x] 4.1 Run focused definition, input-materialization, Sandbox-controller, orchestrator, and artifact tests.
- [x] 4.2 Run the complete TypeScript and Python test suites, lint/type/binding checks, strict OpenSpec validation, and Wrangler dry-runs.
- [x] 4.3 Inspect the complete diff for scope, generated files, secrets, and direct-main readiness.

## 5. Direct Delivery and Disabled Rollout

- [x] 5.1 Commit and push the user-authorized no-PR implementation directly to `main`.
- [x] 5.2 With trial dispatch disabled, deploy orchestration and verify the deployed Worker/container plus immutable version-10 definition registration in D1.

## 6. Provider-Originated Archive Canary

- [ ] 6.1 Create a deliberately small Linear/OpenSpec canary in the configured test project and trigger admission through a real provider-originated event.
- [ ] 6.2 Verify the same run selects version 10, proceeds through the native OpenSpec nodes, and waits at each configured human gate without an automated approval.
- [ ] 6.3 After a real authorized final approval, verify the same run executes exact `/opsx:archive`, restores the integrity-checked cumulative patch, archives and syncs the canary change, and reaches `done` / `succeeded`.
- [ ] 6.4 Capture D1, R2, Workflow, manifest, cleanup, transition-ledger, release-node-absence, and sanitized visual provider evidence in a repository evidence record.
- [ ] 6.5 Disable trial dispatch, read back disabled configuration, confirm no live canary Sandbox remains, and report the completed E2E proof.
