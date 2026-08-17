## ADDED Requirements

### Requirement: Preserve resumable run identity

The dispatcher SHALL route later accepted Linear events for a waiting issue run to its recorded Workflow instance and SHALL consult D1 business status rather than Cloudflare completion alone when deciding whether a run can receive an event or a new run may begin. A later event MUST NOT create a replacement instance merely because the existing Workflow is waiting.

#### Scenario: Waiting Workflow receives its resume event

- **WHEN** an accepted Linear event matches the exact resume event and authorization policy persisted for an `awaiting_capability` or `manual_reconciliation_required` run
- **THEN** the dispatcher records and sends the event to the same Workflow instance and does not allocate another run, instance, or initial attempt

#### Scenario: Waiting Workflow receives its cancellation event

- **WHEN** an accepted Linear event matches the exact cancellation event and authorization policy persisted for a waiting run
- **THEN** the dispatcher records and sends the event to the same Workflow instance so the Workflow can take its definition-controlled cancellation edge

#### Scenario: Waiting Workflow receives an unexpected event

- **WHEN** an accepted Linear event belongs to a waiting run but matches neither its persisted resume nor cancellation event
- **THEN** the event remains auditable and may be delivered for rejection by the Workflow, but it does not create a replacement run or change the authoritative wait state

#### Scenario: New run follows a terminal run

- **WHEN** project policy accepts a new start event after D1 records the prior issue run as a final business outcome
- **THEN** the dispatcher creates a new uniquely identified Workflow instance and preserves the prior run's mapping and audit history

### Requirement: Surface premature Workflow completion as a system error

The system SHALL reconcile Cloudflare executor completion against the authoritative D1 business outcome. Cloudflare `complete` without a final DEOS outcome SHALL be classified as `premature_workflow_completion`, SHALL be visible to the operator on the correlated Linear issue, and MUST NOT be interpreted as business success.

#### Scenario: Cloudflare reports complete without a final DEOS outcome

- **WHEN** Cloudflare executor status is `complete` but D1 does not record a final DEOS business outcome
- **THEN** reconciliation safely records DEOS `failed` with cause `premature_workflow_completion`, creates or updates one stable operator-visible Linear work item for the run, and does not transition the issue to Done or automatically allocate a new run

#### Scenario: Premature-completion reconciliation is repeated

- **WHEN** the same completed Workflow instance is reconciled more than once
- **THEN** the D1 failure transition and Linear operator work item are idempotently reused without duplicate comments, transitions, or replacement runs

#### Scenario: D1 state advances before premature-completion reconciliation commits

- **WHEN** the reconciler observes Cloudflare `complete` but its guarded D1 comparison no longer matches the non-final state it inspected
- **THEN** it preserves the newer D1 state, records the reconciliation conflict for audit, and does not overwrite the business outcome or create a misleading operator notice
