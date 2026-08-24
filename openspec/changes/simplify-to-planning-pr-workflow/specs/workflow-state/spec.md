## MODIFIED Requirements

### Requirement: Preserve explicit workflow state

The workflow state model SHALL record authoritative business-state transitions in D1, SHALL distinguish agent execution state from business workflow state, and SHALL represent human approval as an explicit node surfaced through the Linear board column `Human Review`. The encoded workflow definition SHALL describe nodes, decision edges, loops, autonomous actions, agent dispatches, human gates, terminal outcomes, and the configured Linear state that selects each human decision edge. The Workflow manager SHALL be the sole authority that initiates Linear state transitions and SHALL select the next action from the previous state, current state, accumulated run data, provider results, and agent outcome. For the simplified planning gate, the three authorized decisions SHALL be `In Progress` for revision of the same planning pull request, `Merging` for the workflow-owned merge path, and `Canceled` for terminal cancellation.

#### Scenario: Approval required

- **WHEN** the Workflow reaches a state designated by policy as a human gate after all prerequisite work succeeds
- **THEN** it enters `AWAITING_HUMAN_APPROVAL`, moves the issue into the `Human Review` board column, and does not advance automatically

#### Scenario: State continues autonomously

- **WHEN** a valid agent outcome reaches a state that policy defines as autonomous
- **THEN** the Workflow selects and records the next state or agent dispatch without requiring a human approval event

#### Scenario: Human resumes workflow

- **WHEN** a configured decision transition out of the `Human Review` board column is received from Linear with actor identity verified as an authorized human
- **THEN** the Workflow records the human decision and actor and selects the edge mapped to that exact provider state using the state from which the gate was entered, the current gate, and accumulated run data

#### Scenario: Simplified planning revision is requested

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `In Progress`
- **THEN** the Workflow records a revision-requested decision and dispatches the configured planning revision edge for the same run and pull request

#### Scenario: Simplified planning merge is authorized

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `Merging`
- **THEN** the Workflow records a merge-authorized decision and selects only the configured trusted merge edge

#### Scenario: Simplified planning run is canceled

- **WHEN** an authorized human moves an issue in the simplified planning gate from `Human Review` to `Canceled`
- **THEN** the Workflow records a canceled decision and selects the configured terminal cancellation edge without merging or dispatching another agent

#### Scenario: Human transition has no configured decision edge

- **WHEN** an authorized human moves an issue from `Human Review` to a provider state not mapped by the active gate
- **THEN** the Workflow records the unmatched event, selects no edge, and restores or retains the active human gate according to policy

#### Scenario: Automated event attempts to approve a human gate

- **WHEN** an approval-shaped event is attributable to an agent, integration, bot, unknown actor, or unauthorized human
- **THEN** the Workflow records the rejected decision event, keeps D1 in `AWAITING_HUMAN_APPROVAL`, and idempotently restores the issue to the `Human Review` board column before accepting another decision

#### Scenario: Provider restoration after unauthorized transition fails

- **WHEN** the Workflow cannot confirm that an issue moved by an unauthorized actor has been restored to `Human Review`
- **THEN** it records a provider-state repair failure, prevents further gate processing, and creates or updates an operator work item for reconciliation

#### Scenario: Auditable transition

- **WHEN** a business workflow state changes
- **THEN** the system records the prior state, next state, verified actor or system cause, triggering delivery or agent outcome, workflow run, and timestamp in D1

#### Scenario: Workflow execution resumes after interruption

- **WHEN** durable Workflow execution resumes or retries a state-machine step
- **THEN** it reconciles the D1 authoritative state before making a transition and does not repeat an already recorded provider effect

#### Scenario: Deployed definition advances while a run is active

- **WHEN** durable Workflow execution resumes after the deployed immutable definition bundle has advanced beyond the active run's selected version
- **THEN** it restores the run's canonical definition from D1, verifies the selected digest, and continues only through that frozen graph

#### Scenario: Workflow definition contains a loop or decision tree

- **WHEN** the current node has multiple permitted edges or returns to an earlier node
- **THEN** the Workflow evaluates the encoded conditions against accumulated run data and records the selected edge without substituting a hard-coded human gate
