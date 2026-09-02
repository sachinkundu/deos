## Purpose

Check each OpenSpec design before human review and bind clear review proof to the exact design pull request version.

## ADDED Requirements

### Requirement: Self-check the first design before publication

The first valid design draft SHALL stay private while a read-only self-check checks it against the approved plan and the repo guidance from its base commit. The self-check SHALL use the same saved model and reasoning level as the design author.

The design MUST NOT be published or shown for human review until the self-check has a valid result. A failed check or invalid result SHALL block the next step.

#### Scenario: First design passes its self-check

- **WHEN** the first design has no open self-check concern and the self-check result is valid.
- **THEN** the flow may publish that design for its independent review.

#### Scenario: Self-check finds a design gap

- **WHEN** the self-check finds that the design does not fit the approved plan or repo guidance.
- **THEN** the flow sends the concern to the design author and checks the repaired draft before publication.

#### Scenario: Self-check cannot produce valid proof

- **WHEN** the self-check or a repaired draft has no valid result.
- **THEN** the flow does not publish that draft and does not enter the design human gate.

### Requirement: Independently review the first published design

After the self-check, the flow SHALL publish the design. A read-only independent reviewer SHALL check the exact pull request head against the approved plan and the repo guidance from the design base. It SHALL use the outside model saved with the run.

The design author SHALL receive each valid concern and SHALL record whether it was applied, declined, or needed no text change. A concern is advice and MUST NOT approve or reject the design. If the response changes the design, the flow SHALL publish the change and run an independent check on the new head.

#### Scenario: Independent review has no concern

- **WHEN** the first published design gets a valid independent result with no concern.
- **THEN** the flow binds that result to the exact head and may prepare the design for human review.

#### Scenario: Author applies an independent concern

- **WHEN** the author changes the design after the first independent result.
- **THEN** the flow publishes the change and checks its new exact head before human review.

#### Scenario: Author declines an independent concern

- **WHEN** the author declines a valid concern.
- **THEN** the flow keeps the concern and response in the review record and does not treat the review as failed.

### Requirement: Independently review every later design change

Each design change requested at the human gate SHALL start a new design review round on the same pull request. The flow SHALL not repeat the first-draft self-check. It SHALL publish the changed design, read back the new head, and run a fresh independent review before the design returns to a person.

The author SHALL respond to each concern as it does for the first design. If that response changes the head, the flow SHALL run the final independent check on the new head. The flow SHALL repeat this rule for every later human change round.

#### Scenario: Person asks for the first design change

- **WHEN** an allowed person sends the design gate from `Human Review` to `In Progress`.
- **THEN** the flow revises the same design pull request and runs an independent review, but no self-check, before it returns to `Human Review`.

#### Scenario: Person asks for another design change

- **WHEN** a later design round is sent back for more work.
- **THEN** the flow starts another round and again checks the new exact head before human review.

#### Scenario: Later independent review is incomplete

- **WHEN** the later round has no valid independent result for its current head.
- **THEN** the flow does not return that round to the design human gate.

### Requirement: Bind review proof to its exact input

DEOS SHALL save each design review result with its design, approved plan, repo base, model, review round, result, and evidence. An independent result SHALL also name the exact pull request head that it checked.

Proof SHALL be current only while those saved facts still match. A changed design, plan, base, or pull request head SHALL make old proof stale.

#### Scenario: Pull request head changes

- **WHEN** the design pull request head no longer matches an accepted independent result.
- **THEN** DEOS marks that result stale and requires current proof before human review.

#### Scenario: Approved plan changes

- **WHEN** the plan hashes or design base no longer match the review input.
- **THEN** DEOS does not claim that the old result checks the new design context.

### Requirement: Show the checked design and its proof

An allowed person SHALL be able to see each design review result, its evidence, and the exact pull request head that was checked. The view SHALL mark stale proof and SHALL make clear when a later round did not need a self-check. It MUST NOT claim that a review result is human approval.

#### Scenario: First design is ready for a person

- **WHEN** both required checks are complete and the independent proof matches the current head.
- **THEN** the person can see both results, the exact head, and their evidence before making a choice.

#### Scenario: Later design is ready for a person

- **WHEN** a later round has current independent proof for its head.
- **THEN** the person can see that result and that the first-draft self-check did not run in this round.

#### Scenario: Person opens stale proof

- **WHEN** the saved result does not match the current design head or input.
- **THEN** the view marks it stale and does not present its check as current.

### Requirement: Keep design approval with a real person

The flow SHALL enter the design human gate only after all reviews needed for that round are complete and current for the design pull request head. Only a real person SHALL approve the design merge.

An author result, review result, check, or comment MUST NOT approve the merge.

#### Scenario: Current review proof reaches the gate

- **WHEN** all required design checks are complete for the current head.
- **THEN** the flow enters the design human gate and waits for a real person's decision.

#### Scenario: Automation looks like approval

- **WHEN** an agent, review job, check, or comment looks like an approval.
- **THEN** the flow keeps the design gate waiting and does not merge the pull request.
