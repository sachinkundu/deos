## ADDED Requirements

### Requirement: Separate executor and business lifecycle

The Workflow SHALL record the DEOS business lifecycle in D1 independently from the Cloudflare executor lifecycle. A new workflow definition SHALL classify each control boundary as a final business outcome, a resumable wait, or an unrecoverable failure; it MUST NOT use one ambiguous `blocked` terminal for more than one of those meanings.

#### Scenario: Run reaches a final business outcome

- **WHEN** the governed process reaches a definition-declared final outcome such as `succeeded`, `denied`, or `canceled`
- **THEN** D1 records that final DEOS status and terminal node before the Workflow returns normally, while Cloudflare completion remains executor evidence rather than a substitute for that business outcome

#### Scenario: Run reaches a resumable condition

- **WHEN** a missing capability, incomplete system action, or ambiguous provider effect can be reconciled so the same run may continue
- **THEN** D1 records `awaiting_capability` or `manual_reconciliation_required`, the current node, transition cause, and definition-controlled event matchers without setting a terminal timestamp, and the same Workflow instance waits durably

#### Scenario: Executor or invariant failure is unrecoverable

- **WHEN** an executor path or durable invariant still fails after its configured bounded retries and D1 remains available to record the outcome
- **THEN** D1 records DEOS `failed` with a bounded safe cause and the Workflow terminates by error rather than returning a successful executor result

#### Scenario: Definition uses an ambiguous blocked terminal

- **WHEN** a new workflow definition uses one `blocked` outcome for both final and resumable conditions
- **THEN** definition validation rejects it and requires explicit final, waiting, or failure semantics

### Requirement: Make every resumable wait explicit and cancellable

Every resumable wait SHALL declare and durably persist an exact authorized resume event and an exact authorized cancellation event from the frozen workflow definition. Either event SHALL apply to the same run and Workflow instance at most once; an event payload MUST NOT select the continuation node or business status.

#### Scenario: Authorized reconciliation resumes the run

- **WHEN** the exact resume event is received from a source and actor authorized by the frozen workflow definition
- **THEN** the Workflow consumes it once, records the resumption, and continues through the configured resume edge on the same run and instance without repeating a completed provider effect

#### Scenario: Authorized cancellation terminates the waiting run

- **WHEN** the exact cancellation event is received from a source and actor authorized by the frozen workflow definition
- **THEN** the Workflow consumes it once, records DEOS `canceled` and the configured terminal node, and returns normally without executing the resume edge

#### Scenario: Unexpected event arrives while waiting

- **WHEN** an event matches neither the persisted resume event nor the persisted cancellation event and authorization policy
- **THEN** the Workflow audits the event without resuming or canceling the run, changing the wait state, or allocating a replacement instance

#### Scenario: Resume or cancellation delivery is duplicated

- **WHEN** an already-consumed resume or cancellation delivery is observed again
- **THEN** delivery and wait-consumption guards acknowledge it without repeating a transition or provider effect

### Requirement: Classify non-success actions explicitly

A new workflow definition SHALL map every non-success agent or system-action outcome to a bounded retry, a resumable wait, a final business outcome, or an unrecoverable failure. The Workflow SHALL require the exact configured execution receipt before following a system-action success edge.

#### Scenario: Agent reports blocked

- **WHEN** a valid blocked outcome is received
- **THEN** the Workflow applies the definition's explicit final, resumable, retry, or failure action and does not infer terminality from the word `blocked`

#### Scenario: Recoverable system action lacks an exact execution receipt

- **WHEN** a system-action node has no successful or reconciled receipt for its exact configured action and the definition classifies the missing capability as recoverable
- **THEN** the Workflow records the exact resume and cancellation events required by the wait node and waits durably instead of following a terminal blocked edge

#### Scenario: Unrecoverable system action lacks an exact execution receipt

- **WHEN** a version 4 system-action node has no successful or reconciled receipt for its exact configured action and the definition classifies the invariant as unrecoverable after bounded retries
- **THEN** the Workflow durably records DEOS `failed` with a bounded safe cause before terminating by error, without claiming that the named action executed