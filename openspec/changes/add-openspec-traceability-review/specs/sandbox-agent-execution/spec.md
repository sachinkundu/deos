## ADDED Requirements

### Requirement: Run fixed read-only trace review attempts

Each trace review job SHALL name its Codex model and thought level. These values SHALL be fixed in the run data. The trusted runner SHALL pass those exact values to Codex. It SHALL also save them with the result. It MUST NOT use a model default from an image, account, or user. Each review SHALL run in a new DEOS Sandbox with a fresh context. It SHALL use one fixed BettaView tool version and one exact plan. The tool SHALL act only as a review part inside DEOS. It MUST NOT own a second flow system or full portal. The job SHALL have no provider write grant.

#### Scenario: Review job starts

- **WHEN** DEOS dispatches an internal or independent trace review
- **THEN** the job gets its saved model, thought level, tool version, plan ID, read-only inputs, and result rules

#### Scenario: Review space was used before

- **WHEN** a trace review job is given a Sandbox from an earlier job
- **THEN** DEOS rejects the job and creates a new review space

#### Scenario: Review tool tries to own the flow

- **WHEN** the review tool tries to act as another flow system or full portal
- **THEN** DEOS rejects that use and keeps control of the job and review view

#### Scenario: Model settings are missing

- **WHEN** a trace review job lacks a named model or thought level
- **THEN** the runner rejects the job before Codex starts

#### Scenario: Reviewer requests a mutation

- **WHEN** a trace reviewer tries to change repo or provider state
- **THEN** DEOS denies the request and the review cannot pass

#### Scenario: Review output violates its contract

- **WHEN** the reviewer gives no result or a result that breaks its rules
- **THEN** DEOS records a failed review attempt and does not advance the planning gate
