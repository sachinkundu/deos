# Sandbox Agent Execution Specification

## Purpose

Run one attributable Codex step in a bounded isolated environment while preserving a machine-readable result and durable evidence after the transient environment is removed.

## Requirements

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

Before any terminal agent attempt can be cleaned up, the trusted runner SHALL durably preserve every available policy-safe output as an immutable attempt-scoped manifest. This rule applies to successful, blocked, failed, interrupted, timed-out, and canceled attempts. Failure evidence SHALL include the JSON Lines transcript, validation output, repository patch, structured result, provider references, and trusted supervisor status whenever each file exists. The trusted runner SHALL add a bounded failure summary that records which expected files were stored or absent and the safe process outcome category. It MUST NOT destroy the Sandbox until the manifest is written and verified. If evidence persistence cannot be verified, the attempt SHALL remain recoverable for a later collection retry and cleanup SHALL NOT run.

The JSON Lines transcript SHALL be captured by the trusted supervisor outside paths that the agent is told to write. The supervisor SHALL publish the captured stream only after the agent process ends. Agent writes MUST NOT replace, truncate, append to, or create sparse regions in the trusted transcript.

#### Scenario: Agent exits with a non-zero status after producing output

- **WHEN** the trusted supervisor observes a non-zero Codex exit after one or more output files were created
- **THEN** the controller stores every available policy-safe output, records a bounded `codex_exit_nonzero` outcome, verifies the failure manifest, and only then destroys the Sandbox

#### Scenario: Agent tries to write the transcript path

- **WHEN** an agent creates or replaces the declared `transcript.jsonl` output while its process is running
- **THEN** the trusted supervisor replaces that file after exit with its complete captured Codex JSON Lines stream before artifact collection

#### Scenario: Agent is interrupted after partial work

- **WHEN** the controller must stop an agent because of an expired heartbeat or absolute deadline
- **THEN** it waits for the supervisor to flush terminal output, stores the available partial evidence, verifies its manifest, and only then destroys the Sandbox

#### Scenario: One expected output was never created

- **WHEN** a failed attempt has no result, patch, transcript, validation, provider-reference, or status file that was expected for the job
- **THEN** the failure summary records that file as absent while preserving every other available policy-safe output

#### Scenario: An available output violates artifact policy

- **WHEN** an available failed-attempt output contains forbidden credential material or violates a bounded artifact rule
- **THEN** the failure summary records a policy rejection without copying the unsafe body, and other safe evidence is still preserved

#### Scenario: Failure evidence cannot be durably stored

- **WHEN** an R2 write, manifest write, or verification for terminal evidence is not confirmed
- **THEN** the controller does not destroy the Sandbox and leaves the attempt recoverable for a collection retry

#### Scenario: Failure evidence survives cleanup

- **WHEN** a terminal failure manifest is complete and the Sandbox has been destroyed
- **THEN** D1 retains the manifest identity and bounded result class, R2 retains the transcript and other accepted evidence, and telemetry records the failed attempt with its safe category

#### Scenario: Required artifacts are persisted

- **WHEN** an agent attempt finishes and every required artifact is stored with matching integrity metadata
- **THEN** the durable audit record links the workflow run and attempt to the complete artifact manifest

#### Scenario: Artifact persistence is partial

- **WHEN** one or more required artifacts cannot be durably stored or verified
- **THEN** the attempt is not accepted as successful, the partial outcome is recorded, business workflow state does not advance on that result, and cleanup waits while recoverable evidence remains only in the Sandbox

#### Scenario: Artifact is retrieved after cleanup

- **WHEN** an operator follows an artifact reference after the transient environment has been removed
- **THEN** the operator can retrieve the artifact and verify it against the recorded digest

#### Scenario: Artifact contains sensitive material

- **WHEN** an artifact candidate contains authentication material or a provider credential
- **THEN** the trusted artifact collector rejects the candidate or stores only a verified redacted derivative and records a safe artifact-policy outcome without persisting the secret

### Requirement: Clean up every transient execution environment

The system SHALL explicitly remove the transient execution environment only after every available policy-safe output, the bounded terminal summary, and refreshed-authentication handling have been durably preserved and verified. This ordering applies whether the attempt succeeds, fails, times out, or is canceled. Cleanup outcome SHALL be auditable. Evidence persistence failure SHALL keep the environment recoverable for retry, and cleanup failure MUST prevent the attempt from being reported as fully successful.

#### Scenario: Successful attempt is cleaned up

- **WHEN** the final result, required artifacts, and any refreshed authentication state have been durably handled
- **THEN** the system removes the transient environment and records successful cleanup

#### Scenario: Failed attempt is cleaned up

- **WHEN** agent startup, authentication, execution, or validation fails and every available policy-safe output plus the bounded terminal summary is durably verified
- **THEN** the system removes the environment and records both the attempt outcome and cleanup outcome

#### Scenario: Failure evidence is not yet durable

- **WHEN** a failed attempt still has recoverable output in the Sandbox but its terminal evidence manifest cannot be stored or verified
- **THEN** the system keeps the environment recoverable and retries evidence collection before cleanup

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
