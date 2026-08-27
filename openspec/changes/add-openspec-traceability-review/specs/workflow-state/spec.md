## ADDED Requirements

### Requirement: Gate human review on current trace proof

The flow SHALL save the active review round, stage, mode, shared repair-turn count, and review input ID. It SHALL save the plan hash and base finding set. It SHALL also save the reviewed head, when one exists. The flow SHALL enter `Human Review` when both stages pass for the active round or when all three shared author-repair turns are used and the independent review has completed on the current valid head. After an independent-review repair, both rechecks MUST match the current pull request head or have a trusted unchanged-file rebind to that head. A turn-limit gate SHALL be marked `needs_judgment` and SHALL show every open finding and proof conflict. An agent result MUST NOT count as human approval.

#### Scenario: Both reviews pass for the current head

- **WHEN** both checks pass for the active round and exact current pull request head
- **THEN** the flow saves the gate proof and may enter `AWAITING_HUMAN_APPROVAL`

#### Scenario: Shared repair turns are used

- **WHEN** the third author-repair turn is complete and the current valid head has a completed independent review with open findings
- **THEN** the flow saves a `needs_judgment` gate result and enters `AWAITING_HUMAN_APPROVAL` without another automated repair

#### Scenario: Review proof is stale

- **WHEN** the pull request head changes after either check passed
- **THEN** the flow marks that check stale and does not use it for the human gate

#### Scenario: Review result is not successful

- **WHEN** a check is blocked, fails, breaks its rules, or has an open finding before the shared turn limit
- **THEN** the flow uses its set fix, retry, fail, or help path and does not enter the human gate unless the turn-limit gate rule now applies

#### Scenario: Review phase has an accepted pass

- **WHEN** the current result has no findings or every base finding is fixed for the review input ID
- **THEN** the flow closes that phase and does not dispatch another semantic job for the same input

#### Scenario: Closed phase input changes

- **WHEN** a reviewed file changes after the phase closed
- **THEN** the flow marks the old pass stale, gives the changed input a new ID, and opens only the recheck required for that new input

#### Scenario: Closed phase receives an identical input

- **WHEN** the same review input ID reaches the closed phase again
- **THEN** the flow reuses the accepted result without spending another job try

### Requirement: Bound each trace repair loop

The flow SHALL set one shared limit of three author-repair turns for each round. The self-check and independent stage SHALL share that count. It SHALL also set a job limit for each review stage. Every started review job SHALL use one try. This includes a retry after a blocked or failed job. A saved-result reuse or trusted unchanged-file rebind SHALL not use a try because no review job starts. Each review job SHALL also have a firm time limit. A repair turn SHALL count only when a fresh author coding agent Codex job starts because of a semantic finding. A bad sidecar or invalid result SHALL use the proof-repair limit and SHALL not use an author-repair turn. A same-stage proof conflict without a source change SHALL stop that automated loop without a referee model. The independent stage SHALL still finish on the current valid head before the conflict goes to human judgment. A later human change SHALL start a new review round. That round SHALL get new full checks and fresh limits. DEOS SHALL keep all past proof.

#### Scenario: Repair remains within its limit

- **WHEN** a phase has an open base finding and an unused fix
- **THEN** the flow may start one fresh author fix and then one closed-set recheck

#### Scenario: Repair limit is exhausted

- **WHEN** the round still has an open semantic finding after its third author-repair turn
- **THEN** the flow finishes the independent review on the current valid head and enters `Human Review` with a `needs_judgment` result and no further automated repair

#### Scenario: Review job reaches its time limit

- **WHEN** a trace review job reaches its fixed run-time limit
- **THEN** DEOS stops the job, saves the safe result, and does not enter `Human Review`

#### Scenario: Review phase uses its job attempts

- **WHEN** a review phase reaches its job-attempt limit without a valid result
- **THEN** DEOS saves the stop result. It does not start another job in that phase or enter `Human Review`

#### Scenario: Human requests another revision

- **WHEN** an allowed person sends the plan back for a change
- **THEN** the flow starts a new round, keeps the old round, and calls for two new full checks
