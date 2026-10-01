## ADDED Requirements

### Requirement: Adopt shared recovery for present and future runs

New runs SHALL use the shared recovery contract by default. Existing active and
recoverable failed runs SHALL be assessed for adoption without a new business
run or a rewritten frozen workflow. Adoption MUST record the source state,
policy version, saved-work checks, eligibility decision, and owner. It MUST be
idempotent and resume through a runtime that supports the policy. Uploading new
code alone MUST NOT count as adopting a run pinned to an older runtime.

Existing runs at human gates SHALL remain there and use the contract on their
next authorized agent turn. Completed and canceled runs MUST remain terminal.
A failed run with a permanent error or insufficient safe replay evidence MUST
remain stopped with the reason shown. Rollout evidence MUST account for each
existing nonterminal run as adopted, waiting at a gate, or blocked with a cause.

#### Scenario: A current run uses an older frozen graph

- **WHEN** it adopts the new recovery policy
- **THEN** a durable transition records adoption and preserves its run ID, graph digest, completed work, and pending human decisions

#### Scenario: A failed run has safe saved work

- **WHEN** the adoption check finds a recoverable failure and verified inputs
- **THEN** that same run resumes only its unfinished work under the new policy

#### Scenario: A canceled run appears in a recovery scan

- **WHEN** recovery reads a canceled run
- **THEN** it records no new execution and does not revive the run

### Requirement: Give each recovery one durable owner

The system SHALL admit at most one recovery execution for a failed logical turn
at a time. Automatic recovery, operator retry, duplicate deliveries, and replayed
workflow steps MUST reconcile through the same ownership and budget records.
Budget use and ownership MUST be committed before dispatch. Cancellation and
human decisions MUST be checked again before a retry wakes or publishes work.
Business state MUST remain active while bounded recovery can proceed and MUST
not report a temporary fault as a failed validation.

#### Scenario: Automatic and operator retry race

- **WHEN** both try to recover the same failed turn
- **THEN** only one new execution is dispatched and both callers observe its durable identity

#### Scenario: The run is canceled during backoff

- **WHEN** a scheduled retry wakes after a valid cancellation
- **THEN** it makes no model call, tool write, or workflow advancement

#### Scenario: A backend reset interrupts a completed check

- **WHEN** a check passed but its follow-up read is interrupted by a runtime reset
- **THEN** the system resumes the unfinished read and does not replace the passed check with a validation failure

### Requirement: Keep routine recovery quiet and final failure clear

Retry progress SHALL remain inspectable through the existing run history with
the saved policy, try count, next retry time, and links to original errors.
Routine recovery MUST NOT require a user action or emit repeated notices. When
the budget is exhausted or recovery requires intervention, the system SHALL
report the final cause, retained work, and next supported action once. Recovery
MUST NOT approve a PR or cross a human gate.

#### Scenario: Recovery succeeds without intervention

- **WHEN** a temporary failure is recovered within policy
- **THEN** the run continues quietly and retains its recovery history

#### Scenario: Recovery exhausts its budget

- **WHEN** no permitted try remains
- **THEN** the run records a terminal failure with the exact cause and all failed tries, and reports the required next action once
