## ADDED Requirements

### Requirement: Gate human review on current trace proof

The flow SHALL save the active review round, stage, mode, self-check repair-turn count, and review input ID. It SHALL save the plan hash and base finding set. It SHALL also save the reviewed head, when one exists. The flow SHALL enter `Human Review` after the self-check gate, one completed independent review, one complete author disposition set, trusted validation of any author change, and pull request read-back. Independent findings and disputed links MUST NOT block this transition. They SHALL stay visible for human judgment. An agent result MUST NOT count as human approval.

#### Scenario: Independent review has semantic concerns

- **WHEN** the independent review completes with findings or disputed links and the author records every disposition
- **THEN** the flow saves the review and response proof and may enter `AWAITING_HUMAN_APPROVAL`

#### Scenario: Self-check repair turns are used

- **WHEN** the third author-repair turn is complete and the current valid head has a completed independent review with open findings
- **THEN** the flow saves a `needs_judgment` gate result and enters `AWAITING_HUMAN_APPROVAL` without another automated repair

#### Scenario: Untracked head change makes proof stale

- **WHEN** the pull request head changes outside the trusted author response linked to the independent review
- **THEN** the flow marks the affected proof stale and does not use it for the human gate

#### Scenario: Independent review work fails

- **WHEN** the independent job cannot run safely, produce parseable source-bound claims, save its proof, or complete provider read-back
- **THEN** the flow uses its set retry, fail, or help path and does not enter the human gate

#### Scenario: Independent review phase completes

- **WHEN** both directional passes are structurally valid for the review input ID
- **THEN** the flow closes that phase as `pass` even when semantic findings or disputed links remain

#### Scenario: Closed self-check input changes

- **WHEN** a reviewed file changes after the self-check phase closed
- **THEN** the flow marks the old pass stale, gives the changed input a new ID, and opens the required self-check

#### Scenario: Author responds after independent review

- **WHEN** the trusted author response changes the reviewed plan and records every disposition
- **THEN** the flow links the later head to the original independent review and does not ask the independent reviewer to recheck its advice

#### Scenario: Closed phase receives an identical input

- **WHEN** the same review input ID reaches the closed phase again
- **THEN** the flow reuses the accepted result without spending another job try

#### Scenario: Compatible failed review tail is upgraded

- **WHEN** a version 11 run has published its exact plan and its latest cleaned-up `independent_discovery` attempt failed
- **THEN** an authenticated retry may bind that unchanged completed prefix to the exact registered version 12 definition, replace the Workflow instance, and continue the same run through independent review, author response, and human review

### Requirement: Bound the self-check repair loop and external work

The flow SHALL set one limit of three self-check author-repair turns for each round. The independent stage SHALL not use that count and SHALL not start a semantic repair loop. The flow SHALL also set a job limit for each review stage. Every started review job SHALL use one try. This includes a retry after a blocked or failed job. A saved-result reuse or trusted unchanged-file rebind SHALL not use a try because no review job starts. Each review job SHALL also have a firm time limit. A repair turn SHALL count only when a fresh author coding agent Codex job starts because of a self-check semantic finding. A bad sidecar or invalid result SHALL use the proof-repair limit and SHALL not use an author-repair turn. A same-stage self-check proof conflict without a source change SHALL stop that automated loop without a referee model. The independent stage SHALL still finish on the current valid head before that conflict goes to human judgment. A later human change SHALL start a new review round. That round SHALL get new full checks and fresh limits. DEOS SHALL keep all past proof.

#### Scenario: Repair remains within its limit

- **WHEN** the self-check has an open base finding and an unused fix
- **THEN** the flow may start one fresh author fix and then one closed-set self-check recheck

#### Scenario: Repair limit is exhausted

- **WHEN** the self-check still has an open semantic finding after its third author-repair turn
- **THEN** the flow publishes the valid plan, completes one independent review and author response, and enters `Human Review` with the open evidence and no further automated repair

#### Scenario: Review job reaches its time limit

- **WHEN** a trace review job reaches its fixed run-time limit
- **THEN** DEOS stops the job, saves the safe result, and does not enter `Human Review`

#### Scenario: Review phase uses its job attempts

- **WHEN** a review phase reaches its job-attempt limit without a valid result
- **THEN** DEOS saves the stop result. It does not start another job in that phase or enter `Human Review`

#### Scenario: Human requests another revision

- **WHEN** an allowed person sends the plan back for a change
- **THEN** the flow starts a new round, keeps the old round, and calls for two new full checks
