## ADDED Requirements

### Requirement: Start with the design and revise the plan after review

Some saved flows let the design author edit the plan after human review. In those flows, the first round SHALL give the author the design rules, the last approved proposal, all delta specs, and no prior design. The author SHALL first make only the design and SHALL keep the approved plan unchanged. On a later round, the author SHALL also get the current design draft. If an allowed person asks for a plan change at the design gate, the author MAY change the proposal, affected specs, and design. The author MUST keep the full plan and design in sync.

The trusted service SHALL keep these edits in the Design phase. It SHALL use the same design branch and pull request for each round. It MUST NOT reopen the Planning phase or its pull request.

#### Scenario: The first design round starts

- **WHEN** no design file exists for the change.
- **THEN** the author gets the design rules, the approved plan, and no prior design draft.
- **AND** the author keeps the approved proposal and delta specs unchanged.

#### Scenario: A person asks for plan and design edits

- **WHEN** an allowed person asks at the design gate for changes to the proposal, delta specs, and design.
- **THEN** the next design author updates them on the same design branch and pull request.
- **AND** the work returns to the design gate after its required checks.

#### Scenario: The approved plan needs no edit

- **WHEN** no person asks for a plan change at the design gate.
- **THEN** the design candidate keeps the approved proposal and delta specs unchanged.

### Requirement: Accept only a complete design candidate

The trusted service SHALL check the full plan and design before it posts the draft. It SHALL run the strict OpenSpec check for the named change. It SHALL prove that the proposal list and spec paths match.

The draft MAY change only `proposal.md`, files under `specs/`, and `design.md` in the named change. It MUST NOT change settings, tasks, code, main specs, archive files, or another change. A failed check SHALL keep its true cause. It SHALL block both the post and human review.

#### Scenario: A complete candidate passes

- **WHEN** the proposal, full delta spec set, and design are valid and use only allowed paths.
- **THEN** the trusted service may post them to the design pull request as one checked candidate.

#### Scenario: A required plan file is missing

- **WHEN** the candidate lacks the proposal or any delta spec named by the proposal.
- **THEN** the trusted service rejects the candidate and does not open the design gate.

#### Scenario: The proposal and specs do not match

- **WHEN** the proposal capability list and delta spec paths do not match.
- **THEN** the trusted service rejects the candidate and keeps the validation cause.

#### Scenario: The author changes a forbidden path

- **WHEN** the design author changes a file outside the allowed design candidate paths.
- **THEN** the trusted service rejects the candidate and posts no part of it.

### Requirement: Review the design against its candidate plan

Each design check that is due under the saved flow rules SHALL use one author result. That result SHALL hold the draft proposal, specs, and design. The check SHALL compare that plan with the last approved plan. Its proof SHALL name the plan hash, design hash, pull request head, and base.

Old proof MUST be shown as stale if the head or any draft file has changed. The flow MUST NOT claim that old proof checks new work. Human edits SHALL keep the review count set by the saved flow rules.

If a saved flow has no new semantic check for a later human edit, trusted checks and a fresh human choice SHALL be enough to reach merge. The gate SHALL state that no new semantic check ran. It SHALL show that old proof is stale. The person SHALL judge the new work.

#### Scenario: The first design changes the plan

- **WHEN** a first design candidate changes the approved proposal or a delta spec.
- **THEN** each due design check uses the changed plan and design as one review input.

#### Scenario: A later edit has no new semantic review

- **WHEN** the saved flow sends a later human edit straight back to the design gate after trusted checks.
- **THEN** the flow marks old review proof as stale for the new head.
- **AND** it does not claim that a new semantic review ran.

#### Scenario: Review inputs come from different candidates

- **WHEN** the plan, design, head, or base in a review result does not match one checked candidate.
- **THEN** the flow rejects that proof and does not use it to open the design gate.

### Requirement: Apply design plan revisions only to new flow versions

A new fixed flow version SHALL carry these plan edit rules. It SHALL also carry a design author prompt and pinned guidance that allow the same file scope. The job rules SHALL state that this prompt controls the edit scope. Skill text MUST NOT narrow or add to that scope.

Each run SHALL keep the graph, file scope, checks, gate rules, prompt, and pinned guidance saved at its start.

#### Scenario: A new run enters Design

- **WHEN** a new run selects a fixed version that allows design plan edits.
- **THEN** its design author gets the matching prompt and pinned guidance.
- **AND** it may use the combined candidate rules for the life of the run.

#### Scenario: An older run resumes

- **WHEN** a run began on a version that allows only `design.md` edits.
- **THEN** it keeps that file scope, prompt, guidance, and design rules.

#### Scenario: Skill text conflicts with the saved scope

- **WHEN** pinned skill text asks for a file scope that conflicts with the saved design job.
- **THEN** the job keeps its saved prompt and file scope.
