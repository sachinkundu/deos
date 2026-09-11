## ADDED Requirements

### Requirement: Record Claude review facts and show stop causes

Each outside review record SHALL store Claude Opus 5, high effort, the Claude Pro route, and the result as internal facts. A passed review view MUST NOT show those facts. A failed or stopped review view SHALL show only whether authentication failed, the Pro plan limit was reached, or the review failed. The saved proof and protected review view MUST NOT expose the setup token.

#### Scenario: Claude review passes

- **WHEN** an outside review saves a valid result from the real Claude cloud path.
- **THEN** its internal record stores the model, effort, Claude Pro route, and result, while the passed review view does not show them.

#### Scenario: Claude setup token fails

- **WHEN** an outside review cannot use its Claude setup token.
- **THEN** its record and protected view show an auth stop and do not show a passed review.

#### Scenario: Claude plan limit is met

- **WHEN** the Pro plan cannot run more work.
- **THEN** its record and protected view show a plan-limit stop and no fallback.

#### Scenario: Review fails

- **WHEN** the cloud call, result, or proof fails its checks.
- **THEN** its record and protected view show a review failure and do not show a passed review.
