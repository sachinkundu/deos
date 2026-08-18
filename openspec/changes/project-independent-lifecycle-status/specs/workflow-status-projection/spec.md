## Purpose

Provide a bounded, authenticated runtime view that keeps Cloudflare executor evidence and DEOS business state independently visible for one governed workflow run.

## ADDED Requirements

### Requirement: Project one run without collapsing lifecycle authority

The system SHALL provide a read-only status projection for an exact run or the latest run associated with an issue. The projection SHALL identify one correlation id, DEOS run id, and recorded Cloudflare Workflow instance id and SHALL expose `cloudflare.execution.status`, `deos.run.status`, `deos.current_node`, and `deos.transition.cause` as independent fields. D1 SHALL remain authoritative for every `deos.*` field, and Cloudflare instance status MUST NOT replace, reinterpret, or advance the DEOS business state.

#### Scenario: Waiting run is projected

- **WHEN** D1 records a resumable run and the recorded Cloudflare Workflow instance reports `waiting`
- **THEN** the projection reports that Cloudflare execution status and the D1 run status and current node independently under the same run and instance identities

#### Scenario: Final denial completes normally

- **WHEN** D1 records `denied` and the recorded Cloudflare Workflow instance reports `complete`
- **THEN** the projection reports Cloudflare `complete` and DEOS `denied` without presenting the run as successful

#### Scenario: Executor fails

- **WHEN** the recorded Cloudflare Workflow instance reports `errored` and D1 records DEOS `failed`
- **THEN** the projection exposes both statuses and the bounded DEOS failure cause without replacing either layer with a combined outcome

#### Scenario: Executor completes without DEOS success

- **WHEN** the recorded Cloudflare Workflow instance reports `complete` while D1 records a non-success or non-final DEOS status
- **THEN** the projection exposes the actual pair, does not label it successful, does not transition Linear, and leaves lifecycle reconciliation to the separately governed reconciliation path

### Requirement: Expose only bounded expected-event and cause data

For a resumable run, the projection SHALL include `deos.expected_event` as a bounded, purpose-labeled summary derived from the frozen wait descriptors. The summary SHALL contain only allowlisted event type, actor type, target state, and resume-or-cancel purpose values needed by an operator. `deos.transition.cause` SHALL be a service-authored category derived from the authoritative transition or terminal cause. The projection MUST NOT expose raw matcher JSON, provider payloads, issue content, comments, user identity, delivery bodies, dependency error bodies, prompts, credentials, or executable expressions.

#### Scenario: Resumable wait has two permitted events

- **WHEN** the frozen wait permits one resume event and one cancellation event
- **THEN** `deos.expected_event` identifies both purposes using only the bounded allowlisted descriptor fields and does not return either stored matcher body verbatim

#### Scenario: Run is not waiting

- **WHEN** D1 records no open resumable wait for the projected run and current node
- **THEN** `deos.expected_event` is absent and the projection does not infer one from issue state or telemetry history

#### Scenario: Stored cause reference is not allowlisted

- **WHEN** an authoritative transition contains a cause reference that cannot be mapped to a service-authored category
- **THEN** the projection reports a bounded unknown-cause category and does not return the raw reference

### Requirement: Protect the projection as an internal read contract

The projection endpoint SHALL require its dedicated server-side authorization capability, SHALL accept exactly one supported issue or run selector, and SHALL return no provider content. A successful or failed projection request MUST NOT mutate D1 business state, send a Workflow event, perform a Linear transition, or create a replacement run. The later SAC-101 server-side operator view SHALL be able to consume this contract without receiving the projection credential in browser code.

#### Scenario: Authorized issue lookup

- **WHEN** an authorized server requests the latest run for an issue with a recorded run
- **THEN** the endpoint returns the bounded projection with `Cache-Control: no-store`

#### Scenario: Unauthorized lookup

- **WHEN** a request omits or fails the projection authorization check
- **THEN** the endpoint rejects it without disclosing whether an issue, run, or Workflow instance exists

#### Scenario: Projection request names no unique selector

- **WHEN** a request names neither selector or names conflicting selectors
- **THEN** the endpoint rejects the request without guessing which run to project

#### Scenario: Cloudflare status cannot be read

- **WHEN** D1 identifies the run and instance but the Cloudflare instance-status read fails
- **THEN** the response preserves the D1-derived fields, marks the executor layer unavailable with a bounded service-authored error category, and does not guess or reuse a stale Cloudflare status

