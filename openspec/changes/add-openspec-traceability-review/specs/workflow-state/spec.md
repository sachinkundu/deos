## ADDED Requirements

### Requirement: Gate human review on current trace proof

The flow SHALL save the active review round, phase, mode, fix count, and review input ID. It SHALL save the plan hash and base finding set. It SHALL also save the reviewed head, when one exists. The flow SHALL enter `Human Review` only when both checks pass for the active round. After an outside repair, both rechecks MUST match the current pull request head or have a trusted unchanged-file rebind to that head. An agent result MUST NOT count as human approval.

#### Scenario: Both reviews pass for the current head

- **WHEN** both checks pass for the active round and exact current pull request head
- **THEN** the flow saves the gate proof and may enter `AWAITING_HUMAN_APPROVAL`

#### Scenario: Review proof is stale

- **WHEN** the pull request head changes after either check passed
- **THEN** the flow marks that check stale and does not use it for the human gate

#### Scenario: Review result is not successful

- **WHEN** a check is blocked, fails, breaks its rules, or has an open finding
- **THEN** the flow uses its set fix, retry, fail, or help path and does not enter the human gate

#### Scenario: Review phase has an accepted pass

- **WHEN** the current result has no findings or every base finding is fixed for the review input ID
- **THEN** the flow closes that phase and does not dispatch another semantic job for the same input

#### Scenario: Closed phase input changes

- **WHEN** a reviewed file changes after the phase closed
- **THEN** the flow marks the old pass stale and opens only the recheck required for the new review input

#### Scenario: Closed phase receives an identical input

- **WHEN** the same review input ID reaches the closed phase again
- **THEN** the flow reuses the accepted result without spending another job try

### Requirement: Bound each trace repair loop

The flow SHALL set a fix limit for each check. It SHALL set a job limit for each review phase in a round. Every started review job SHALL use one try. This includes a retry after a blocked or failed job. A saved-result reuse or trusted unchanged-file rebind SHALL not use a try because no review job starts. Each review job SHALL also have a firm time limit. A fix SHALL count only when a fresh author job starts for that phase. A proof conflict SHALL use the proof-repair limit. It SHALL not use an author fix unless its saved adjudication reopens the finding. A later human change SHALL start a new review round. That round SHALL get new full checks and fresh limits. DEOS SHALL keep all past proof.

#### Scenario: Repair remains within its limit

- **WHEN** a phase has an open base finding and an unused fix
- **THEN** the flow may start one fresh author fix and then one closed-set recheck

#### Scenario: Repair limit is exhausted

- **WHEN** a phase still has an open finding after its last fix
- **THEN** the flow saves the stop result and does not enter `Human Review`

#### Scenario: Review job reaches its time limit

- **WHEN** a trace review job reaches its fixed run-time limit
- **THEN** DEOS stops the job, saves the safe result, and does not enter `Human Review`

#### Scenario: Review phase uses its job attempts

- **WHEN** a review phase reaches its job-attempt limit without a valid result
- **THEN** DEOS saves the stop result. It does not start another job in that phase or enter `Human Review`

#### Scenario: Human requests another revision

- **WHEN** an allowed person sends the plan back for a change
- **THEN** the flow starts a new round, keeps the old round, and calls for two new full checks
