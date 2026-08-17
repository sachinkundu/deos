## 1. Typed OpenSpec Workflow Contract

- [x] 1.1 Add validated, canonical OpenSpec operation metadata to workflow jobs and immutable definition restoration.
- [x] 1.2 Replace repository-local OpenSpec system-action nodes with continue, apply, verify, and archive agent jobs while preserving external-effect system actions.
- [x] 1.3 Add a bounded OpenSpec agent prompt and pin the OpenSpec CLI in the Sandbox image.

## 2. Durable Repository Continuation

- [x] 2.1 Derive and validate one deterministic OpenSpec change identity from the trusted Linear issue input.
- [x] 2.2 Select the latest complete cumulative patch artifact for a run and persist its reference in the next immutable attempt job.
- [x] 2.3 Verify and apply the referenced patch to a clean checkout before Codex starts, failing closed on missing, mismatched, or unapplicable state.
- [x] 2.4 Capture tracked, deleted, and newly created untracked files through an isolated temporary Git index so cumulative patches preserve new OpenSpec artifacts.

## 3. Outcome and Receipt Evaluation

- [x] 3.1 Record whether an agent attempt has provider operations separately from whether its exact receipt set is complete.
- [x] 3.2 Allow receipt-free completed outcomes only for typed OpenSpec jobs, while preserving exact D1 receipt enforcement for attempted external effects and all ordinary successful agents.
- [x] 3.3 Preserve configured completed, blocked, and failed routing without allowing OpenSpec agent output to select workflow or Linear state.
- [x] 3.4 Require ordinary agents to publish an auditable provider work product or working note and copy exact operation IDs into their declared receipt list.
- [x] 3.5 Scope pre-release evidence verification to implementation evidence and prevent downstream verify, release, sync, or archive outputs from becoming circular prerequisites.

## 4. Deterministic Validation and Documentation

- [x] 4.1 Add definition, materializer, Sandbox continuation, replay, receipt-policy, and workflow progression tests for the new contract and failure paths.
- [x] 4.2 Update workflow authoring, deployment, and current-architecture documentation for native OpenSpec jobs and cumulative patch continuation.
- [x] 4.3 Run strict OpenSpec validation, Python and TypeScript tests, Ruff, type checking, generated-binding checks, and Wrangler dry-run validation.

## 5. Deployed Provider Canary

- [x] 5.1 Deploy the new immutable workflow version with trial dispatch disabled and verify bindings, definition registration, and package/image parity.
- [x] 5.2 Create a dedicated calculator-style Linear issue and use provider-originated transitions to advance the workflow through proposal, specs, design, tasks, and implementation in the controlled test repository.
- [x] 5.3 Verify D1 transitions, exact job instruction/change identity, cumulative R2 patch lineage, Sandbox cleanup, resulting repository artifacts, and OpenSpec verification; then disable dispatch.
