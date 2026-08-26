## Purpose

Check the meaning and scope of one OpenSpec proposal and its delta specs before a person sees the approval gate.

## ADDED Requirements

### Requirement: Review one exact private planning draft

DEOS SHALL run one full first check on the exact private plan. The plan SHALL have a valid proposal and all needed delta specs. The check SHALL use a fresh context. It SHALL use the same fixed model and thought level as the author. It SHALL inspect each named spec and each rule. The review job MUST NOT change the plan or any provider state.

#### Scenario: Private draft is ready for review

- **WHEN** the author gives a valid proposal and all needed delta specs
- **THEN** DEOS saves the exact file list and hash and starts one full first check

#### Scenario: Draft changes before discovery completes

- **WHEN** the saved plan does not match the hash named by the first check
- **THEN** DEOS rejects the result and does not post the draft

#### Scenario: Internal reviewer lacks fresh context

- **WHEN** the check needs the author's live job or unsaved notes
- **THEN** DEOS rejects the job as bad review proof

### Requirement: Keep internal repair and recheck bounded

The full first check SHALL create one base finding set. Each later first recheck SHALL use the same fixed model and thought level. It SHALL rate every base finding. Its state SHALL be `fixed`, `partially_fixed`, `still_present`, or `cannot_verify`. Each rating SHALL cite current proof. A recheck MUST NOT add, drop, or rewrite a base finding. DEOS SHALL derive the full result from the ratings. It SHALL stop at the set fix limit. It MUST post only a plan whose first-check findings are all fixed.

#### Scenario: Author repairs the private draft

- **WHEN** the full first check finds an issue and a fix remains
- **THEN** a fresh author job gets the exact accepted findings and may change the same private plan

#### Scenario: Internal recheck changes the finding set

- **WHEN** a recheck adds, drops, or changes a base finding
- **THEN** DEOS rejects it and keeps the plan private

#### Scenario: Internal findings are fixed

- **WHEN** a current recheck marks each base finding fixed
- **THEN** the trusted publish step may post that exact plan

#### Scenario: Internal repair limit is used

- **WHEN** a first-check finding stays open after the last fix
- **THEN** DEOS saves a stop result and does not post that plan

### Requirement: Independently review the exact published head

After the trusted post, DEOS SHALL run one full outside check. It SHALL use the exact planning pull request head. The check SHALL use a fixed model that is not the author model. It MAY reach a different view than the first check. It SHALL make its own base finding set. The review job MUST NOT change repo or provider state.

#### Scenario: Planning pull request is published

- **WHEN** the trusted post returns a pull request and exact head
- **THEN** DEOS starts one full outside check on the proposal and delta specs at that head

#### Scenario: Independent reviewer uses the author model

- **WHEN** the outside model is the author model
- **THEN** DEOS rejects the job before it can make accepted proof

#### Scenario: Pull request advances during review

- **WHEN** the pull request head is not the head in a done outside check
- **THEN** DEOS marks the proof stale and does not use it for the human gate

### Requirement: Repair and recheck the same planning pull request

Each outside fix SHALL update the same planning pull request. Each outside recheck SHALL use the same fixed review model and thought level. It SHALL rate only its base findings. Each rating SHALL cite current proof. DEOS SHALL derive the full result from those ratings.

#### Scenario: Independent discovery finds a concern

- **WHEN** the full outside check finds an issue and a fix remains
- **THEN** a fresh author job gets those findings and may update the same branch and pull request

#### Scenario: Independent recheck is complete

- **WHEN** a recheck rates each base finding with proof from the new head
- **THEN** DEOS derives the result from the saved ratings

#### Scenario: Model claims success while a finding remains open

- **WHEN** the model claims a pass but any finding is not fixed
- **THEN** DEOS rejects the pass and keeps the work out of the human gate

### Requirement: Keep proof repair apart from plan repair

DEOS SHALL set one bound for repair of a bad sidecar or review result. It SHALL set another bound for author fixes to the plan text. A proof repair SHALL not count as an author fix. It MUST NOT change the base finding set or the plan under review.

#### Scenario: Sidecar fails its form checks

- **WHEN** a review result has bad links, hashes, ranges, quotes, or form
- **THEN** the review tool may retry within its proof limit against the same exact plan

#### Scenario: Proof repair changes plan meaning

- **WHEN** a proof retry changes the plan or the base finding set
- **THEN** DEOS rejects it and does not count it as valid proof or a plan fix

### Requirement: Start a new review round after human feedback

An allowed human change SHALL start a new review round for the same pull request. The new proposal and each changed spec SHALL pass both checks. The proof SHALL match their new exact forms. Only then may DEOS return the issue to `Human Review`. A person SHALL still be the only source of approval.

#### Scenario: Human asks for a planning revision

- **WHEN** an allowed person sends the plan gate back to `In Progress`
- **THEN** DEOS starts a new review round and checks the next update to the same pull request

#### Scenario: Agent review passes

- **WHEN** both checks pass for the live pull request head
- **THEN** DEOS may enter `Human Review` but does not approve or merge the plan
