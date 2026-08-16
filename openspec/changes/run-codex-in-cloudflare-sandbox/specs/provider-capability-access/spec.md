## Purpose

Allow an agent to initiate narrowly authorized GitHub and Linear operations while keeping credentials, idempotency, audit records, and workflow-state authority outside the agent's control.

## ADDED Requirements

### Requirement: Authorize provider operations by capability and target

The system SHALL authorize each agent-initiated provider operation against an explicit capability, action, target repository or Linear scope, workflow run, and agent attempt. The controlled trial SHALL permit only the configured GitHub repository and approved non-transition Linear operations in the configured workspace and project. Agent-initiated Linear state transitions MUST be rejected.

#### Scenario: Allowed GitHub operation is requested

- **WHEN** an agent requests a configured GitHub action against the controlled trial repository
- **THEN** the system executes the action with only the configured repository permissions and records the authorization decision

#### Scenario: Allowed Linear operation is requested

- **WHEN** an agent requests an approved non-transition Linear action such as updating a shared working note or attaching a durable work-product reference within the configured trial scope
- **THEN** the system executes the action so later agents can recover the shared context without granting permission to change issue state

#### Scenario: Linear transition is requested by an agent

- **WHEN** an agent requests creation, approval, rejection, or any other Linear state transition
- **THEN** the system rejects the request, records the policy violation, and leaves the transition decision to the Workflow

#### Scenario: Target is outside the trial scope

- **WHEN** an agent requests an operation against an unconfigured repository, workspace, project, issue, or action
- **THEN** the system denies the operation without sending it to the provider and records a safe denial result

### Requirement: Make provider operations idempotent and reconcilable

Every agent-initiated provider operation SHALL carry a stable operation identifier scoped to the workflow run and logical intent. Before retrying an operation after a duplicate request, timeout, or ambiguous provider response, the system SHALL reconcile whether the intended provider effect already occurred. A retry MUST NOT create a duplicate pull request, comment, attachment, or other provider effect.

#### Scenario: Duplicate operation request is received

- **WHEN** the same stable operation identifier is submitted more than once
- **THEN** the system returns the recorded result or reconciled provider effect without creating another effect

#### Scenario: Provider response is ambiguous

- **WHEN** a provider may have accepted an operation but its response is lost or times out
- **THEN** the system checks provider state using the stable operation identity before deciding whether execution is safe to retry

#### Scenario: One required provider operation succeeds and another fails

- **WHEN** a workflow step has multiple required provider operations and only a subset succeeds
- **THEN** successful operations remain recorded, retries target only incomplete operations, and the workflow does not enter its success gate until all required operations succeed

### Requirement: Record durable provider capability receipts

The system SHALL durably record a receipt for every allowed, denied, failed, reconciled, and duplicate provider capability request. The receipt SHALL include the workflow correlation identifier, workflow run, agent attempt, stable operation identifier, capability and action, sanitized target identifier, outcome, provider resource identifier when available, and timestamps. Receipts MUST NOT contain credentials, authorization headers, raw provider responses, or unrestricted provider content.

#### Scenario: Provider operation succeeds

- **WHEN** a provider accepts an authorized operation
- **THEN** the durable receipt identifies the created or updated provider resource and correlates it with the requesting workflow and attempt

#### Scenario: Provider operation fails safely

- **WHEN** an authorized provider operation fails
- **THEN** the durable receipt records a service-authored error category, a protected diagnostic reference, and enough sanitized identity to retry or reconcile without storing the raw provider response in the receipt

### Requirement: Limit and protect provider credentials

Provider credentials SHALL be least-privileged for the controlled trial scope and short-lived where the provider supports short-lived identity. The capability interface SHALL NOT expose credential storage or token values to the agent result contract or repository-controlled commands. If the controlled first slice supplies a provider credential directly to the trusted runner, only its trusted capability adapter SHALL receive the credential; the credential SHALL be limited to the attempt lifetime and approved scope and MUST NOT be committed, persisted as an agent artifact, or emitted in logs or telemetry.

#### Scenario: Provider credential is made available for a trial operation

- **WHEN** the controlled runner receives a credential needed for an authorized provider action
- **THEN** the trusted capability adapter can use the credential only within the approved attempt and scope while repository-controlled commands and durable agent evidence cannot access it

#### Scenario: Credential scope is insufficient

- **WHEN** a provider rejects an operation because the credential lacks permission
- **THEN** the system records a safe authorization-failure category and does not broaden the credential automatically

### Requirement: Complete required provider work before a success transition

The Workflow SHALL NOT follow a workflow node's success edge until the agent returns a valid completed outcome and every provider operation required by that node has a successful or reconciled receipt. After those prerequisites are satisfied, the configured workflow definition SHALL decide whether the next node is autonomous, another agent step, a human gate, or a terminal state.

#### Scenario: Agent and provider work complete

- **WHEN** the agent result is valid and all required provider receipts report success
- **THEN** the Workflow evaluates the current node's configured success edge using the accumulated run state

#### Scenario: Configured success edge enters a human gate

- **WHEN** the prerequisites are complete and the workflow definition selects the `Human Review` gate as the next node
- **THEN** the Workflow moves the issue to the configured `Human Review` state and records the state from which the gate was entered

#### Scenario: Required provider work remains incomplete

- **WHEN** any required provider operation is pending, denied, failed, or ambiguous
- **THEN** the Workflow does not follow the success edge and instead applies the current node's configured retry, blocked, failure, or operator-action rule
