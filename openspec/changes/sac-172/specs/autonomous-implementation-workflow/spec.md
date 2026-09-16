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
- **THEN** DEOS retains the unfinished task or failed check as review context. Claude and the human judge the work; the workflow does not reject completion.

### Requirement: Plan and judge demos independently

Every implementation SHALL receive a demo plan from Claude based on the approved proposal, specs, design, and available runtime. Claude SHALL choose useful scenarios and prefer visual demonstrations where they explain behavior. The workflow SHALL forward the plan without checking requirement coverage or enforcing an evidence checklist.

The demo count SHALL follow Claude's plan for the actual implementation. A canary-specific image count MUST NOT become a platform quota. Plans SHALL remain recommendations that agents can revise in light of accepted human direction.

Sol SHALL implement the work, choose useful checks and demos, and report actual results and limitations. Claude SHALL review the first implementation once, inspect the available evidence and relevant code, and return Pass, Needs work, or Blocked. The workflow SHALL save and forward Claude's response unchanged. It MUST NOT audit citations, scenario coverage, input or evidence identity, or the judgment itself.

Needs work SHALL pass Claude's findings to Sol. Sol SHALL act on them once and report what changed or remains unresolved. The workflow SHALL then publish the implementation PR for human judgment. Claude's original findings and Sol's response SHALL remain in the transcripts. It MUST NOT generate repair instructions, assess whether the findings were satisfied, or send the response back to Claude. Pass SHALL go directly to publication. Blocked SHALL use the clarification route. Execution and transport failures SHALL preserve their original errors. Only the authorized human may approve or request another revision.

#### Scenario: Every implementation gets a demo contract

- **WHEN** task creation completes from the approved design.
- **THEN** Claude defines the required demos before Codex executes the tasks.

#### Scenario: Evidence misses the changed flow

- **WHEN** tests pass but evidence does not show a required application outcome.
- **THEN** the gate names the missing outcome and returns work to Codex without publishing the PR.

#### Scenario: A visual demo passes

- **WHEN** the reviewer marks a visual demo passed.
- **THEN** the workflow accepts the reviewer’s judgment. No evidence audit or second reviewer is required.

#### Scenario: One repair pass ends at human review

- **WHEN** Sol completes its response to Claude’s findings.
- **THEN** the service publishes the implementation PR for human judgment, retains the original demo findings, and does not repeat the demo review automatically.

#### Scenario: An existing failed canary adopts the gate

- **WHEN** an operator explicitly migrates a failed implementation run with no active agent or open human gate.
- **THEN** an immutable upgrade record retains both definition digests, the approved design, human binding, patch, branch, and PR. Activation-only migration leaves the failed visit and workflow instance stopped; an explicitly requested continuation resumes the chosen failed stage. A deploy alone MUST NOT rewrite frozen runs.

#### Scenario: A saved demo asks for an out-of-scope platform operation

- **WHEN** an operator requests correction against the exact saved plan and scenario after the attempt has stopped and cleanup has completed.
- **THEN** the next agent receives the recorded reason and actual runtime limits as context. Claude decides the appropriate correction without a workflow audit of coverage or evidence kinds.

### Requirement: Pause for a needed human choice and resume from the reply

The agent SHALL make safe, relevant assumptions when the approved work gives enough direction. If a choice would change product intent, safety, or the approved design, it SHALL return one clear question and the reason that work cannot safely continue.

Project setup SHALL bind the one allowed Gmail-backed human account to its exact Linear user ID. The trusted flow SHALL use that saved ID for each human check. A name or email in note text MUST NOT prove who sent an event.

The trusted flow SHALL post the question on the Linear issue and move the issue to `Human Review`. It SHALL then wait without keeping the old agent alive. A reply SHALL count only when trusted ingress proves a new Linear comment event on the same issue. The event actor SHALL match the saved user ID, and the comment SHALL come after the open question. An old, changed, deleted, or unclear comment MUST NOT resume work.

An allowed reply that answers the open question SHALL resume the same build run in a fresh try with the reply and saved work. Service users, bots, and other people MUST NOT answer the gate.

Accepted questions and replies SHALL remain available to subsequent implementation and demo agents after the active question closes. Agents SHALL apply relevant later human direction over earlier assumptions. An existing ready demo plan SHALL be reused after ordinary clarification; missing or blocked planning MAY return to Demo Plan.

#### Scenario: Agent can make a safe assumption

- **WHEN** the approved work supports one safe choice within its stated scope.
- **THEN** the agent records the assumption and continues without asking a person.

#### Scenario: Finished code cannot be published

- **WHEN** publishing the saved implementation branch or pull request fails.
- **THEN** DEOS retains the code, demos and original provider error, posts one question on Linear, and waits for the allowed human reply. Sol receives the reply with the saved work and can adjust what is published. Claude is not invoked again, and no permission is widened by the workflow.

#### Scenario: Publication question is retried

- **WHEN** delivery of the question is retried after an interruption.
- **THEN** DEOS reconciles the same Linear comment and waits at the same decision without posting duplicate questions or repeating the implementation.

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

After the agent handoff completes, DEOS SHALL publish or update one run-scoped implementation pull request. It SHALL target the approved base branch. The body SHALL contain the issue title, implementation and release statement, Linear link, approved Proposal and Specs PR link, approved design PR link, numbered behavior images with explanations, and one Showboat file link. Images SHALL render inside GitHub without requiring a DEOS session. Unit tests, internal test results, revision hashes, and discussion between agents SHALL remain in transcripts and saved diagnostics rather than the PR body.

Proof SHALL show the changed behavior. For user-facing work, it SHALL include sanitized browser images of the changed state when a visual check is possible. When a visual check does not fit, it SHALL include Showboat records of the real commands and outputs. Unit test results MAY support the proof but MUST NOT be the only behavior proof.

Evidence SHALL retain its recorded origin and revision as context. The workflow MUST NOT require particular proof kinds, passing command results, a full task checklist, citation receipts, or matching evidence hashes to advance. Claude and the human decide whether the work and demos are sufficient. Filesystem isolation, authenticated access, durable storage and reserved branch publication remain transport responsibilities.

#### Scenario: User-facing work is complete

- **WHEN** the agent has checked a user-facing change in its assigned browser.
- **THEN** the pull request shows sanitized images with plain explanations and a Showboat link. The repository's existing access rules govern the proof files.

#### Scenario: GitHub cannot authenticate to the portal

- **WHEN** saved proof is available only through a protected DEOS endpoint.
- **THEN** the publisher copies the review images and Showboat records into the same GitHub repository and embeds repository image links, without changing the implementation head or its human gate.

#### Scenario: Visual proof does not fit

- **WHEN** the changed behavior has no useful visual state.
- **THEN** the pull request explains why and links to Showboat proof from the real check.

#### Scenario: Only unit tests exist

- **WHEN** all unit tests pass but no proof shows the changed behavior.
- **THEN** Claude receives that limitation and decides what to recommend to Sol.

#### Scenario: Work changes after proof

- **WHEN** the code or approved base changes after proof was saved.
- **THEN** Sol decides which checks or demonstrations to repeat and reports the result; the workflow forwards the saved evidence without blocking on its revision.

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
- **AND** Sol's response returns to human review without another automatic Claude review.

#### Scenario: Agent output looks like approval

- **WHEN** an agent, service user, check, comment, or unclear event looks like approval.
- **THEN** DEOS ignores it as approval and keeps the human gate closed.

#### Scenario: Implementation is merged

- **WHEN** a trusted state event from the saved Linear user ID moves the issue from this gate to `Merging`.
- **THEN** the trusted service may carry out the code merge but does not choose it or deploy it.

### Requirement: Recover the failed stage without repeating completed work

Retries SHALL preserve approved inputs, accepted plans, saved code, branch, PR, prior stages and original diagnostics. Agent retries SHALL restore that context. Publication retries SHALL reconcile the saved candidate and provider operation without rerunning completed agent stages. Sol SHALL decide which checks to repeat after edits; the workflow SHALL NOT require a full test or evidence restart.

#### Scenario: PR publication fails after coding

- **WHEN** the provider response is lost after a saved candidate was published.
- **THEN** the retry reads back the same operation and PR before another write and does not restart implementation.

#### Scenario: Linear request ends before Queue delivery

- **WHEN** the delivery receipt and pending payload were saved but dispatch did not finish.
- **THEN** the delivery retry or scheduled recovery sends the saved message under a lease; duplicate Queue delivery keeps the same inbox identity.
