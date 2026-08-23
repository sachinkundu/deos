## Purpose

Provide a small, independently selectable DEOS workflow that produces one reviewed OpenSpec planning pull request and stops after its verified merge.

## ADDED Requirements

### Requirement: Keep the simplified definition independently selectable

The system SHALL store the simplified planning definition as an immutable definition distinct from the existing full delivery definition. Its label selector SHALL be independently enabled for a configured project or trial repository, and registering the definition MUST NOT replace, mutate, or activate it for existing runs.

#### Scenario: Simplified definition is registered but inactive

- **WHEN** the simplified definition is registered while its selector is disabled
- **THEN** no new run selects it and the existing full definition remains the default

#### Scenario: Selector is enabled for a controlled trial

- **WHEN** an operator explicitly enables the simplified selector for the configured project and repository
- **THEN** only new eligible runs can select the simplified definition and the activation is durably auditable

#### Scenario: Existing run predates selector activation

- **WHEN** the selector is enabled or disabled while a run already has a frozen definition
- **THEN** that run continues with its recorded definition, version, and digest

### Requirement: Produce one planning pull request

The simplified workflow SHALL dispatch one planning agent that creates or revises the issue-named OpenSpec change through proposal, delta specifications, design, and tasks in dependency order, validates the complete planning bundle, and publishes it to one GitHub pull request. The planning agent MUST NOT change runtime code, transition Linear, approve its own work, or merge the pull request.

The pull-request title MUST identify the Linear issue as an OpenSpec plan. Its body MUST link to the Linear issue and name the OpenSpec change, then use the configured `Review notes`, `Review order`, and `Validation` sections. It MUST NOT copy or paraphrase the issue title, description, or acceptance content. Before publication, the agent-written review notes MUST have a Flesch Reading Ease score from 65 through 80 and a Flesch-Kincaid grade level no higher than 8.0. The exact scores SHALL be retained as validation evidence and MUST NOT be added to the pull-request body.

#### Scenario: First planning attempt completes

- **WHEN** the planning agent produces a proposal, every required delta specification, a design, and a task checklist that validate against the named OpenSpec change
- **THEN** it publishes the complete planning file set to one run-scoped branch and pull request and returns their exact durable provider receipt

#### Scenario: Planning artifacts are incomplete or invalid

- **WHEN** the proposal, required delta specifications, design, task checklist, or validation evidence is missing or invalid
- **THEN** the workflow does not enter `Human Review` and does not report the planning attempt as successful

#### Scenario: Pull-request text is not readable

- **WHEN** the title or body omits a required field, repeats Linear issue content, or its normalized review-note prose falls outside the configured readability limits
- **THEN** publication is rejected, the scores and reason are retained as validation evidence, and the workflow does not enter `Human Review`

#### Scenario: Planning agent attempts an excluded action

- **WHEN** the planning agent requests a Linear transition, pull-request merge, implementation change, or provider operation outside its declared capability
- **THEN** the request is rejected and the workflow does not treat the attempt as completed planning work

### Requirement: Reuse the planning pull request for revisions

Every authorized revision SHALL use a fresh isolated agent attempt while preserving the run-scoped planning branch and pull-request identity. The new attempt SHALL receive the durable planning patch, prior result, pull-request reference, and bounded human feedback needed to revise the same planning work product.

#### Scenario: Human requests planning changes

- **WHEN** an authorized person moves the issue from `Human Review` to `In Progress`
- **THEN** the workflow dispatches a fresh planning attempt that updates the same branch and pull request and returns to `Human Review` only after the revised planning files and provider receipt are complete

#### Scenario: Revision is retried

- **WHEN** publication of one logical revision is retried after an ambiguous response
- **THEN** the trusted GitHub capability reconciles the run-scoped branch and pull request without creating a duplicate pull request

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

The simplified workflow SHALL report success only after the trusted service reconciles the authorized pull-request merge and proves that the approved proposal, delta specifications, design, and tasks are present on `origin/main` at the recorded merge commit. The merge and verification operations SHALL be idempotent and SHALL retain durable GitHub and repository evidence.

#### Scenario: Authorized pull request is merged and verified

- **WHEN** GitHub reports the recorded planning pull request merged into `main` and the approved planning files are present at the resulting merge commit
- **THEN** the workflow records the merge and verification receipts and terminates successfully

#### Scenario: Merge response is ambiguous

- **WHEN** the merge request times out or its response is lost
- **THEN** the trusted service reads back the recorded pull request and `origin/main` before retrying and does not create or merge another pull request

#### Scenario: Pull request cannot be merged safely

- **WHEN** the recorded pull request is closed without merge, targets another base, has an unexpected head, conflicts, or fails required merge policy
- **THEN** the workflow records a safe non-success outcome and does not claim that planning reached `origin/main`

#### Scenario: Merge succeeds but planning files cannot be verified

- **WHEN** GitHub reports a merge but the approved planning files or their expected content cannot be confirmed at the recorded `main` commit
- **THEN** the workflow requires reconciliation and does not terminate successfully
