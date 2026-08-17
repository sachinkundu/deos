## MODIFIED Requirements

### Requirement: Telemetry has consistent query semantics

The system SHALL expose OTEL-compatible structured observations and status projections with a time, service, workflow stage, outcome, correlation identifier, and available resource identifiers needed to locate the related delivery, issue, project, workflow run and instance, sandbox and agent attempt, artifact manifest, and provider operation. Identifiers SHALL be sufficient to join telemetry to durable D1 audit records without requiring sensitive content in telemetry. Every waiting or terminal lifecycle projection SHALL carry Cloudflare execution status and DEOS business status independently, using `cloudflare.execution.status`, `deos.run.status`, `deos.current_node`, `deos.transition.cause`, and, only for a resumable wait, a bounded service-authored `deos.expected_event`.

#### Scenario: Successful stage is reported

- **WHEN** an observed workflow stage completes successfully
- **THEN** its terminal observation reports a successful stage outcome with the shared correlation identifier and the stage's relevant resource identifiers without implying that the whole DEOS run succeeded

#### Scenario: Failed stage is reported without false success

- **WHEN** an observed workflow stage fails
- **THEN** its terminal observation reports a service-authored failure outcome and does not report that stage or dependent stages as successful

#### Scenario: Operator joins telemetry to durable evidence

- **WHEN** an operator follows a workflow, attempt, artifact, or provider-operation identifier from telemetry
- **THEN** the corresponding D1 audit record or durable artifact reference can be located without matching on issue titles, comments, or other provider content

#### Scenario: Run waits for a resumable condition

- **WHEN** DEOS persists `awaiting_capability` or `manual_reconciliation_required` and invokes durable event waiting
- **THEN** telemetry and status projections report Cloudflare execution as `waiting`, the DEOS wait status and current node, the transition cause, and the bounded expected-event identifier

#### Scenario: Run returns a final business outcome

- **WHEN** DEOS records a final outcome and the Workflow returns normally
- **THEN** telemetry and status projections report Cloudflare execution as `complete` and independently report the exact DEOS outcome such as `succeeded`, `denied`, or `canceled`

#### Scenario: Executor or invariant failure terminates by error

- **WHEN** DEOS records an unrecoverable failure and the Workflow terminates by error after bounded retries
- **THEN** telemetry and status projections report Cloudflare execution as `errored`, DEOS as `failed`, and a bounded safe transition cause

#### Scenario: Cloudflare completion is inspected

- **WHEN** an operator or downstream consumer observes Cloudflare execution status `complete`
- **THEN** it determines success, denial, or cancellation only from `deos.run.status` and MUST NOT interpret Cloudflare completion by itself as DEOS success or permission to transition Linear to Done

#### Scenario: Expected event is projected safely

- **WHEN** a resumable run exposes `deos.expected_event`
- **THEN** the value identifies only the service-authored event class and sanitized matcher needed for reconciliation and excludes raw payload, issue content, credentials, and unrestricted provider data
