## ADDED Requirements

### Requirement: Run saved read-only trace review attempts

Each trace review job SHALL name its model provider, model, and thought level or provider equivalent. These values SHALL be fixed in the run data. The Codex self-check SHALL use the author coding agent's saved Codex model and thought level. The independent check SHALL use OpenRouter and the supported model chosen in the DEOS settings page before the run. The trusted runner SHALL pass the exact saved values to the right model adapter. It SHALL save them with the result. It MUST NOT use a model default from an image, account, or user. Each review SHALL use a new DEOS Sandbox with a fresh context for its exact plan and fixed BettaView tool version. The trusted OpenRouter adapter MAY make the independent model call, but the Sandbox and prompt MUST NOT receive the raw OpenRouter key. The tool SHALL act only as a review part inside DEOS. It MUST NOT own a second flow system or full portal. The job SHALL have no GitHub or Linear write grant.

#### Scenario: Review job starts

- **WHEN** DEOS dispatches an internal or independent trace review
- **THEN** the job gets its saved provider, model, thought setting, tool version, plan ID, read-only inputs, and result rules

#### Scenario: Accepted review input is dispatched again

- **WHEN** DEOS already has an accepted terminal result for the same review input ID
- **THEN** the dispatcher returns that result without creating a Sandbox or starting Codex

#### Scenario: Review space was used before

- **WHEN** a trace review job is given a Sandbox from an earlier job
- **THEN** DEOS rejects the job and creates a new review space

#### Scenario: Review tool tries to own the flow

- **WHEN** the review tool tries to act as another flow system or full portal
- **THEN** DEOS rejects that use and keeps control of the job and review view

#### Scenario: Model settings are missing

- **WHEN** a trace review job lacks its required provider, model, or thought setting
- **THEN** the runner rejects the job before a model call starts

#### Scenario: Reviewer requests a mutation

- **WHEN** a trace reviewer tries to change repo or provider state
- **THEN** DEOS denies the request and the review cannot pass

#### Scenario: Review output violates its contract

- **WHEN** the reviewer gives no result or a result that breaks its rules
- **THEN** DEOS records a failed review attempt and does not advance the planning gate
