## ADDED Requirements

### Requirement: Execute native OpenSpec operations as repository-local agent work

The trusted runner SHALL dispatch each configured OpenSpec node as a sandbox agent job with the workflow-declared native OpenSpec instruction and a deterministic change identity derived by the trusted input materializer. It SHALL record the instruction, change identity, and any prior repository-state artifact in the immutable attempt job specification. A fresh attempt SHALL restore the latest integrity-verified cumulative repository patch for the run before executing the instruction and MUST NOT depend on a prior sandbox, process, or mutable in-memory state.

#### Scenario: First planning operation starts a change

- **WHEN** a configured OpenSpec continue job starts for a change that is not present in the controlled repository
- **THEN** the agent receives the exact change identity, scaffolds that change through OpenSpec, and creates only the next artifact permitted by native OpenSpec status and instructions

#### Scenario: Follow-up operation restores repository state

- **WHEN** a later OpenSpec or review job starts after an earlier attempt produced a cumulative repository patch
- **THEN** the trusted runner verifies the patch against its durable digest, applies it to a clean checkout of the configured base revision, and records the patch artifact reference in the new attempt job specification

#### Scenario: Cumulative patch contains newly created artifacts

- **WHEN** an agent creates repository files that remain untracked in its checkout
- **THEN** trusted patch capture includes those files without mutating the checkout's real Git index, and the next clean attempt restores them from the cumulative patch

#### Scenario: Prior repository patch cannot be trusted

- **WHEN** the latest repository patch is missing, has the wrong digest, or cannot be applied cleanly to the configured base revision
- **THEN** the new attempt fails before Codex starts and the Workflow follows the node's configured failed edge without accepting partial repository state

#### Scenario: Native planning progression is requested

- **WHEN** the workflow dispatches the native OpenSpec continue instruction
- **THEN** the agent uses OpenSpec status and artifact instructions to create or revise exactly the next required proposal, specification, design, or task artifact for the supplied change identity

#### Scenario: Native implementation or verification is requested

- **WHEN** the workflow dispatches the native OpenSpec apply or verify instruction
- **THEN** the agent applies or verifies the supplied change using the native OpenSpec task and context contract and reports completed, blocked, or failed through the declared result schema

#### Scenario: Release finalization is requested

- **WHEN** the workflow dispatches the configured OpenSpec release-finalization instruction after its provider prerequisites are complete
- **THEN** the agent performs the native sync and archive progression for the supplied change and reports the result without selecting a workflow edge or Linear state

#### Scenario: Next consumer rejects an artifact

- **WHEN** an OpenSpec job reports completed but the artifact it produced is missing or invalid for the next configured consumer
- **THEN** that consumer reports its normal non-success outcome and the Workflow follows only the corresponding configured edge
