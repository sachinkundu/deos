## ADDED Requirements

### Requirement: Protect Claude Pro review sign-in

The trusted runner SHALL keep protected Claude Pro sign-in data inside the trusted auth boundary used to start outside review. It MUST NOT expose that data in review input or saved proof. The review runtime MUST NOT receive an Anthropic API key, an OpenRouter key, paid credits, or another paid route.

#### Scenario: Saved sign-in is valid

- **WHEN** the trusted runner starts an allowed outside review with valid Claude Pro sign-in.
- **THEN** Claude signs in without an API key and the review may run.

#### Scenario: Sign-in cannot be used

- **WHEN** the saved sign-in data is absent, expired, revoked, or not for the set Pro account.
- **THEN** the attempt records an auth failure and makes no accepted review result.

#### Scenario: Review tries to enable paid use

- **WHEN** the review process requests an API key, paid credits, or another paid route.
- **THEN** the trusted runner denies that route and the review cannot pass.

#### Scenario: Sign-in data reaches proof

- **WHEN** review proof contains Claude sign-in data.
- **THEN** DEOS does not accept or show that unsafe proof.
