## ADDED Requirements

### Requirement: Give every genuine workflow traversal a durable identity

The Workflow SHALL assign a durable visit identity to each genuine visit to a workflow node and SHALL derive each selected edge traversal from the visit that selected it. A traversal identity MUST be unique within the workflow run for a later genuine traversal of the same edge, and MUST remain stable when durable execution replays or retries that same logical traversal. D1 SHALL contain exactly one transition record for each genuine traversal.

#### Scenario: First traversal of an edge

- **WHEN** the Workflow selects an edge from the current node for the first time in a run
- **THEN** it records one transition with the durable identity of that traversal and advances the run to the selected node

#### Scenario: Durable execution replays the same traversal

- **WHEN** durable execution retries or replays a logical traversal that D1 has already recorded
- **THEN** the Workflow reuses that traversal's identity, does not add another transition record, does not advance the run again, and does not repeat a provider effect

#### Scenario: A loop traverses the same edge again

- **WHEN** the encoded workflow returns to an earlier node and genuinely selects an edge already traversed in the same run
- **THEN** the later traversal receives a new durable identity and D1 records a separate transition even when its from-node, to-node, outcome, and cause match the earlier traversal

### Requirement: Keep the authoritative run and transition ledger in agreement

The authoritative run-node update and its transition-ledger insert SHALL commit as one atomic state change guarded by the expected current visit and node. A successful state change MUST update the run to the selected next node and insert exactly one matching transition record; if either write cannot be committed, neither write SHALL take effect.

#### Scenario: Transition commits successfully

- **WHEN** the expected visit and current node still match and the transition identity has not been recorded
- **THEN** D1 advances the run and inserts its matching transition record in the same commit

#### Scenario: Concurrent attempts commit one traversal

- **WHEN** two executions concurrently attempt to commit the same logical traversal from the same expected visit
- **THEN** exactly one execution advances the run and records the transition, while the other reconciles the already-recorded traversal without adding a row or advancing again

#### Scenario: Stale attempt loses a compare-and-set

- **WHEN** an execution attempts a transition from a visit or current node that is no longer authoritative
- **THEN** it changes neither the run nor the transition ledger and reloads D1 authority before deciding whether any further action is valid

#### Scenario: Transition identity conflicts with different facts

- **WHEN** a proposed transition identity already names a transition with different run, visit, edge, cause, actor, or provider-operation facts
- **THEN** the Workflow fails the commit as an identity conflict and does not treat it as a replay

### Requirement: Scope human-gate entry operations to the gate visit

Each operation that moves a Linear issue into a configured human-gate state SHALL have a stable identity scoped to the workflow run and the durable visit to that gate. Retrying or reconciling one gate visit MUST reuse its existing operation, while a later genuine visit to the same gate MUST use a new operation.

#### Scenario: Human-gate entry is retried

- **WHEN** the Workflow retries or reconciles entry into the same durable human-gate visit
- **THEN** it reuses the visit's provider operation and does not issue a second Linear transition for that visit

#### Scenario: Workflow returns to the same human gate

- **WHEN** a loop or rejection path creates a later genuine visit to a human gate already visited in the run
- **THEN** the Workflow creates a new visit-scoped provider operation and moves the Linear issue into the configured human-gate state for the new visit
