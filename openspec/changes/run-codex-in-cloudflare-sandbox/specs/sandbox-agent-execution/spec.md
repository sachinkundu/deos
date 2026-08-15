## Purpose

Run one attributable Codex step in a bounded isolated environment while preserving a machine-readable result and durable evidence after the transient environment is removed.

## ADDED Requirements

### Requirement: Execute each agent attempt in an isolated bounded environment

The system SHALL run each agent attempt in an isolated environment with an explicit attempt identity, controlled repository and revision, execution deadline, configured outbound-network allowlist, and lifecycle outcome linked to the workflow correlation identifier. A retry MUST use a new attempt identity and MUST NOT rely on files or processes left by a prior attempt.

#### Scenario: Controlled repository is prepared

- **WHEN** a workflow dispatches an agent attempt
- **THEN** the environment contains the configured repository at the recorded revision and associates the environment and attempt with the workflow run

#### Scenario: Agent execution exceeds its deadline

- **WHEN** the agent process does not complete before its configured deadline
- **THEN** the system terminates the process, records a timeout outcome, and does not treat the attempt as successful

#### Scenario: Process requests an unapproved network destination

- **WHEN** Codex or a repository-controlled process attempts outbound access to a destination outside the configured allowlist
- **THEN** the environment denies the request and records a safe network-policy outcome without exposing request content

#### Scenario: Attempt is retried

- **WHEN** policy permits a failed or interrupted agent attempt to be retried
- **THEN** the retry receives a distinct attempt identity and a clean execution environment while remaining correlated with the same workflow run

### Requirement: Use protected ChatGPT-managed Codex authentication

The controlled first slice SHALL run Codex with ChatGPT-managed authentication and MUST NOT require an OpenAI API key. Authentication material SHALL enter only the trusted execution boundary at runtime, SHALL be available only for the lifetime and purpose of the Codex run, and MUST NOT appear in the repository, process arguments, telemetry, logs, GitHub or Linear requests, or durable agent artifacts. Refreshed authentication state SHALL be returned only to protected credential storage before the transient environment is removed.

#### Scenario: Cached ChatGPT authentication is valid

- **WHEN** the trusted runner supplies protected ChatGPT-managed authentication to Codex
- **THEN** Codex authenticates non-interactively without an OpenAI API key and the run proceeds

#### Scenario: Codex refreshes authentication

- **WHEN** Codex updates its cached ChatGPT-managed authentication during a run
- **THEN** the updated state is persisted only to protected credential storage for a later authorized run

#### Scenario: Authentication fails before execution

- **WHEN** the supplied authentication is absent, invalid, or revoked before Codex begins the agent step
- **THEN** the attempt records an authentication failure, performs no new provider capability operation, and does not advance business workflow state

#### Scenario: Refreshed authentication cannot be persisted

- **WHEN** Codex refreshes its authentication but the trusted runner cannot safely persist the updated state
- **THEN** the attempt records an authentication-persistence failure, permits no further provider capability operation, and does not advance business workflow state

### Requirement: Produce a machine-readable agent outcome

Each Codex attempt SHALL emit a JSON Lines execution stream and one final result that validates against the workflow's declared JSON Schema. The final result SHALL identify the outcome as completed, blocked, or failed and SHALL contain evidence references and agent findings rather than a requested Linear state transition. The Workflow MUST NOT accept a missing or schema-invalid result as a successful agent outcome.

#### Scenario: Agent completes with a valid result

- **WHEN** Codex exits successfully and its final result matches the declared schema
- **THEN** the system records the result and makes it available to the Workflow for a state-machine decision

#### Scenario: Agent reports a blocker

- **WHEN** Codex returns a schema-valid blocked outcome with its reason and evidence references
- **THEN** the system records the blocked outcome without allowing the agent to choose a Linear state transition

#### Scenario: Agent result is invalid

- **WHEN** Codex exits without a final result or the final result does not match the declared schema
- **THEN** the attempt is recorded as failed and cannot be used to advance the workflow as a completed step

### Requirement: Preserve agent artifacts outside the transient environment

Before an attempt can be accepted as successful, the system SHALL durably preserve its JSON Lines stream, structured final result, repository patch or explicit no-change record, validation output, and an artifact manifest. The manifest SHALL record the workflow and attempt identifiers, source revision, artifact media type, byte size, cryptographic digest, creation time, and storage reference. Artifacts and their audit references SHALL remain retrievable after sandbox cleanup and after Workflow execution history is no longer available.

#### Scenario: Required artifacts are persisted

- **WHEN** an agent attempt finishes and every required artifact is stored with matching integrity metadata
- **THEN** the durable audit record links the workflow run and attempt to the complete artifact manifest

#### Scenario: Artifact persistence is partial

- **WHEN** one or more required artifacts cannot be durably stored or verified
- **THEN** the attempt is not accepted as successful, the partial outcome is recorded, and business workflow state does not advance on that result

#### Scenario: Artifact is retrieved after cleanup

- **WHEN** an operator follows an artifact reference after the transient environment has been removed
- **THEN** the operator can retrieve the artifact and verify it against the recorded digest

#### Scenario: Artifact contains sensitive material

- **WHEN** an artifact candidate contains authentication material or a provider credential
- **THEN** the system rejects or sanitizes it before persistence and records a safe artifact-policy failure without storing the secret

### Requirement: Clean up every transient execution environment

The system SHALL explicitly remove the transient execution environment after required artifact and refreshed-authentication handling completes, whether the attempt succeeds, fails, times out, or is canceled. Cleanup outcome SHALL be auditable, and cleanup failure MUST prevent the attempt from being reported as fully successful.

#### Scenario: Successful attempt is cleaned up

- **WHEN** the final result, required artifacts, and any refreshed authentication state have been durably handled
- **THEN** the system removes the transient environment and records successful cleanup

#### Scenario: Failed attempt is cleaned up

- **WHEN** agent startup, authentication, execution, validation, or artifact persistence fails
- **THEN** the system still attempts environment removal and records both the attempt outcome and cleanup outcome

#### Scenario: Cleanup fails

- **WHEN** the transient environment cannot be confirmed removed
- **THEN** the system records a cleanup failure, emits an operator-visible alert category, and does not report the attempt as fully successful
