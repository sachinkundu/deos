## Purpose

Turn an approved design into tested code and clear proof without a person starting work from a local machine.

## ADDED Requirements

### Requirement: Start implementation after the approved design is merged

DEOS SHALL start implementation only after an allowed person approves the design merge and the trusted service proves that the approved plan, specs, and design are on the base branch. The next step SHALL start on its own. It MUST NOT need a local prompt.

The implementation agent SHALL get the approved planning files, design, base revision, issue context, and prior proof. It SHALL create the OpenSpec task list as an internal work file and then complete the tasks. The task list MUST NOT add a new approval gate.

#### Scenario: Design merge is checked

- **WHEN** the trusted service proves that the approved design merge and all prior plan files are on the base branch.
- **THEN** DEOS starts the implementation stage with that exact base revision and context.

#### Scenario: Design is approved but not yet checked

- **WHEN** a person has approved the design but its merge or base-branch content is not yet proven.
- **THEN** DEOS does not start implementation or claim that the design gate is complete.

#### Scenario: Task list is ready

- **WHEN** the implementation agent creates a task list from the approved plan and design.
- **THEN** it starts the listed work without asking for a separate task review.

### Requirement: Build and check the full change

The implementation agent SHALL work through every task, run the checks that fit the change, and inspect any web app behavior in its assigned browser. It SHALL fix faults that it can prove and rerun the affected checks.

For provider work, completion SHALL include a real provider event from a safe test resource when the provider offers one. Synthetic ingress MAY aid checks, but it MUST be labeled as synthetic and MUST NOT be called full provider proof.

#### Scenario: Browser check finds a fault

- **WHEN** the agent sees a fault while it checks the changed web app in its assigned browser.
- **THEN** it fixes the fault, reruns the useful checks, and records the new browser proof.

#### Scenario: Integration has a safe provider test path

- **WHEN** the change adds or alters a provider integration that can use a real test resource.
- **THEN** the agent triggers that resource and keeps provider-originated proof apart from any synthetic ingress proof.

#### Scenario: A task is still open

- **WHEN** any required task, check, or proof is incomplete.
- **THEN** DEOS does not publish the work as ready for human review.

### Requirement: Plan and judge demos independently

Every implementation SHALL have a demo plan from a fresh Claude reviewer before Codex starts the build. The reviewer SHALL read the approved proposal, specs, and design. Each demo SHALL name the requirements it covers, the safe environment, steps, expected result, and evidence needed. All approved requirements SHALL be covered. Prefer visual proof where it shows the behavior. Nonvisual work SHALL still have real behavior proof. The implementer MUST NOT remove or weaken a saved requirement.

After Codex supplies current evidence, a separate fresh Claude reviewer SHALL judge every planned demo. It SHALL inspect the actual proof and relevant code. It MUST NOT accept the implementer's summary, a fixture screenshot, or unrelated provider calls as proof that the changed application works. Required images SHALL be available as images. The service SHALL check evidence provenance, subject hashes, and reviewer access as well as the verdict.

The gate SHALL return Pass, Needs work, or Blocked with a clear reason for each demo. Needs work SHALL return the saved patch and specific gaps to Codex in a fresh try. Blocked SHALL preserve the reason and use the clarification path. An execution or transport failure MUST NOT become a pass. PR publication and final Human Review SHALL require a pass for the exact current candidate and demo plan. Later changes SHALL require a new verdict.

#### Scenario: Every implementation gets a demo contract

- **WHEN** task creation completes from the approved design.
- **THEN** Claude defines the required demos before Codex executes the tasks.

#### Scenario: Evidence misses the changed flow

- **WHEN** tests pass but evidence does not show a required application outcome.
- **THEN** the gate names the missing outcome and returns work to Codex without publishing the PR.

#### Scenario: A visual demo passes

- **WHEN** the reviewer marks a visual demo passed.
- **THEN** the service proves that the reviewer opened its current, hash-checked image and that the evidence belongs to the reviewed candidate.

#### Scenario: An existing failed canary adopts the gate

- **WHEN** an operator explicitly migrates a failed implementation run with no active agent or open human gate.
- **THEN** a durable transition records both definition digests, preserves the approved design, human binding, patch, branch, and PR, and resumes at Demo Plan. A deploy alone MUST NOT rewrite frozen runs.

### Requirement: Pause for a needed human choice and resume from the reply

The agent SHALL make safe, relevant assumptions when the approved work gives enough direction. If a choice would change product intent, safety, or the approved design, it SHALL return one clear question and the reason that work cannot safely continue.

Project setup SHALL bind the one allowed Gmail-backed human account to its exact Linear user ID. The trusted flow SHALL use that saved ID for each human check. A name or email in note text MUST NOT prove who sent an event.

The trusted flow SHALL post the question on the Linear issue and move the issue to `Human Review`. It SHALL then wait without keeping the old agent alive. A reply SHALL count only when trusted ingress proves a new Linear comment event on the same issue. The event actor SHALL match the saved user ID, and the comment SHALL come after the open question. An old, changed, deleted, or unclear comment MUST NOT resume work.

An allowed reply that answers the open question SHALL resume the same build run in a fresh try with the reply and saved work. Service users, bots, and other people MUST NOT answer the gate.

#### Scenario: Agent can make a safe assumption

- **WHEN** the approved work supports one safe choice within its stated scope.
- **THEN** the agent records the assumption and continues without asking a person.

#### Scenario: A material choice is missing

- **WHEN** the agent cannot continue without changing intent, safety, or the approved design.
- **THEN** the workflow posts one clear question, enters `Human Review`, and waits without reporting implementation success.

#### Scenario: Allowed person replies

- **WHEN** a new comment event on the same issue answers the open question and its actor matches the saved Linear user ID.
- **THEN** DEOS records the reply, returns the issue to active work, and starts a fresh implementation attempt with the saved branch and context.

#### Scenario: Untrusted actor replies

- **WHEN** a service user, bot, unknown actor, or other person replies to the open question.
- **THEN** DEOS records the reply as untrusted and keeps waiting for the allowed human account.

#### Scenario: Reply event is unclear

- **WHEN** the comment event, actor, issue, time, or link to the open question cannot be proved.
- **THEN** DEOS keeps the gate closed and reads back Linear before it may accept a reply.

### Requirement: Publish one proof-backed implementation pull request

When all tasks and checks pass, DEOS SHALL publish or update one run-scoped implementation pull request. It SHALL target the approved base branch. The pull request SHALL include the task list, code, tests, exact check results, and links to durable proof.

Proof SHALL show the changed behavior. For user-facing work, it SHALL include sanitized browser images of the changed state when a visual check is possible. When a visual check does not fit, it SHALL include Showboat records of the real commands and outputs. Unit test results MAY support the proof but MUST NOT be the only behavior proof.

Each proof item SHALL state which change and approved base it checks. Before each pull request post and move to final review, a trusted check SHALL confirm that all needed proof still fits the current work. A later change to the code or base SHALL make affected proof stale. DEOS MUST NOT mark the pull request ready or open the final gate until the current work has complete proof.

#### Scenario: User-facing work is complete

- **WHEN** the agent has checked a user-facing change in its assigned browser.
- **THEN** the pull request shows sanitized visual proof with the checks and task results.

#### Scenario: Visual proof does not fit

- **WHEN** the changed behavior has no useful visual state.
- **THEN** the pull request explains why and links to Showboat proof from the real check.

#### Scenario: Only unit tests exist

- **WHEN** all unit tests pass but no proof shows the changed behavior.
- **THEN** DEOS keeps the work out of the final human gate.

#### Scenario: Work changes after proof

- **WHEN** the code or approved base changes after proof was saved.
- **THEN** DEOS marks the affected proof stale and blocks the final gate until the current work has new proof.

### Requirement: Keep final approval and release with a person

After the pull request and current proof are read back, DEOS SHALL move the issue to `Human Review`. A human choice SHALL count only from a trusted Linear state event for that gate. Its actor SHALL match the saved Linear user ID. A move to `In Progress` SHALL ask for an edit. A move to `Merging` SHALL allow the trusted merge path. A comment, label, agent result, or unclear event MUST NOT make either choice.

Only the allowed human account SHALL make the choice. A revision SHALL update the same pull request through a fresh isolated attempt. The trusted service MAY carry out a merge only after it proves and saves the exact human merge event. The service MUST NOT choose the merge.

An implementation merge MUST NOT deploy or release the change. Any live release SHALL be a separate, explicit action outside this workflow.

#### Scenario: Implementation is ready

- **WHEN** the trusted service reads back the code pull request, checks, and required proof.
- **THEN** DEOS enters `Human Review` and shows the exact work that needs a human choice.

#### Scenario: Human asks for a revision

- **WHEN** a trusted state event from the saved Linear user ID moves the issue from this gate to `In Progress`.
- **THEN** DEOS starts a fresh attempt on the same run branch and updates the same pull request.

#### Scenario: Agent output looks like approval

- **WHEN** an agent, service user, check, comment, or unclear event looks like approval.
- **THEN** DEOS ignores it as approval and keeps the human gate closed.

#### Scenario: Implementation is merged

- **WHEN** a trusted state event from the saved Linear user ID moves the issue from this gate to `Merging`.
- **THEN** the trusted service may carry out the code merge but does not choose it or deploy it.
