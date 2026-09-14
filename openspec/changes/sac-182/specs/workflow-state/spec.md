## MODIFIED Requirements

### Requirement: Preserve explicit workflow state

`D1` SHALL hold the true business state and its change log. Agent state and business state SHALL stay apart. A human check SHALL be a clear graph node shown as `Human Review` in `Linear`.

The saved graph SHALL name nodes, paths, loops, agent work, system work, human gates, and end states. It SHALL map each human choice to a set task state. The `Workflow` manager SHALL be the only part that starts a task state change. It SHALL choose the next act from the graph, old and new state, run data, host results, and agent result.

A gate choice SHALL come from one of two checked human acts. It MAY come from a `Linear` state event whose user ID matches the allowed person. It MAY also come from a saved `BettaView` review whose checked `Access` and `GitHub` IDs match the frozen person link. The host app that sends a state change MUST NOT count as the person. For a `BettaView` choice, the saved review is the human act. The app state event is just proof of the task move.

At the plan gate, `In Progress` SHALL ask for an edit. `Merging` SHALL allow only the trusted merge path. `Canceled` SHALL end the run. A new simple run SHALL still keep its human owner, give work to the `DEOS` app, and move from `Todo` to `In Progress` before agent work.

#### Scenario: Approval required

- **WHEN** all prior work is done and the graph reaches a human gate.
- **THEN** the `Workflow` enters `AWAITING_HUMAN_APPROVAL`, moves the task to `Human Review`, and waits for a checked human choice.

#### Scenario: State continues autonomously

- **WHEN** a valid agent result reaches a node that the graph marks as self-run.
- **THEN** the `Workflow` saves the next state or starts the next agent with no human choice.

#### Scenario: Simplified run takes ownership of admitted work

- **WHEN** the simple flow starts from an allowed `Backlog` to `Todo` move.
- **THEN** it keeps the human owner, gives work to the app, proves `In Progress`, and then starts the agent.

#### Scenario: Human resumes workflow

- **WHEN** a task leaves `Human Review` through a set state event from the allowed `Linear` user ID.
- **THEN** the `Workflow` saves the human and choice and starts the path for that gate and state.

#### Scenario: BettaView comment asks for an edit

- **WHEN** a saved `COMMENT` or `REQUEST_CHANGES` review has the allowed frozen IDs and the gate is still open.
- **THEN** the `Workflow` moves the task to `In Progress`, proves that state, saves the review as the human choice, and starts the set edit path.

#### Scenario: BettaView approval allows a merge

- **WHEN** a saved `APPROVE` review has the allowed frozen IDs and the gate is still open.
- **THEN** the `Workflow` moves the task to `Merging`, proves that state, saves the review as the human choice, and starts only the set merge path.

#### Scenario: Simplified planning revision is requested

- **WHEN** the allowed person moves a plan task from `Human Review` to `In Progress`.
- **THEN** the `Workflow` saves an edit choice and starts the set plan edit for the same run and pull request.

#### Scenario: Simplified planning merge is authorized

- **WHEN** the allowed person moves a plan task from `Human Review` to `Merging`.
- **THEN** the `Workflow` saves a merge choice and starts only the trusted merge path.

#### Scenario: Simplified planning run is canceled

- **WHEN** the allowed person moves a plan task from `Human Review` to `Canceled`.
- **THEN** the `Workflow` saves the choice and ends the run with no merge or new agent.

#### Scenario: Human transition has no configured decision edge

- **WHEN** the allowed person moves a task to a state that the open gate does not map.
- **THEN** the `Workflow` saves the missed event, starts no path, and keeps or puts back the open gate as set by policy.

#### Scenario: App state event matches a saved review

- **WHEN** the app state event has the task move made for a saved and checked `BettaView` choice.
- **THEN** the `Workflow` links it to that choice and does not save the choice or start the path again.

#### Scenario: Automated event attempts to approve a human gate

- **WHEN** an agent, app, bot, unknown actor, or barred person sends a gate-like event with no valid saved choice.
- **THEN** the `Workflow` rejects it, stays in `AWAITING_HUMAN_APPROVAL`, and puts the task back in `Human Review` once.

#### Scenario: BettaView task move fails

- **WHEN** the app cannot prove the task state for a checked `BettaView` choice.
- **THEN** the `Workflow` keeps the gate open, starts no path, and lets the same review retry only the task move.

#### Scenario: Provider restoration after unauthorized transition fails

- **WHEN** the `Workflow` cannot prove that an invalid move was put back in `Human Review`.
- **THEN** it saves the repair fault, stops more gate work, and opens or updates an ops item.

#### Scenario: Auditable transition

- **WHEN** a business state changes.
- **THEN** `D1` keeps the old state, new state, checked human or system cause, source event or review, run, and time.

#### Scenario: Workflow execution resumes after interruption

- **WHEN** durable work starts again or retries a state step.
- **THEN** it reads the true state from `D1` and does not repeat a saved host act.

#### Scenario: Deployed definition advances while a run is active

- **WHEN** durable work starts after a new graph has been put live.
- **THEN** it loads the run's saved graph, checks its digest, and uses only that graph.

#### Scenario: Workflow definition contains a loop or decision tree

- **WHEN** a node has more than one path or goes back to an old node.
- **THEN** the `Workflow` checks run data and saves the set path without adding a hard-coded gate.
