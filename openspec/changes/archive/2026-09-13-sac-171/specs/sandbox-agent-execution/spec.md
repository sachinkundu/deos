## ADDED Requirements

### Requirement: Use the run tier for every agent sandbox

The trusted runner SHALL create each author and review sandbox with the tier saved on its run. This rule SHALL cover the first attempt, each later review attempt, and every retry.

Tier choice MUST NOT change the agent role, model route, review rule, or human gate. If the saved tier cannot be used, the runner MUST NOT switch to another tier or change the saved run.

#### Scenario: Author work starts

- **WHEN** a run sends work to an author.
- **THEN** the runner creates the author sandbox with the tier saved on that run.

#### Scenario: Review work starts

- **WHEN** the same run sends work to a self-reviewer or an independent reviewer.
- **THEN** the runner creates the review sandbox with the same saved tier.

#### Scenario: Agent work is retried

- **WHEN** policy retries an author or review attempt.
- **THEN** the runner creates the new sandbox with the same saved tier.

#### Scenario: Saved tier cannot be used

- **WHEN** sandbox creation fails for the run's saved tier.
- **THEN** the runner does not use another tier or change the saved run.

#### Scenario: Basic run reaches a human gate

- **WHEN** a Basic run finishes the work needed for its next human gate.
- **THEN** the workflow applies the same agent, model, review, and approval rules as a Standard-2 run.
