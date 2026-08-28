## Purpose

Check the meaning and scope of one OpenSpec proposal and its delta specs before a person sees the approval gate.

## ADDED Requirements

### Requirement: Review one exact private planning draft

DEOS SHALL run one full Codex self-check on the exact private plan. The plan SHALL have a valid proposal and all needed delta specs. The self-check SHALL use a fresh context. It MUST NOT use the author coding agent's live context or unsaved notes. DEOS SHALL save the author coding agent's Codex model identity and thought level. These two fields SHALL be the full author-match settings. The self-check SHALL match both. It SHALL use the fixed review prompt. It SHALL use a read-only tool and permission profile for its reviewer role. It SHALL inspect each named spec and each rule. The review job MUST NOT change the plan or any provider state.

#### Scenario: Private draft is ready for review

- **WHEN** the author gives a valid proposal and all needed delta specs
- **THEN** DEOS saves the exact file list and hash and starts one full first check

#### Scenario: Draft changes before discovery completes

- **WHEN** the saved plan does not match the hash named by the first check
- **THEN** DEOS rejects the result and does not post the draft

#### Scenario: Internal reviewer lacks fresh context

- **WHEN** the check needs the author's live job or unsaved notes
- **THEN** DEOS rejects the job as bad review proof

### Requirement: Finish deterministic plan checks before semantic review

DEOS SHALL finish every required form, structure, path, and readability check before it starts a full semantic check or closed-set recheck. The author supervisor SHALL run these checks before it accepts completion. The checks SHALL report failures but MUST NOT edit the plan. A failure that needs a text change SHALL resume the same Codex session in the same Sandbox and author attempt with the exact trusted failure. DEOS SHALL rerun the deterministic checks after that repair. This local correction MUST NOT start another workflow visit, Sandbox, or semantic repair turn. Trusted Worker code SHALL repeat the same checks after the attempt exits. A mismatch between the supervisor and Worker checks SHALL stop as a tooling fault and MUST NOT start another author attempt. Once a semantic result passes, no automated step may change the reviewed plan before its trusted publish or gate action.

#### Scenario: Readability check requests a wording change

- **WHEN** a current candidate fails a deterministic readability rule
- **THEN** the same author session repairs it and all deterministic checks pass inside that attempt before DEOS starts the semantic check

#### Scenario: Trusted verification disagrees with the author hook

- **WHEN** trusted Worker verification rejects a candidate that the author completion hook accepted
- **THEN** DEOS records a tooling fault, starts no semantic check, and does not create another author attempt

#### Scenario: Automated step tries to edit a passed candidate

- **WHEN** a semantic result has passed and a later automated step requests a plan text change
- **THEN** DEOS rejects that step and does not silently continue the passed review phase

### Requirement: Reuse an accepted result for an identical review input

DEOS SHALL derive one review input ID from the complete reviewed file list and hashes, source inventory, stage, mode, round, model provider, model, thought setting, prompt version, and BettaView tool version. A full check SHALL include a discovery marker. A recheck SHALL include its base finding set. Before dispatch, DEOS SHALL look up that ID. An accepted terminal result for the same ID SHALL be reused. Reuse MUST NOT start a Sandbox, call the model, consume a job try, or create another semantic result. A trusted step MAY bind that result to a new pull request head only when it proves that every reviewed file path and hash is unchanged.

#### Scenario: The same recheck is requested again

- **WHEN** a dispatch request has an input ID with an accepted terminal result
- **THEN** DEOS returns the saved result and records a reuse without starting another review job

#### Scenario: Pull request head changes but reviewed files do not

- **WHEN** the head differs but the complete reviewed file list and hashes are unchanged
- **THEN** a trusted step may add a new head binding to the accepted result without another model call

#### Scenario: One reviewed byte changes

- **WHEN** any reviewed file path or hash differs from the accepted input
- **THEN** DEOS treats it as a new review input and does not guess that the meaning stayed the same

### Requirement: Keep internal repair and recheck bounded

The full self-check SHALL create one base finding set. Each later self-check SHALL use the same saved Codex model and thought level. It SHALL rate every base finding. Its state SHALL be `fixed`, `partially_fixed`, `still_present`, or `cannot_verify`. Each rating SHALL cite current proof. A recheck MUST NOT add, drop, or rewrite a base finding. DEOS SHALL derive the full result from the ratings. It SHALL use the self-check repair limit. A pass SHALL close the phase for its review input ID. If the three-turn self-check limit is used first, DEOS MAY publish the exact valid plan with the open self-check findings marked for human judgment so that independent review can still run.

#### Scenario: Author repairs the private draft

- **WHEN** the full first check finds an issue and a fix remains
- **THEN** a fresh author job gets the exact accepted findings and may change the same private plan

#### Scenario: Internal recheck changes the finding set

- **WHEN** a recheck adds, drops, or changes a base finding
- **THEN** DEOS rejects it and keeps the plan private

#### Scenario: Internal findings are fixed

- **WHEN** a current result has no findings or marks each base finding fixed
- **THEN** DEOS closes that review phase and the trusted publish step may post that exact plan

#### Scenario: Closed phase receives the same input

- **WHEN** another review dispatch names the input ID of a closed phase
- **THEN** DEOS reuses its accepted result and does not start another semantic job

#### Scenario: Later rating reopens a fixed finding

- **WHEN** a later result changes a saved `fixed` rating to a non-fixed rating in the same round
- **THEN** the result identifies the exact changed bytes and explains the causal difference or DEOS rejects it as inconsistent proof

#### Scenario: Recheck conflicts with an earlier pass

- **WHEN** a downgrade cannot tie its concern to a change after the accepted rating
- **THEN** DEOS keeps both proofs, starts no author repair or referee model, and marks the conflict for human judgment

#### Scenario: Self-check proof stays inconsistent

- **WHEN** the self-check contradicts its own accepted rating without a matching source change
- **THEN** DEOS saves both results, starts no referee, publishes the exact valid plan, and marks the conflict for human judgment after independent review

#### Scenario: Internal repair limit is used

- **WHEN** a first-check finding stays open after the last fix
- **THEN** DEOS saves the open finding and may post the exact valid plan for independent review with a human-judgment warning

### Requirement: Independently review the exact published head

After the trusted post, DEOS SHALL run one full independent check. It SHALL use the exact planning pull request head. It SHALL run through a pinned Codex coding-agent harness configured to use a capability-scoped DEOS Responses proxy and the saved OpenRouter model. Its model SHALL be a supported model chosen in the DEOS settings page before the run. It SHALL not be the author coding agent's model. DEOS SHALL save the harness version, provider, and model with the run and MUST NOT change them during that run. The independent check MAY disagree with the self-check. That difference SHALL be allowed and SHALL become part of its own base finding set. The review job MUST NOT change repo or provider state. Trusted DEOS code SHALL validate the final structured result even when the provider does not enforce the requested output schema.

#### Scenario: Planning pull request is published

- **WHEN** the trusted post returns a pull request and exact head
- **THEN** DEOS starts one full outside check on the proposal and delta specs at that head

#### Scenario: Independent reviewer starts its model loop

- **WHEN** the outside check needs model reasoning or a read-only tool call
- **THEN** one fresh Codex coding-agent session uses only the saved OpenRouter model and the capability-scoped Responses proxy

#### Scenario: Provider accepts an invalid final shape

- **WHEN** the OpenRouter model returns a result that does not satisfy the trusted review schema
- **THEN** DEOS rejects that result as proof and uses only the bounded proof-repair path

#### Scenario: Independent reviewer uses the author model

- **WHEN** the outside model is the author model
- **THEN** DEOS rejects the job before it can make accepted proof

#### Scenario: Independent model setting changes during a run

- **WHEN** a settings change selects another OpenRouter model after a run has started
- **THEN** the active run keeps its saved provider and model and only a later run uses the new setting

#### Scenario: Pull request advances during review

- **WHEN** the pull request head is not the head in a done outside check
- **THEN** DEOS marks the proof stale and does not use it for the human gate

### Requirement: Compare two independent directional claim sets

Each full semantic review SHALL use two fresh model passes over the same exact source inventory. The proposal-first pass SHALL map every proposal statement to the requirements that implement it. The requirement-first pass SHALL map every requirement to the proposal statements that justify it. The second pass MUST NOT receive the first pass result. DEOS SHALL preserve both claim sets and reconcile them by host-derived source identities. It SHALL mark a link `confirmed`, `proposal_only`, or `requirement_only`. A one-sided link SHALL be accepted as semantic disagreement and MUST NOT be treated as malformed proof.

#### Scenario: Both passes find the same relationship

- **WHEN** each directional pass independently links the same proposal statement and requirement
- **THEN** DEOS records one confirmed link with both model rationales

#### Scenario: Only one pass finds a relationship

- **WHEN** one directional pass links a proposal statement and requirement but the other does not
- **THEN** DEOS records the one-sided claim as disputed review information and preserves which pass made it

#### Scenario: A pass cites an unknown source item

- **WHEN** a directional result names a proposal statement or requirement outside the trusted inventory
- **THEN** DEOS rejects that result as malformed proof and may use its bounded proof-repair path

### Requirement: Send independent review to the author before human review

A structurally valid independent review SHALL complete successfully even when it contains findings or disputed links. DEOS SHALL send every independent finding, confirmed link, disputed link, and rationale to one fresh author response job. The author SHALL record `applied`, `declined`, or `no_change` for every finding and disputed link. It SHALL give a short reason. If it changes the plan, trusted deterministic checks SHALL pass before DEOS updates the same planning pull request. DEOS MUST NOT require the independent reviewer to withdraw its judgment before the human gate.

#### Scenario: Independent discovery finds a concern

- **WHEN** the full outside check finds an issue or one-sided relationship
- **THEN** a fresh author job gets the complete review and records its disposition for each item

#### Scenario: Author applies a concern

- **WHEN** the author changes the plan in response to the independent review
- **THEN** trusted checks validate the change, update the same pull request, and link the new head to the original review and author disposition

#### Scenario: Author declines a concern

- **WHEN** the author decides that an independent finding or disputed link should not change the plan
- **THEN** DEOS preserves the concern and the author's reason and releases both to human review

#### Scenario: Independent semantic concerns remain

- **WHEN** the independent review is structurally valid and has findings or disputed links
- **THEN** the external-review workflow outcome is `pass` while the semantic concerns remain visible for the author and human

### Requirement: Upgrade only one compatible failed review tail

DEOS MAY upgrade a failed version 11 run to version 12 only when its latest failed attempt is `independent_discovery`, its Sandbox cleanup is `destroyed`, and the completed path ends after the trusted initial pull request publication. The target SHALL be the exact registered bundled version 12 definition. DEOS SHALL preserve the run ID, planning candidate, pull request, reviewed files, model settings, and all prior evidence. It SHALL record the source and target definition IDs, versions, and digests and the old and new Workflow instance IDs. It SHALL create a new version 12 Workflow instance for the same run at `independent_discovery` and MUST NOT restart the old version 11 instance. Every other cross-version retry SHALL fail before mutation.

#### Scenario: Version 11 failed at the compatible boundary

- **WHEN** an authenticated operator retries the latest cleaned-up version 11 `independent_discovery` failure against the registered version 12 definition
- **THEN** DEOS keeps the completed author, self-check, candidate, and pull request proof and starts the version 12 independent review and author-response tail on the same run

#### Scenario: Requested upgrade is not the approved shape

- **WHEN** the run, node, attempt, cleanup state, source definition, target definition, or completed prefix differs from the one compatible handoff
- **THEN** DEOS rejects the request before changing D1 or creating a Workflow instance

### Requirement: Keep proof repair apart from plan repair

DEOS SHALL set one bound for repair of a bad sidecar or invalid review result. It SHALL set another bound for self-check author fixes to the plan text. A proof repair SHALL not count as an author fix. It MUST NOT change the base finding set or the plan under review. When the self-check contradicts its own saved rating, DEOS SHALL compare the exact inputs and source changes. It SHALL reuse the prior result for an identical input. If no source change explains the conflict, it SHALL stop that automated loop and show both results to the person. A different finding or rating from the independent reviewer SHALL be allowed and MUST NOT be treated as a proof fault merely because it differs from the self-check.

#### Scenario: Sidecar fails its form checks

- **WHEN** a review result has unknown sources, invalid ranges, bad hashes, unsafe values, or malformed form
- **THEN** the review tool may retry within its proof limit against the same exact plan

#### Scenario: Directional claims disagree

- **WHEN** the proposal-first and requirement-first passes do not claim the same relationship
- **THEN** DEOS accepts the one-sided semantic claim and does not spend a proof-repair attempt

#### Scenario: Proof repair changes plan meaning

- **WHEN** a proof retry changes the plan or the base finding set
- **THEN** DEOS rejects it and does not count it as valid proof or a plan fix

#### Scenario: Saved ratings conflict

- **WHEN** one review stage reopens its own fixed finding without a causal source change
- **THEN** DEOS keeps both proofs, starts no author fix or referee model, and marks the conflict for human judgment after the independent stage is complete

#### Scenario: Independent reviewer disagrees with the self-check

- **WHEN** the independent review finds a concern that the Codex self-check did not report
- **THEN** DEOS accepts it into the independent finding set, asks the author for a disposition, and sends both views to human review without an independent recheck

### Requirement: Constrain each plan repair

Each base finding SHALL name the exact source ranges that an author may change. The ranges SHALL be inside the full proposal or spec blocks cited by that finding. All text outside those ranges MUST stay byte-for-byte the same. DEOS SHALL check the patch before it starts a recheck. The recheck SHALL read each changed range, its full blocks, and all blocks joined to them by the two-way trace map. If the changed text adds any new gap, conflict, scope error, extra rule, or unsupported claim, the related base finding MUST NOT pass. The same rule SHALL apply if a change harms a saved trace link.

#### Scenario: Repair stays in the saved ranges

- **WHEN** an author changes only the exact ranges saved for a base finding
- **THEN** DEOS may start a closed-set recheck on the new exact plan

#### Scenario: Repair changes unrelated plan text

- **WHEN** an author changes any plan byte outside the saved ranges
- **THEN** DEOS rejects the patch and does not let a closed-set recheck approve it

#### Scenario: Repair creates another defect

- **WHEN** changed text adds a new defect in its full block or any linked block
- **THEN** the recheck keeps the related base finding open even if its first cited issue was fixed

### Requirement: Start a new review round after human feedback

An allowed human change SHALL start a new review round for the same pull request. The new proposal and each changed spec SHALL pass all deterministic checks. The proof SHALL match their new exact forms. DEOS MAY return the issue to `Human Review` after the self-check gate, one completed independent review, a complete author disposition set, and pull request read-back. The gate SHALL show every open finding, directional dispute, author disposition, and proof conflict. A person SHALL still be the only source of approval.

#### Scenario: Human asks for a planning revision

- **WHEN** an allowed person sends the plan gate back to `In Progress`
- **THEN** DEOS starts a new review round and checks the next update to the same pull request

#### Scenario: Agent review passes

- **WHEN** both checks pass for the live pull request head
- **THEN** DEOS may enter `Human Review` but does not approve or merge the plan

#### Scenario: Three repair turns end with open findings

- **WHEN** the round uses its third author-repair turn and the independent review of the current valid head still has an open finding
- **THEN** DEOS enters `Human Review` with a needs-judgment state and shows all open findings and conflicts without another author or model repair cycle
