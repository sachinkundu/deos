## Purpose

Let every DEOS agent turn recover from brief faults through one durable policy.
Keep finished work, external effects, human decisions, and exact error evidence.

## ADDED Requirements

### Requirement: Apply one recovery contract to every agent turn

The system SHALL apply the same recovery contract to every agent turn. A turn is
one agent request to produce a result from fixed input, including its model calls
and tool work. Coverage MUST include authors, reviewers, responses, revisions,
implementation, verification, archive work, and nested agents. New agent nodes,
roles, and providers MUST inherit this contract without edits to a list of node
names. Each adapter MUST declare how to classify errors and reconcile its work.
An adapter without that contract MUST be rejected before dispatch.

#### Scenario: A new agent node is added

- **WHEN** a valid workflow adds an agent node with a new name
- **THEN** its turns receive the same retry limits, error capture, and recovery rules without a node-specific retry change

#### Scenario: A nested reviewer encounters a fault

- **WHEN** a parent agent delegates review and the child hits a brief provider fault
- **THEN** the child uses the shared contract and its recovery remains linked to the parent, turn, attempt, and run

#### Scenario: An adapter has no recovery contract

- **WHEN** a provider adapter cannot state how to recover or stop safely
- **THEN** dispatch fails with that exact contract error before a model call or external write

### Requirement: Share retry limits across layers and restarts

Each turn SHALL have a saved policy version, retry budget, deadline, failure
history, and next eligible retry time. Provider, process, stage, and nested-agent
retry paths MUST charge the applicable shared budgets. A parent budget MUST
bound retries by its children. Retries MUST use backoff with jitter and respect
valid provider cooldowns. A restart, deploy, duplicate event, or new attempt ID
MUST NOT reset the budget, deadline, or cooldown. Long waits MUST survive the
loss of the process that scheduled them.

#### Scenario: Retry loops are nested

- **WHEN** a turn permits three retries and failures pass through provider and stage retry paths
- **THEN** those paths allow at most three extra executions in total rather than multiplying their limits

#### Scenario: A restart occurs during backoff

- **WHEN** the backend restarts while a turn waits for its next retry
- **THEN** recovery retains the used budget and wakes no earlier than the saved retry time

#### Scenario: A provider cooldown exceeds the deadline

- **WHEN** a retry cannot start before both its cooldown and the turn deadline are satisfied
- **THEN** the system stops or reports the required wait according to policy and does not reset the deadline or call early

### Requirement: Classify the real fault before choosing recovery

The system SHALL classify faults from the full original error and the provider's
contract. Brief transport, timeout, overload, rate-limit, and runtime-reset
faults SHALL enter bounded recovery when replay is safe. Permanent input,
permission, revoked-credential, or policy failures MUST stop with their real
cause. Unknown failures MUST retain their evidence and MUST NOT trigger blind
replay. A valid review concern, refusal, blocked result, or failed validation
MUST NOT be retried to seek a different judgment.

An isolated authentication rejection without a confirmed permanent cause SHALL
permit at most one fresh-client retry after trusted credential binding checks
pass and replay is safe. That retry MUST use the shared budget. A repeated
rejection or explicit denial MUST stop. This rule MUST NOT replace credentials,
change accounts or models, refresh shared credentials outside the approved
credential owner, or enable paid usage.

#### Scenario: A transport fault occurs before provider acceptance

- **WHEN** the provider contract establishes a recoverable fault and no accepted work needs reconciliation
- **THEN** the system saves the error and schedules a bounded retry

#### Scenario: An isolated authentication rejection is followed by success

- **WHEN** binding checks pass after an unexplained authentication rejection and the one permitted fresh-client retry succeeds
- **THEN** the turn continues with both the rejection and successful retry recorded

#### Scenario: The account lacks permission

- **WHEN** the provider explicitly reports revoked access or a permission denial
- **THEN** the turn stops with the exact response and does not repeatedly call with the same credential

#### Scenario: A review returns concerns

- **WHEN** a provider completes a valid review that contains concerns
- **THEN** the workflow follows its review-response path without treating those concerns as a transport failure

### Requirement: Reconcile completed or uncertain work before replay

Recovery SHALL first reconcile process state, provider receipts, tool-operation
records, and saved artifacts. It MUST reuse a verified completed result and
resume unfinished collection or validation without running the author again.
A live process MUST remain owned by its current attempt while its progress is
valid. A replacement execution MUST use a new attempt and clean environment,
restored only from verified durable inputs. Fixed input, repository revision,
model constraints, and review scope MUST remain unchanged.

If a call might have succeeded, recovery MUST inspect the provider's durable
state or use its documented idempotency contract before replay. The same rule
applies to tool writes and publication. If the outcome cannot be established and
replay could duplicate an effect, the system MUST stop for reconciliation with
the original cause. Cleanup MUST NOT remove the only evidence needed to resume.

#### Scenario: Collection fails after the model finishes

- **WHEN** a valid model receipt and output exist but an artifact-store write fails
- **THEN** recovery retries the unfinished collection and does not invoke the model again

#### Scenario: A pull request was created before the response was lost

- **WHEN** a tool request times out after the provider created its pull request
- **THEN** recovery links the existing pull request and does not create a duplicate

#### Scenario: A container is replaced during a turn

- **WHEN** the old process is confirmed stopped after a deploy
- **THEN** recovery resumes from verified saved work in a distinct attempt and records any work that could not be recovered

#### Scenario: A provider stream ends with uncertain completion

- **WHEN** part of a model response arrived and its final status is unknown
- **THEN** recovery reconciles the turn before a new call and does not assume that a transport exception means no work occurred

### Requirement: Preserve exact errors through every recovery decision

Before retry, terminal classification, or cleanup, the system SHALL save the
original error message, status, response body, request ID, stack, cause chain,
available process output, and operation context in protected durable storage.
It MUST retain the history of each failed try, not just the last error. Only
secret values SHALL be redacted. Public error codes MUST NOT replace that
evidence. If storage or cleanup also fails, both errors MUST remain available
and the turn MUST NOT be reported as successful. If a provider supplied no
detail, the diagnostic MUST state that absence without inventing a cause.

#### Scenario: A later try succeeds

- **WHEN** a turn succeeds after two failed tries
- **THEN** its history still exposes both exact failures and the decision to retry each one

#### Scenario: Saving the error also fails

- **WHEN** the primary failure cannot be written to its normal store
- **THEN** the system retains the primary and storage errors through a protected fallback and prevents cleanup from erasing the only copy

### Requirement: Prove coverage and recovery beyond local mocks

Release evidence SHALL cover every current agent entry path and a new agent
node with no retry-specific registration. It MUST include deterministic checks
for limits, replay safety, concurrent recovery, and cancellation. A controlled
Cloudflare run MUST demonstrate recovery from a real runtime interruption and
resume from saved work. Each current provider route MUST produce a real accepted
result through the common contract. Evidence MUST distinguish injected faults,
real provider responses, and local mocks. A simulated 401 MUST NOT be called
proof of a real provider authentication failure.

#### Scenario: A successful HTTP retry hides a failed stage

- **WHEN** a local transport test passes but the real run does not resume
- **THEN** recovery proof is incomplete and the release does not claim end-to-end recovery

#### Scenario: A new node inherits recovery

- **WHEN** a controlled run adds a new agent node and experiences a recoverable fault
- **THEN** its durable history shows bounded recovery and completion through the common contract
