## Purpose

Run one attributable Codex step in a bounded isolated environment while preserving a machine-readable result and durable evidence after the transient environment is removed.

## ADDED Requirements

### Requirement: Execute each agent attempt in an isolated bounded environment

The system SHALL run each agent attempt in an isolated environment with an explicit attempt identity, controlled repository and revision, and lifecycle outcome linked to the workflow correlation identifier. A retry or follow-up agent step MUST use a new attempt identity and MUST NOT rely on files or processes left by a prior attempt.

#### Scenario: Controlled repository is prepared

- **WHEN** a workflow dispatches an agent attempt
- **THEN** the environment contains the configured repository at the recorded revision and associates the environment and attempt with the workflow run

#### Scenario: Attempt is retried

- **WHEN** policy permits a failed or interrupted agent attempt to be retried
- **THEN** the retry receives a distinct attempt identity and a clean execution environment while remaining correlated with the same workflow run

#### Scenario: A fresh agent continues review work

- **WHEN** the Workflow dispatches a follow-up agent to address review feedback on work produced by an earlier attempt
- **THEN** the new attempt receives the recorded repository, branch and revision, review feedback, prior structured results, and durable working-note and artifact references without requiring the earlier sandbox to remain active

### Requirement: Report liveness for long-running agent attempts

The trusted runner SHALL report durable heartbeat observations to the Workflow at a configured interval while the Codex process remains alive and SHALL record agent progress milestones when they are available. The Workflow SHALL use recent heartbeats to distinguish active work from a stalled attempt and SHALL reconcile process liveness before termination. The controlled first slice SHALL enforce a 24-hour absolute execution limit as a catch-all rather than treating ordinary long-running work as timed out.

#### Scenario: Agent remains alive and working

- **WHEN** a long-running Codex attempt continues to report heartbeats within the configured liveness interval
- **THEN** the Workflow records the attempt as active and does not terminate it for inactivity

#### Scenario: Heartbeats stop

- **WHEN** the Workflow does not receive a heartbeat within the configured missed-heartbeat threshold
- **THEN** it checks the recorded sandbox and process state before selecting the configured recovery, retry, or failure action

#### Scenario: Absolute execution limit is reached

- **WHEN** an attempt remains active for 24 hours without completing
- **THEN** the trusted runner terminates the process, records an absolute-timeout outcome, and starts cleanup

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

### Requirement: Produce a machine-readable agent outcome

Each Codex attempt SHALL emit a JSON Lines execution stream and one final result that validates against the workflow's declared JSON Schema. The final result SHALL identify the outcome as completed, blocked, or failed; describe what the agent did; and reference produced work such as a GitHub pull request, branch and commit, validation evidence, or shared Linear working note. It MUST report facts and evidence rather than request a Linear state transition. The Workflow MUST NOT accept a missing or schema-invalid result as a successful agent outcome.

#### Scenario: Agent completes with a valid result

- **WHEN** Codex exits successfully and its final result matches the declared schema
- **THEN** the system records the result and makes it available to the Workflow for a state-machine decision

#### Scenario: Agent reports a blocker

- **WHEN** Codex returns a schema-valid blocked outcome with its reason and evidence references
- **THEN** the system records the blocked outcome without allowing the agent to choose a Linear state transition

#### Scenario: Agent publishes a GitHub pull request

- **WHEN** an authorized agent attempt creates or updates a pull request as its work product
- **THEN** its structured result references the pull request, branch, commit, validation evidence, and provider receipt so the Workflow can decide the next configured action

#### Scenario: Agent result is invalid

- **WHEN** Codex exits without a final result or the final result does not match the declared schema
- **THEN** the attempt is recorded as failed and cannot be used to advance the workflow as a completed step

### Requirement: Preserve agent artifacts outside the transient environment

Before an attempt can be accepted as successful, the trusted runner's artifact collector SHALL durably preserve the JSON Lines transcript as a provenance record, the structured final result, repository patch or explicit no-change record, validation output, provider work-product references, and an artifact manifest. The collector SHALL operate outside agent-controlled commands and SHALL validate artifact candidates before storage. The manifest SHALL record the workflow and attempt identifiers, source revision, artifact media type, byte size, cryptographic digest, creation time, and storage reference. Artifacts and their audit references SHALL remain retrievable after sandbox cleanup and after Workflow execution history is no longer available.

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
- **THEN** the trusted artifact collector rejects the candidate or stores only a verified redacted derivative and records a safe artifact-policy outcome without persisting the secret

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
- **THEN** the system records the sandbox resource identifier and cleanup failure, creates or updates one operator cleanup work item on the configured board, and does not report the attempt as fully successful

### Requirement: Reconcile orphaned execution environments

The system SHALL periodically compare active Sandbox resources with durable attempt records and SHALL create or update one operator cleanup work item for each environment that remains active without a live attempt. The work item SHALL identify the sandbox resource and related workflow run when known, while environments with no recoverable run association SHALL remain independently actionable.

#### Scenario: Orphan retains a workflow association

- **WHEN** reconciliation finds an active environment whose recorded attempt is terminal or missing heartbeats
- **THEN** the operator work item identifies both the sandbox resource and its workflow run and records subsequent cleanup attempts

#### Scenario: Orphan has no run association

- **WHEN** reconciliation finds an active environment that cannot be matched to a workflow run
- **THEN** the operator work item identifies the standalone sandbox resource so it can be removed and its cost exposure tracked
