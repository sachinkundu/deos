## ADDED Requirements

### Requirement: Show Claude review facts and stop causes

Each outside review record SHALL show Claude Opus 5, high effort, Claude Pro billing, the no-paid-use state, and the result. A stopped review SHALL show whether sign-in, the Pro plan limit, or the review failed. The saved proof and protected review view MUST NOT expose sign-in data.

#### Scenario: Claude review passes

- **WHEN** an outside review saves a valid result from the real Claude cloud path.
- **THEN** its record and protected view show the model, effort, Pro billing source, no-paid-use state, and result.

#### Scenario: Claude sign-in fails

- **WHEN** an outside review cannot use its saved Claude Pro sign-in.
- **THEN** its record shows an auth stop and does not show a passed review.

#### Scenario: Claude plan limit is met

- **WHEN** the Pro plan cannot run more work.
- **THEN** its record shows a plan-limit stop and no paid fallback.

#### Scenario: Review fails

- **WHEN** the cloud call, result, or proof fails its checks.
- **THEN** its record shows a review failure and does not show a passed review.
