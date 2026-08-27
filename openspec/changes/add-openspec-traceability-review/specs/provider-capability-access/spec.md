## ADDED Requirements

### Requirement: Keep trace reviewers read-only

A trace review job SHALL have read-only access. It SHALL have no GitHub or Linear write grant. It SHALL get no raw provider secret, GitHub or Linear token, OpenRouter key, or Codex login data. An independent review job MAY receive one short-lived DEOS model capability token. That token SHALL be scoped to the exact run, attempt, saved provider, saved model, and Responses path. It MUST NOT authorize any business-data mutation. The job MUST NOT update a pull request. It MUST NOT post a check or Linear link. It also MUST NOT comment, approve, merge, or change flow state.

The independent Codex harness MAY use a narrow trusted Responses proxy. The proxy SHALL verify the capability token, pin the saved OpenRouter model, inject the raw provider key only inside the trusted Worker, and forward only the allowed model protocol. It SHALL expose no raw key. It SHALL durably record each provider turn and any protected diagnostic. It SHALL allow no business data change. Trusted flow steps SHALL own each needed provider change. They SHALL bind each change to the exact run, review, pull request, and head.

#### Scenario: Trace reviewer requests provider access

- **WHEN** an internal or independent reviewer requests a provider mutation
- **THEN** DEOS denies it before a provider call and records the safe result

#### Scenario: Review input contains a raw secret

- **WHEN** a trace review input would expose a raw provider or Codex secret
- **THEN** DEOS rejects the input and does not start the review with that data

#### Scenario: Independent Codex calls its model provider

- **WHEN** the read-only Codex harness sends an allowed Responses request with its short-lived capability token
- **THEN** the trusted proxy pins the saved OpenRouter model, injects the provider key outside the Sandbox, and records the provider turn

#### Scenario: Independent Codex changes the saved model

- **WHEN** the harness request names a provider or model other than the values frozen with the run
- **THEN** DEOS denies the request before OpenRouter is called

#### Scenario: Internal review passes

- **WHEN** the exact private candidate has passing internal proof
- **THEN** only the trusted publish step may create the planning pull request

#### Scenario: Independent review status is reported

- **WHEN** an independent review reaches a terminal outcome
- **THEN** trusted steps update the bound GitHub check and Linear link and save each provider receipt

#### Scenario: Provider target does not match the review

- **WHEN** a trusted report step names another run, pull request, or head
- **THEN** DEOS rejects it and does not post the wrong review state
