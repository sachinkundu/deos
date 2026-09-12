## MODIFIED Requirements

### Requirement: Execute each agent attempt in an isolated bounded environment

The system SHALL run each agent attempt in an isolated environment with an
explicit attempt identity, controlled repository and revision, and lifecycle
outcome linked to the workflow correlation identifier. A replacement or
follow-up agent execution MUST use a new attempt identity and MUST NOT rely on
files or processes left by a prior attempt. It SHALL restore required work only
from verified durable inputs.

A provider-call retry within a live attempt SHALL retain the logical turn
identity and record a distinct try. It MUST use the shared recovery policy and
MUST NOT restart already completed tool work. Retrying collection or validation
of saved output MUST NOT be treated as a new agent execution.

#### Scenario: Controlled repository is prepared

- **WHEN** a workflow dispatches an agent attempt
- **THEN** the environment contains the configured repository at the recorded revision and associates the environment and attempt with the workflow run

#### Scenario: Attempt is retried

- **WHEN** policy permits a failed or interrupted agent execution to be retried
- **THEN** the retry receives a distinct attempt identity and a clean environment while remaining linked to the same run, logical turn, saved policy, and remaining budget

#### Scenario: A fresh agent continues review work

- **WHEN** the Workflow dispatches a follow-up agent to address review feedback on work produced by an earlier attempt
- **THEN** the new attempt receives the recorded repository, branch and revision, review feedback, prior structured results, and durable working-note and artifact references without requiring the earlier sandbox to remain active

#### Scenario: A live agent retries one provider call

- **WHEN** the common policy permits a failed provider call to run again within the same live attempt
- **THEN** the system records the new try under the same logical turn and preserves prior accepted tool results
