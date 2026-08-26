## ADDED Requirements

### Requirement: Keep trace reviewers read-only

A trace review job SHALL have read-only access. It SHALL have no GitHub or Linear write grant. It MUST NOT update a pull request. It MUST NOT post a check or a Linear link. It also MUST NOT comment, approve, merge, or change flow state. Trusted flow steps SHALL own each needed provider change. They SHALL bind each change to the exact run, review, pull request, and head.

#### Scenario: Trace reviewer requests provider access

- **WHEN** an internal or independent reviewer requests a provider mutation
- **THEN** DEOS denies it before a provider call and records the safe result

#### Scenario: Internal review passes

- **WHEN** the exact private candidate has passing internal proof
- **THEN** only the trusted publish step may create the planning pull request

#### Scenario: Independent review status is reported

- **WHEN** an independent review reaches a terminal outcome
- **THEN** trusted steps update the bound GitHub check and Linear link and save each provider receipt

#### Scenario: Provider target does not match the review

- **WHEN** a trusted report step names another run, pull request, or head
- **THEN** DEOS rejects it and does not post the wrong review state
