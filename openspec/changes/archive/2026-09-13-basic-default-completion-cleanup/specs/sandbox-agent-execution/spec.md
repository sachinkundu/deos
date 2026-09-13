## ADDED Requirements

### Requirement: Wake collection when the supervisor finishes

After final output is written, the trusted supervisor SHALL send an authenticated attempt-scoped completion hint. The workflow SHALL use the hint to reconcile the saved process promptly. The hint MUST NOT assert success, bypass artifact checks, change an outcome, or authorize cleanup on its own.

The controller SHALL retain its existing order: confirm process exit, preserve and verify available evidence, handle refreshed credentials, and then destroy the sandbox. A missing hint SHALL leave heartbeat recovery in place. Notification failures SHALL retain their original diagnostics without replacing the work's result.

#### Scenario: Work finishes between heartbeats

- **WHEN** a supervisor finalizes its output and sends a valid hint for the active attempt
- **THEN** the workflow wakes promptly and runs the existing process, collection, and cleanup checks

#### Scenario: Supervisor fails

- **WHEN** a supervisor records a terminal failure and sends a hint
- **THEN** the controller preserves available failure evidence before cleanup and does not report success

#### Scenario: Hint arrives before process exit

- **WHEN** the workflow receives a hint while the supervisor is finishing its notification request
- **THEN** it checks again after a short bounded wait without destroying a running process

#### Scenario: Hint is lost

- **WHEN** no valid hint reaches the workflow
- **THEN** the normal heartbeat still reconciles the process and collects completed output

#### Scenario: Hint is stale or forged

- **WHEN** a request lacks a valid attempt grant or refers to an inactive attempt or workflow visit
- **THEN** it cannot wake another attempt or change durable workflow state

#### Scenario: Hint is repeated or arrives early

- **WHEN** a valid hint is repeated or reaches the workflow before its wait begins
- **THEN** it remains only a reconciliation hint and cannot duplicate completion or provider writes
