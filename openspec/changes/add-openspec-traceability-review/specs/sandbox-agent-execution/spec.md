## ADDED Requirements

### Requirement: Run saved read-only trace review attempts

Each trace review job SHALL name its coding-agent harness and version, model provider, model, and thought level or provider equivalent. These values SHALL be fixed in the run data. Both semantic review stages SHALL run through the pinned Codex coding-agent harness. The self-check SHALL use the author coding agent's saved OpenAI-backed Codex model and thought level. The independent check SHALL configure Codex with OpenRouter and the supported model chosen in the DEOS settings page before the run. The trusted runner SHALL pass the exact saved values and MUST NOT use a model default from an image, account, or user. Each review SHALL use a new DEOS Sandbox with a fresh context for its exact plan and fixed BettaView tool version. The independent Sandbox MAY receive a short-lived DEOS model capability token, but the Sandbox and prompt MUST NOT receive the raw OpenRouter key. The Codex process SHALL have only read-only repository tools. The tool SHALL act only as a review part inside DEOS. It MUST NOT own a second flow system or full portal. The job SHALL have no GitHub or Linear write grant. Trusted DEOS code SHALL validate the final structured output independently of provider-side schema enforcement.

#### Scenario: Review job starts

- **WHEN** DEOS dispatches an internal or independent trace review
- **THEN** the job gets its pinned Codex harness, saved provider, model, thought setting, tool version, plan ID, read-only inputs, and result rules

#### Scenario: Independent Codex needs a read-only tool

- **WHEN** the OpenRouter-backed Codex session inspects the exact plan
- **THEN** it may use only the configured read-only tools and it cannot change repository bytes

#### Scenario: Provider-side output schema is not enforced

- **WHEN** the OpenRouter-backed Codex session finishes with malformed structured output
- **THEN** the trusted result validator rejects it and the job cannot advance the review phase

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
