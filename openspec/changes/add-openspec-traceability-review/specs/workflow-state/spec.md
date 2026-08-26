## ADDED Requirements

### Requirement: Gate human review on current trace proof

The flow SHALL save the active review round, phase, mode, and fix count. It SHALL save the plan hash and base finding set. It SHALL also save the reviewed head, when one exists. The flow SHALL enter `Human Review` only when both checks pass for the active round. The outside check MUST match the current pull request head. An agent result MUST NOT count as human approval.

#### Scenario: Both reviews pass for the current head

- **WHEN** both checks pass for the active round and current pull request head
- **THEN** the flow saves the gate proof and may enter `AWAITING_HUMAN_APPROVAL`

#### Scenario: Review proof is stale

- **WHEN** the pull request head changes after the outside check passed
- **THEN** the flow marks that proof stale and does not use it for the human gate

#### Scenario: Review result is not successful

- **WHEN** a check is blocked, fails, breaks its rules, or has an open finding
- **THEN** the flow uses its set fix, retry, fail, or help path and does not enter the human gate

### Requirement: Bound each trace repair loop

The flow SHALL set a separate fix limit for each check. It SHALL count a fix only when it starts a fresh author job for that phase. A later human change SHALL start a new review round. That round SHALL get new full checks and fresh limits. DEOS SHALL keep all past proof.

#### Scenario: Repair remains within its limit

- **WHEN** a phase has an open base finding and an unused fix
- **THEN** the flow may start one fresh author fix and then one closed-set recheck

#### Scenario: Repair limit is exhausted

- **WHEN** a phase still has an open finding after its last fix
- **THEN** the flow saves the stop result and does not enter `Human Review`

#### Scenario: Human requests another revision

- **WHEN** an allowed person sends the plan back for a change
- **THEN** the flow starts a new round, keeps the old round, and calls for two new full checks
