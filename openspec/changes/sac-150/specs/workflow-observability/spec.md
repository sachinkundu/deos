## ADDED Requirements

### Requirement: Show the real progress of plan and design checks

The portal SHALL show the saved state of each check that a frozen flow needs for a plan or design. This rule covers both self-checks and outside reviews. Each check SHALL show one of four clear states: `Not started`, `Running`, `Needs work`, or `Passed`. The state SHALL apply to the current work version. The workflow map and details panel SHALL show the same state for the same check and work version.

`Not started` SHALL mean that no work on the check has begun for that version. `Running` SHALL mean that its current review job or final check is active. This state SHALL take the place of any prior result while the new work runs. `Needs work` SHALL mean that no check job is active and the last result needs an author fix, reply, or retry. `Passed` SHALL mean that all work for the check is done. Its proof SHALL match the current plan or design. No fix, reply, retry, or final check can still be due.

The portal SHALL use green checks and success text only for `Passed`. It MUST show all other states as non-success states. It MUST NOT say that work is ready for human review until all checks for that work have passed. It MUST use saved flow and review facts. It MUST NOT guess a state from time, Linear state, or the fact that a pull request exists. These display rules MUST NOT change review rules, repair limits, or human approval rules.

#### Scenario: A required check has not started

- **WHEN** a saved flow needs a plan or design check and no work on that check has begun for the current version.
- **THEN** the workflow map and details panel show `Not started` and show no success cue for that check.

#### Scenario: A required check is running

- **WHEN** the current plan or design check has an active review job or final check.
- **THEN** the workflow map and details panel show `Running` and do not mark the check as passed.

#### Scenario: A saved result needs author work

- **WHEN** no check job is active and the last saved result for the current plan or design needs an author fix, reply, or retry.
- **THEN** the workflow map and details panel show `Needs work` and do not say that the work is ready for human review.

#### Scenario: A required check has passed

- **WHEN** the review work is done, its proof matches the current plan or design, and no fix, reply, or final check is due.
- **THEN** the workflow map and details panel show `Passed` and may show a green check and success text for that check.

#### Scenario: A new work version makes old proof stale

- **WHEN** a saved check result does not match the current plan or design.
- **THEN** the portal does not show that check as passed for the current work and does not use it to claim that human review is ready.

#### Scenario: All required checks have passed

- **WHEN** every check for the current plan or design has passed.
- **THEN** the workflow map and details panel may say that the work is ready for human review.

#### Scenario: A saved workflow does not require a check

- **WHEN** an old or later-round frozen flow does not need a given plan or design check.
- **THEN** the portal does not invent that check or use its absence to block human review.
