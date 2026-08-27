## ADDED Requirements

### Requirement: One delivery attempt produces the complete reviewable change
The simple workflow's delivery agent SHALL use the service-authored OpenSpec change identity to create or revise the proposal, every required delta specification, design, tasks, implementation, and validation in one agent attempt. It SHALL publish those files as one governed pull request and SHALL report completion only after the provider capability returns a successful or reconciled receipt for that exact work product. It MUST NOT deploy, merge, approve, archive, alter Linear state, or omit required planning artifacts.

#### Scenario: First delivery attempt succeeds
- **WHEN** the delivery agent can complete the requested work and all required validation passes
- **THEN** one attempt publishes one pull request containing the complete OpenSpec change, implementation, tests, and validation evidence

#### Scenario: Planning or implementation is incomplete
- **WHEN** a required OpenSpec artifact, implementation task, test, or strict validation result is missing or failing
- **THEN** the attempt returns blocked or failed and the workflow does not advance to Human Review

#### Scenario: Human requests a revision
- **WHEN** the Human Review gate returns the run to delivery work
- **THEN** a fresh attempt restores the governed branch, complete change, prior result, and review feedback and updates the same pull request

#### Scenario: Agent requests a merge or deployment
- **WHEN** the agent attempts to merge, deploy, approve, archive, or transition Linear
- **THEN** the trusted boundary rejects the request and records a safe capability denial

#### Scenario: Work product receipt is absent
- **WHEN** the agent result claims completion without the exact accepted provider operation receipt
- **THEN** the attempt is not accepted as completed and Human Review is not entered
