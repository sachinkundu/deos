## ADDED Requirements

### Requirement: Protect local Claude review auth

The trusted runner SHALL use the user's existing local Claude auth JSON to start outside review, as Codex does. It MUST NOT ask the user to sign in. It SHALL keep the auth JSON inside the trusted runner and MUST NOT expose it in review input or saved proof. The review runtime MUST NOT receive an Anthropic API key or an OpenRouter key. The flow SHALL NOT inspect or manage the user's Anthropic API billing state.

#### Scenario: Local auth JSON is valid

- **WHEN** the trusted runner starts an allowed outside review with valid local Claude auth JSON.
- **THEN** Claude uses that account session with no sign-in prompt or API key, and the review may run.

#### Scenario: Local auth JSON cannot be used

- **WHEN** the local auth JSON is absent, expired, revoked, invalid, or not for the set Pro account.
- **THEN** the attempt records an auth failure and makes no accepted review result.

#### Scenario: Review asks for an API route

- **WHEN** the review process requests an Anthropic API key or an OpenRouter key.
- **THEN** the trusted runner does not supply it and the review cannot pass.

#### Scenario: Local auth JSON reaches proof

- **WHEN** review proof contains the local Claude auth JSON or data from it.
- **THEN** DEOS does not accept or show that unsafe proof.
