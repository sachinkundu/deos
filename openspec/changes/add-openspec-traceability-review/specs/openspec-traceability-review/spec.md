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

DEOS SHALL finish every required form, structure, path, and readability check before it starts a full semantic check or closed-set recheck. These checks SHALL report failures but MUST NOT edit the plan. A failure that needs a text change SHALL return the candidate to an author job. DEOS SHALL rerun the deterministic checks after that repair. Once a semantic result passes, no automated step may change the reviewed plan before its trusted publish or gate action.

#### Scenario: Readability check requests a wording change

- **WHEN** a current candidate fails a deterministic readability rule
- **THEN** an author job repairs it and all deterministic checks pass before DEOS starts the semantic check

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

The full self-check SHALL create one base finding set. Each later self-check SHALL use the same saved Codex model and thought level. It SHALL rate every base finding. Its state SHALL be `fixed`, `partially_fixed`, `still_present`, or `cannot_verify`. Each rating SHALL cite current proof. A recheck MUST NOT add, drop, or rewrite a base finding. DEOS SHALL derive the full result from the ratings. It SHALL use the shared round repair limit. A pass SHALL close the phase for its review input ID. If the shared three-turn limit is used first, DEOS MAY publish the exact valid plan with the open self-check findings marked for human judgment so that independent review can still run.

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

After the trusted post, DEOS SHALL run one full independent check. It SHALL use the exact planning pull request head. It SHALL call OpenRouter through the trusted DEOS model adapter. Its model SHALL be a supported model chosen in the DEOS settings page before the run. It SHALL not be the author coding agent's model. DEOS SHALL save the provider and model with the run and MUST NOT change them during that run. The independent check MAY disagree with the self-check. That difference SHALL be allowed and SHALL become part of its own base finding set. The review job MUST NOT change repo or provider state.

#### Scenario: Planning pull request is published

- **WHEN** the trusted post returns a pull request and exact head
- **THEN** DEOS starts one full outside check on the proposal and delta specs at that head

#### Scenario: Independent reviewer uses the author model

- **WHEN** the outside model is the author model
- **THEN** DEOS rejects the job before it can make accepted proof

#### Scenario: Independent model setting changes during a run

- **WHEN** a settings change selects another OpenRouter model after a run has started
- **THEN** the active run keeps its saved provider and model and only a later run uses the new setting

#### Scenario: Pull request advances during review

- **WHEN** the pull request head is not the head in a done outside check
- **THEN** DEOS marks the proof stale and does not use it for the human gate

### Requirement: Repair and recheck the same planning pull request

Each independent-review fix SHALL update the same planning pull request. All deterministic plan checks SHALL pass before either model rechecks it. The Codex self-check SHALL then inspect the exact new head with its saved model and thought level. It SHALL read the independent base findings, each changed block, and all linked blocks. It MUST NOT add a new finding during this closed-set recheck. The independent recheck SHALL then use the saved OpenRouter provider and model. It SHALL rate only its base findings. Each rating SHALL cite current proof. DEOS SHALL derive the full result from both checks on that head.

#### Scenario: Independent discovery finds a concern

- **WHEN** the full outside check finds an issue and a fix remains
- **THEN** a fresh author job gets those findings and may update the same branch and pull request before both models recheck that head

#### Scenario: First reviewer has not checked the repaired head

- **WHEN** an outside repair has no passing first-model recheck for its exact new head
- **THEN** DEOS keeps the work out of `Human Review` and does not count the old private-draft proof as current

#### Scenario: Independent recheck is complete

- **WHEN** both models recheck the same new head and rate each base finding with current proof
- **THEN** DEOS derives the result from both saved sets of ratings

#### Scenario: Model claims success while a finding remains open

- **WHEN** the model claims a pass but any finding is not fixed
- **THEN** DEOS rejects the pass and keeps the finding open; the round may reach the human gate only through the shared turn-limit escalation

### Requirement: Keep proof repair apart from plan repair

DEOS SHALL set one bound for repair of a bad sidecar or invalid review result. It SHALL set another shared bound for author fixes to the plan text. A proof repair SHALL not count as an author fix. It MUST NOT change the base finding set or the plan under review. When one review stage contradicts its own saved rating, DEOS SHALL compare the exact inputs and source changes. It SHALL reuse the prior result for an identical input. If no source change explains the conflict, it SHALL stop that automated loop and show both results to the person. A different finding or rating from the independent reviewer SHALL be allowed and MUST NOT be treated as a proof fault merely because it differs from the self-check.

#### Scenario: Sidecar fails its form checks

- **WHEN** a review result has bad links, hashes, ranges, quotes, or form
- **THEN** the review tool may retry within its proof limit against the same exact plan

#### Scenario: Proof repair changes plan meaning

- **WHEN** a proof retry changes the plan or the base finding set
- **THEN** DEOS rejects it and does not count it as valid proof or a plan fix

#### Scenario: Saved ratings conflict

- **WHEN** one review stage reopens its own fixed finding without a causal source change
- **THEN** DEOS keeps both proofs, starts no author fix or referee model, and marks the conflict for human judgment after the independent stage is complete

#### Scenario: Independent reviewer disagrees with the self-check

- **WHEN** the independent review finds a concern that the Codex self-check did not report
- **THEN** DEOS accepts it into the independent base finding set and may use a remaining shared repair turn

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

An allowed human change SHALL start a new review round for the same pull request. The new proposal and each changed spec SHALL pass all deterministic checks. The proof SHALL match their new exact forms. DEOS MAY return the issue to `Human Review` when both semantic stages pass or when the round uses all three shared author-repair turns and the independent review has completed on the current head. The gate SHALL show every open finding and proof conflict when it is reached by the turn limit. A person SHALL still be the only source of approval.

#### Scenario: Human asks for a planning revision

- **WHEN** an allowed person sends the plan gate back to `In Progress`
- **THEN** DEOS starts a new review round and checks the next update to the same pull request

#### Scenario: Agent review passes

- **WHEN** both checks pass for the live pull request head
- **THEN** DEOS may enter `Human Review` but does not approve or merge the plan

#### Scenario: Three repair turns end with open findings

- **WHEN** the round uses its third author-repair turn and the independent review of the current valid head still has an open finding
- **THEN** DEOS enters `Human Review` with a needs-judgment state and shows all open findings and conflicts without another author or model repair cycle
