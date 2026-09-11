## Purpose

Give each first OpenSpec plan and design a short review cycle that ends with clear proof and a human choice.

## ADDED Requirements

### Requirement: Run one bounded self-review in each author step

For the first plan and the first design, DEOS SHALL start one review subagent in the live author job. It SHALL check the full valid draft.

If the first check finds issues, the live author SHALL get the full issue set and one fix turn. A review subagent SHALL then check each item in that same set once. It MUST NOT add a new issue. No other self-review SHALL run for that phase. DEOS SHALL keep each item that is still open for later review.

#### Scenario: First check has no issues

- **WHEN** the first self-review returns a valid result with no issues.
- **THEN** DEOS ends self-review for that phase.

#### Scenario: Author fixes the issue set

- **WHEN** the first self-review returns one or more valid issues.
- **THEN** the live author gets one fix turn, and a subagent checks that same issue set once.

#### Scenario: Recheck finds an issue still open

- **WHEN** the one recheck marks an item from the first issue set as still open.
- **THEN** DEOS ends self-review and keeps that item for the independent review and the human gate.

#### Scenario: Recheck reports a new issue

- **WHEN** the one recheck reports an issue that is not in the first issue set.
- **THEN** DEOS rejects the new issue and does not start a new fix turn.

### Requirement: Run one independent review for each first published phase

After self-review ends, DEOS SHALL post the first valid plan or design. It SHALL run one independent review of that posted work for the phase. One valid result SHALL close independent review for that phase.

The author SHALL respond to each valid concern and MAY change the work. DEOS MUST NOT ask the independent reviewer to check that response or the changed work. It SHALL keep the reviewed work, each concern, the response, and any later work clear for the human gate.

#### Scenario: Independent review has no concerns

- **WHEN** the one independent review returns a valid result with no concerns.
- **THEN** DEOS saves the result and prepares the phase for human review.

#### Scenario: Author applies a concern

- **WHEN** the author applies a valid concern and changes the posted work.
- **THEN** DEOS checks and posts the change and starts no new independent review.

#### Scenario: Author does not change the work

- **WHEN** the author does not change the work for a valid concern.
- **THEN** DEOS keeps the concern and response for human judgment.

### Requirement: Send later human edits straight back to the human gate

An allowed person SHALL be able to request plan or design edits as often as needed. DEOS SHALL send each request to the author. Trusted checks SHALL validate the changed files and read back the posted work.

DEOS SHALL then return the phase to its human gate. It MUST NOT run a new self-review or independent review for a human edit. It SHALL show past review proof as old proof and MUST NOT claim that it checks the new work.

#### Scenario: Person asks for a plan edit

- **WHEN** a person sends the plan back from its human gate.
- **THEN** DEOS returns the changed plan after trusted checks with no new semantic review.

#### Scenario: Person asks for a design edit

- **WHEN** a person sends the design back from its human gate.
- **THEN** DEOS returns the changed design after trusted checks with no new semantic review.

#### Scenario: Person asks for more edits

- **WHEN** a person sends the same phase back again.
- **THEN** DEOS sends the work to the author again and keeps the same no-new-review rule.

#### Scenario: Later work is shown with old proof

- **WHEN** a human edit changes the work after the first review cycle.
- **THEN** DEOS shows that the old proof does not cover the new work.

### Requirement: Keep approval with a person

DEOS SHALL open each human gate only after all required work for that visit is valid and posted. Open self-review issues and independent concerns SHALL be shown to the person. They MUST NOT block the gate once the set review cycle, author response, checks, and read-back are complete. Only an allowed person SHALL approve a merge.

#### Scenario: Review issues remain open

- **WHEN** review issues remain after the set author response.
- **THEN** DEOS opens the human gate with those issues shown for judgment.

#### Scenario: Agent output looks like approval

- **WHEN** an author, reviewer, check, or comment looks like an approval.
- **THEN** DEOS ignores it and waits for an allowed person's choice.
