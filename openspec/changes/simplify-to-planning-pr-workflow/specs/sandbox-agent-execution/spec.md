## MODIFIED Requirements

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
