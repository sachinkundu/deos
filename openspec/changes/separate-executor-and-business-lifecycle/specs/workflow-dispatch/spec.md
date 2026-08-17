## MODIFIED Requirements

### Requirement: Route later Linear events to the mapped Workflow instance

The dispatcher SHALL route later accepted Linear events for an active or resumable issue run to its recorded Workflow instance and SHALL preserve the provider delivery identifier, event type, issue and project identifiers, provider timestamp, actor identity, and actor type needed for a state-machine decision. It SHALL consult D1 business status rather than Cloudflare completion alone when deciding whether a run can receive an event or a new run may begin. A later event MUST NOT create a replacement instance merely because the existing Workflow is waiting.

#### Scenario: Active Workflow receives a later event

- **WHEN** a new accepted Linear event belongs to an issue run with an active Workflow mapping
- **THEN** the event is durably delivered to that Workflow instance with its actor attribution and correlation identifier intact

#### Scenario: Resumable Workflow receives its expected event

- **WHEN** an accepted Linear event matches the exact expected event and authorization policy persisted for an `awaiting_capability` or `manual_reconciliation_required` run
- **THEN** the dispatcher records and sends the event to the same Workflow instance and does not allocate another run, instance, or initial attempt

#### Scenario: Resumable Workflow receives an unexpected event

- **WHEN** an accepted Linear event belongs to a waiting run but does not match its persisted expected event
- **THEN** the event remains auditable and may be delivered for rejection by the Workflow, but it does not create a replacement run or change the authoritative wait state

#### Scenario: Later delivery is duplicated

- **WHEN** a later Linear delivery with an already handled delivery identifier is observed again
- **THEN** the duplicate is acknowledged and audited without sending another Workflow event or repeating a state transition

#### Scenario: Later event has no Workflow mapping

- **WHEN** an event that is not a configured start event has no active or resumable Workflow mapping
- **THEN** the system records an unmatched-event outcome and does not create a Workflow instance or mutate Linear state

#### Scenario: New run follows a terminal run

- **WHEN** project policy accepts a new start event after D1 records the prior issue run as a final business outcome
- **THEN** the dispatcher creates a new uniquely identified Workflow instance and preserves the prior run's mapping and audit history

#### Scenario: Cloudflare reports complete without a final DEOS outcome

- **WHEN** Cloudflare executor status is `complete` but D1 does not record a final DEOS business outcome
- **THEN** the dispatcher does not use Cloudflare status alone to allocate a new run or transition the Linear issue to Done
