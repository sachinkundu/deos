## ADDED Requirements

### Requirement: Observe executor and business lifecycle independently

The system SHALL emit a structured lifecycle projection whenever it observes a relevant waiting or terminal Cloudflare Workflow state for a governed run. Each observation SHALL expose `cloudflare.execution.status`, `deos.run.status`, `deos.current_node`, `deos.transition.cause`, and, only for an open resumable wait, bounded `deos.expected_event` data. An observation MUST NOT derive DEOS success from Cloudflare `complete` or derive Cloudflare status from a DEOS terminal outcome.

#### Scenario: Waiting lifecycle is observed

- **WHEN** a status sample observes Cloudflare `waiting` for a D1 run in a resumable status
- **THEN** one structured observation contains both statuses, the current node, bounded transition cause, bounded expected-event summary, run id, Workflow instance id, and shared correlation id

#### Scenario: Final lifecycle is observed

- **WHEN** a status sample observes Cloudflare `complete` for a D1 run in a final status
- **THEN** one structured observation contains the exact executor status and exact DEOS outcome without substituting a generic successful outcome

#### Scenario: Errored lifecycle is observed

- **WHEN** a status sample observes Cloudflare `errored`
- **THEN** one structured observation contains the executor error state, the independently read D1 status and node, and only a bounded service-authored error or transition cause

#### Scenario: Complete executor has non-success business state

- **WHEN** a status sample observes Cloudflare `complete` while the D1 run is denied, failed, canceled, or still non-final
- **THEN** the observation preserves that exact pair and cannot be queried or interpreted as DEOS success solely from the executor status

### Requirement: Lifecycle projections remain joinable and content-free

Every lifecycle projection observation SHALL contain the same D1 run id, recorded Workflow instance id, and correlation id used by the underlying run, and SHALL identify the observation schema version and sample time. Expected-event data and causes SHALL follow the projection capability's bounded allowlist. Observations MUST NOT contain provider payloads, issue titles or descriptions, comments, user details, stored matcher JSON, raw errors, prompts, credentials, or artifact bodies.

#### Scenario: Operator compares all three evidence sources

- **WHEN** an operator queries Workers Observability for a projected run
- **THEN** the observation identifiers locate the same D1 run and Cloudflare Workflow instance without matching on provider content

#### Scenario: Sensitive wait or error input exists

- **WHEN** a wait record or protected diagnostic record contains fields outside the projection allowlist
- **THEN** none of those fields appears in the emitted lifecycle observation

