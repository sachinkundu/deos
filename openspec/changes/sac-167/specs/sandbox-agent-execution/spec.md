## ADDED Requirements

### Requirement: Protect Claude setup-token auth

The trusted runner SHALL use the user's existing Claude setup token to start outside review. It MUST NOT ask the user to sign in. It SHALL keep the setup token inside the trusted runner and MUST NOT expose it in review input or saved proof. The review runtime MUST NOT receive an Anthropic API key or an OpenRouter key. The flow SHALL NOT inspect or manage the user's Anthropic API billing state. Trusted provisioning SHALL read `CLAUDE_SETUP_TOKEN` and store its value as a protected cloud secret. Only the trusted Claude client process SHALL receive it as `CLAUDE_CODE_OAUTH_TOKEN`. The review Sandbox MUST NOT receive it. DEOS MUST NOT copy, refresh, or take ownership of the Mac's interactive login. An expired or revoked setup token SHALL require operator replacement outside the workflow; the workflow MUST NOT generate a replacement or prompt for sign-in.

#### Scenario: Setup token is valid

- **WHEN** the trusted runner starts an allowed outside review with a valid Claude setup token.
- **THEN** Claude uses that account session with no sign-in prompt or API key, and the review may run.

#### Scenario: Setup token cannot be used

- **WHEN** the setup token is absent, expired, revoked, invalid, or not for the set Pro account.
- **THEN** the attempt records an auth failure and makes no accepted review result.

#### Scenario: Review asks for an API route

- **WHEN** the review process requests an Anthropic API key or an OpenRouter key.
- **THEN** the trusted runner does not supply it and the review cannot pass.

#### Scenario: Setup token reaches proof

- **WHEN** review proof contains the Claude setup token or data from it.
- **THEN** DEOS does not accept or show that unsafe proof.

#### Scenario: Setup token is provisioned

- **WHEN** the operator provisions the token from `CLAUDE_SETUP_TOKEN`.
- **THEN** DEOS protects it as a cloud secret and supplies it only to the trusted Claude client as `CLAUDE_CODE_OAUTH_TOKEN`.

#### Scenario: Mac login remains in use

- **WHEN** DEOS starts a review with the setup token.
- **THEN** it does not read, copy, or refresh the Mac's interactive login.

#### Scenario: Setup token needs replacement

- **WHEN** the setup token expires or is revoked.
- **THEN** the review stops with an auth failure until the operator replaces the protected token outside the workflow.
