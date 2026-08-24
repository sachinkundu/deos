## Purpose

Provide a small, independently selectable DEOS workflow that produces one reviewed OpenSpec proposal-and-specification pull request and stops after its verified merge.

## ADDED Requirements

### Requirement: Keep the simplified definition independently selectable

The system SHALL store the simplified planning definition as an immutable definition distinct from the existing full delivery definition. Its label selector SHALL be independently enabled for a configured project and repository, and registering the definition MUST NOT replace, mutate, or activate it for existing runs.

#### Scenario: Simplified definition is registered but inactive

- **WHEN** the simplified definition is registered while its selector is disabled
- **THEN** no new run selects it and the existing full definition remains the default

#### Scenario: Selector is enabled for a controlled trial

- **WHEN** an operator explicitly enables the simplified selector for the configured project and repository
- **THEN** only new eligible runs can select the simplified definition and the activation is durably auditable

#### Scenario: Existing run predates selector activation

- **WHEN** the selector is enabled or disabled while a run already has a frozen definition
- **THEN** that run continues with its recorded definition, version, and digest

### Requirement: Produce one proposal-and-specification pull request

The simplified workflow SHALL dispatch one planning agent that creates or revises the issue-named OpenSpec change through its proposal and every required delta specification in dependency order, validates those artifacts, and publishes them with the required OpenSpec change metadata to one GitHub pull request. The planning agent MUST NOT create a design or task checklist, change runtime code, transition Linear, approve its own work, or merge the pull request.

#### Scenario: First planning attempt completes

- **WHEN** the planning agent produces a proposal and every required delta specification that validate against the named OpenSpec change
- **THEN** it publishes only those planning files and their required OpenSpec change metadata to one run-scoped branch and pull request and returns their exact durable provider receipt

#### Scenario: Planning artifacts are incomplete or invalid

- **WHEN** the proposal, a required delta specification, validation result, or publication receipt is missing or invalid
- **THEN** the workflow does not enter `Human Review` and does not report the planning attempt as successful

#### Scenario: Planning agent attempts a deferred action

- **WHEN** the planning agent requests a design, task checklist, runtime change, Linear transition, pull-request merge, or provider operation outside its declared capability
- **THEN** the request is rejected and the workflow does not treat the attempt as completed planning work

### Requirement: Claim admitted work before planning

For a selected simplified run, DEOS SHALL preserve any human assignee, delegate the issue to the configured DEOS app user, move it from `Todo` to `In Progress`, and confirm both fields through Linear before dispatching the planning agent. The claim operation SHALL be durable and idempotent. The planning agent MUST NOT perform this Linear update itself.

#### Scenario: Labeled Todo issue is claimed

- **WHEN** an accepted `Todo` transition selects the simplified workflow
- **THEN** DEOS delegates the issue to the configured app user, moves it to `In Progress`, confirms both values by provider read-back, and only then dispatches the planning agent

#### Scenario: Human ownership is preserved

- **WHEN** the issue has a human assignee when DEOS claims it
- **THEN** DEOS leaves the assignee unchanged and sets only the agent delegate and workflow state

#### Scenario: Claim is replayed

- **WHEN** the same durable claim action runs again after an ambiguous response or Workflow replay
- **THEN** DEOS reconciles the current state and delegate without creating another logical claim or repeating a confirmed provider effect

#### Scenario: Newer human intent conflicts with the claim

- **WHEN** provider read-back shows that a person moved the issue away from `Todo` or delegated it to another agent before the claim completed
- **THEN** DEOS fails safely, records the bounded conflict, and does not start the planning agent

### Requirement: Reuse the planning pull request for revisions

Every authorized revision SHALL use a fresh isolated agent attempt while preserving the run-scoped planning branch and pull-request identity. The new attempt SHALL receive the durable planning patch, prior result, pull-request reference, and bounded human feedback needed to revise the same proposal and specifications.

For each affected human GitHub review thread, the revision SHALL post one bounded acknowledgment through the trusted publication capability. The reply SHALL state what changed or why no change was made. The revision MUST NOT resolve the thread.

#### Scenario: Human requests planning changes

- **WHEN** an authorized person moves the issue from `Human Review` to `In Progress`
- **THEN** the workflow dispatches a fresh planning attempt that updates the same branch and pull request and returns to `Human Review` only after the revised proposal, specifications, and provider receipt are complete

#### Scenario: Revision is retried

- **WHEN** publication of one logical revision is retried after an ambiguous response
- **THEN** the trusted GitHub capability reconciles the run-scoped branch and pull request without creating a duplicate pull request

#### Scenario: Revision addresses review comments

- **WHEN** a revision receives human comments on one or more GitHub review threads
- **THEN** it replies once on each affected thread with what changed or why no change was made, and leaves every thread unresolved

#### Scenario: Earlier sandbox has been removed

- **WHEN** a revision begins after the prior planning sandbox was destroyed
- **THEN** the workflow reconstructs the planning checkout from durable context and does not depend on the earlier sandbox's files or processes

### Requirement: Merge only after an explicit human decision

The simplified workflow SHALL interpret the configured authorized decisions from `Human Review` as revision requested, merge authorized, or canceled. Only the merge-authorized path SHALL invoke a trusted workflow-owned GitHub merge action; neither an agent result nor a provider comment may authorize that action.

#### Scenario: Merge is authorized

- **WHEN** an authorized person moves the issue from `Human Review` to `Merging`
- **THEN** the workflow invokes the trusted merge path for the recorded planning pull request and records the human decision and provider operation

#### Scenario: Run is canceled

- **WHEN** an authorized person moves the issue from `Human Review` to `Canceled`
- **THEN** the run terminates as canceled without merging the pull request or dispatching another agent

#### Scenario: Unrecognized departure from Human Review

- **WHEN** an authorized person moves the issue from `Human Review` to a state that is not configured for the active gate
- **THEN** the workflow records the event without selecting a planning edge and restores or retains the gate according to policy

### Requirement: Verify the approved planning work on the default branch

The simplified workflow SHALL report success only after the trusted service reconciles the authorized pull-request merge and proves that the approved proposal and delta specifications are present on `origin/main` at the recorded merge commit. The merge and verification operations SHALL be idempotent and SHALL retain durable GitHub and repository evidence.

#### Scenario: Authorized pull request is merged and verified

- **WHEN** GitHub reports the recorded planning pull request merged into `main` and the approved proposal and specification files are present at the resulting merge commit
- **THEN** the workflow records the merge and verification receipts and terminates successfully

#### Scenario: Merge response is ambiguous

- **WHEN** the merge request times out or its response is lost
- **THEN** the trusted service reads back the recorded pull request and `origin/main` before retrying and does not create or merge another pull request

#### Scenario: Pull request cannot be merged safely

- **WHEN** the recorded pull request is closed without merge, targets another base, has an unexpected head, conflicts, or fails required merge policy
- **THEN** the workflow records a safe non-success outcome and does not claim that planning reached `origin/main`

#### Scenario: Merge succeeds but planning files cannot be verified

- **WHEN** GitHub reports a merge but the approved proposal, specifications, or expected content cannot be confirmed at the recorded `main` commit
- **THEN** the workflow requires reconciliation and does not terminate successfully
