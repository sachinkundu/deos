## ADDED Requirements

### Requirement: End the delivery workflow after final approval and mechanical archive

The Workflow SHALL treat the final post-review human approval as the last authority-bearing gate in a newly selected workflow definition. An approved decision SHALL route the same run directly to a mechanical native OpenSpec archive agent and then to terminal `succeeded`; a rejected decision SHALL route the run to terminal `blocked`. After the approved decision, the graph MUST NOT dispatch another judgment-bearing agent, deployment action, release-finalization action, or human gate. The run MUST NOT reach terminal `succeeded` unless the archive attempt completes with its required durable artifacts and confirmed Sandbox cleanup.

#### Scenario: Final approval starts only mechanical closure

- **WHEN** an authorized human approves the final post-review gate
- **THEN** the Workflow records the decision and routes the same run directly to the native OpenSpec archive agent
- **AND** no deployment, release-finalization, additional review, or additional human-gate node is invoked

#### Scenario: Mechanical archive completes

- **WHEN** the native archive attempt completes with a complete artifact manifest and confirmed Sandbox cleanup
- **THEN** the Workflow records the archive attempt and its transition to `done`
- **AND** the run reaches terminal business status `succeeded`

#### Scenario: Final approval is rejected

- **WHEN** an authorized human rejects the final post-review gate
- **THEN** the Workflow records the decision and routes the run to terminal `blocked`
- **AND** it does not invoke the archive agent

#### Scenario: Mechanical archive does not complete cleanly

- **WHEN** the archive attempt is blocked, fails, has incomplete required artifacts, or lacks confirmed Sandbox cleanup
- **THEN** the Workflow routes the run to terminal `blocked`
- **AND** it does not report terminal business status `succeeded`

### Requirement: Preserve the selected terminal graph for every run

The system SHALL publish the terminal-archive graph as a new immutable workflow definition. A newly admitted run SHALL select the new definition, while an already-created run SHALL continue using its stored definition version and verified digest even when that older graph includes later release nodes.

#### Scenario: New run selects the terminal-archive graph

- **WHEN** a relevant provider-originated delivery creates a run after the new definition is active
- **THEN** the run stores the new definition version and digest
- **AND** its graph contains `evidence_verification -> openspec_verify -> final_approval -> sync_and_archive -> done` with rejection from `final_approval` to `blocked`
- **AND** its graph contains no `deploy` or `release_finalization` node

#### Scenario: Existing run resumes after the definition advances

- **WHEN** a run created under an older immutable definition resumes after the terminal-archive definition is deployed
- **THEN** the Workflow restores and verifies the older stored definition
- **AND** continues that run only through the graph selected at admission

### Requirement: Prove terminal archive through a provider-originated canary

The controlled rollout SHALL use one deliberately small repository-local OpenSpec canary admitted by a real Linear event. Durable evidence SHALL show that the same run waits at final approval, resumes after a real authorized human decision, performs native sync and archive, invokes no deployment or release-finalization node, records every genuine transition with corrected visit identity, and reaches terminal `succeeded`. Trial dispatch SHALL be disabled after the proof.

#### Scenario: Provider-originated canary succeeds

- **WHEN** a real Linear admission event creates the controlled canary run and an authorized human later approves its final gate
- **THEN** D1 records the admission, human decision, archive attempt, transition to `done`, and terminal `succeeded` state for the same run
- **AND** the transition ledger contains one row for every genuine traversal, including repeated edges
- **AND** no attempt or transition names a deployment or release-finalization node

#### Scenario: Canary archive output is inspected

- **WHEN** the successful canary archive manifest and cumulative repository patch are retrieved after Sandbox cleanup
- **THEN** their recorded digests verify
- **AND** the patch contains the canary change under `openspec/changes/archive/`
- **AND** the applicable main specifications contain the synchronized canary delta

#### Scenario: Controlled proof is complete

- **WHEN** the provider-originated canary evidence has been captured
- **THEN** trial dispatch is disabled and read back as disabled
- **AND** no live canary Sandbox remains active
