## ADDED Requirements

### Requirement: Show the real progress of plan and design checks

The portal SHALL show the saved state of each check that a frozen flow needs for a plan or design. This rule covers both self-checks and outside reviews. Each check SHALL show one of five clear states: `Not started`, `Running`, `Needs work`, `Failed`, or `Passed`. The state SHALL apply to the current work version. The workflow map and details panel SHALL show the same state for the same check and work version.

`Not started` SHALL mean that no work on the check has begun for that version. `Running` SHALL mean that its current review job or final check is active. This state SHALL take the place of any prior result while the new work runs. `Needs work` SHALL mean that no check job is active and the last review result needs an author fix or reply. `Failed` SHALL mean that the stage ended without an accepted review result. `Passed` SHALL mean that all work for the check is done. Its proof SHALL match the current plan or design. No fix, reply, retry, or final check can still be due.

The portal SHALL use green checks and success text only for `Passed`. It SHALL show `Failed` with a red failure treatment, the state label, and a failure icon. A failed check MUST NOT have a green success cue. The other states MUST also appear as non-success states. The portal MUST NOT say that work is ready for human review until all checks for that work have passed. It MUST use saved flow and review facts. It MUST NOT guess a state from time, Linear state, or the fact that a pull request exists. These display rules MUST NOT change review rules, repair limits, or human approval rules.

A durable failed outcome SHALL hold the exact safe reason for its failure. The portal SHALL use that reason as the main error message. It SHALL name the failed stage. It SHALL show the exact retained safe category. It SHALL also show the saved exit code, timeout fact, and signal fact when they exist. Those process facts MUST stay within their saved bounds. The portal MUST NOT invent a fact that was not saved. A transcript or artifact link MAY support the message, but it MUST NOT replace the durable reason.

When the saved retry policy marks a transient failure as eligible, the workflow SHALL start a new attempt on its own, up to the saved retry bound. It MUST NOT retry a non-transient failure on its own. The portal SHALL offer `Retry stage` when the failed attempt is eligible for manual retry and no retry is active. When that action is not available, the portal SHALL state the saved reason why. Each retry SHALL create a new attempt at the failed stage in the same run. Completed earlier stages and all prior attempts SHALL stay intact and visible.

When a planning or design pull request has been published, the portal SHALL keep it visible after a later stage fails. The portal MUST NOT use the pull request to claim that the work reached human review. Wherever the portal shows that pull request, it SHALL show GitHub and BettaView actions together for the same pull request.

#### Scenario: A required check has not started

- **WHEN** a saved flow needs a plan or design check and no work on that check has begun for the current version.
- **THEN** the workflow map and details panel show `Not started` and show no success cue for that check.

#### Scenario: A required check is running

- **WHEN** the current plan or design check has an active review job or final check.
- **THEN** the workflow map and details panel show `Running` and do not mark the check as passed.

#### Scenario: A saved result needs author work

- **WHEN** no check job is active and the last saved review result for the current plan or design needs an author fix or reply.
- **THEN** the workflow map and details panel show `Needs work` and do not say that the work is ready for human review.

#### Scenario: A review stage fails

- **WHEN** a plan or design check ends without an accepted review result.
- **THEN** the workflow map and details panel show `Failed` with a red label and failure icon, and they show no green success cue.

#### Scenario: A failed process has saved facts

- **WHEN** a failed outcome holds a safe category and bounded exit, timeout, or signal facts.
- **THEN** the portal names the failed stage, shows the exact saved values, and uses the durable safe reason as the main error message.

#### Scenario: A failed process lacks an optional fact

- **WHEN** a failed outcome has no saved exit, timeout, or signal fact.
- **THEN** the portal does not invent the missing fact or use a transcript or artifact as the main error message.

#### Scenario: A transient failure can retry on its own

- **WHEN** the saved policy marks a transient stage failure as eligible and the automatic retry bound is not full.
- **THEN** the workflow starts a new attempt at that stage in the same run.

#### Scenario: A failure cannot retry on its own

- **WHEN** a stage failure is non-transient or its automatic retry bound is full.
- **THEN** the workflow does not start an automatic retry.

#### Scenario: Manual retry is available

- **WHEN** the failed attempt is eligible for manual retry and no retry is active.
- **THEN** the portal offers `Retry stage`.

#### Scenario: Manual retry is unavailable

- **WHEN** the failed attempt is not eligible for manual retry or a retry is active.
- **THEN** the portal does not offer another retry and explains the saved reason.

#### Scenario: A retry keeps prior work

- **WHEN** a new attempt starts at a failed stage.
- **THEN** the portal keeps all prior attempts and completed earlier stages intact and visible in the same run.

#### Scenario: A required check has passed

- **WHEN** the review work is done, its proof matches the current plan or design, and no fix, reply, or final check is due.
- **THEN** the workflow map and details panel show `Passed` and may show a green check and success text for that check.

#### Scenario: A new work version makes old proof stale

- **WHEN** a saved check result does not match the current plan or design.
- **THEN** the portal does not show that check as passed for the current work and does not use it to claim that human review is ready.

#### Scenario: A later stage fails after a pull request is published

- **WHEN** a published planning or design pull request exists and a later stage fails.
- **THEN** the portal keeps the pull request visible and does not say that it reached human review.

#### Scenario: A pull request is shown

- **WHEN** the portal shows a planning or design pull request.
- **THEN** it shows GitHub and BettaView actions together for that same pull request.

#### Scenario: All required checks have passed

- **WHEN** every check for the current plan or design has passed.
- **THEN** the workflow map and details panel may say that the work is ready for human review.

#### Scenario: A saved workflow does not require a check

- **WHEN** an old or later-round frozen flow does not need a given plan or design check.
- **THEN** the portal does not invent that check or use its absence to block human review.
