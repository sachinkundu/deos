## ADDED Requirements

### Requirement: Create a design from the approved plan

After the plan pull request is merged and checked, the current default flow SHALL start a fresh design job. The job SHALL use the approved proposal and specs. It SHALL also read the repo rules and current architecture text from the base commit for that attempt. The job SHALL write or revise only the design for the named OpenSpec change. It MUST NOT write tasks or app code. It MUST run the strict OpenSpec check before it can pass.

#### Scenario: Approved plan starts design work

- **WHEN** the approved proposal and specs are present at the checked plan merge commit.
- **THEN** the flow starts a design job from that commit and gives it the plan and the repo guidance from that base.

#### Scenario: Design fits the current repo

- **WHEN** the design job reads the repo rules and architecture text from its base commit.
- **THEN** the design states how the planned change fits that repo state and notes any key limit or tradeoff.

#### Scenario: Design output is not valid

- **WHEN** the design is absent, changes a file outside its allowed plan set, or fails the strict OpenSpec check.
- **THEN** the flow does not post the design or enter its human gate.

#### Scenario: Design job asks for later work

- **WHEN** the design job asks to write tasks or app code, deploy, archive, change Linear state, post or merge a pull request, or do other provider work.
- **THEN** the request is denied and the job does not pass.

### Requirement: Publish one separate design pull request

A trusted step SHALL post each valid design to one run-scoped design branch and pull request. The design pull request SHALL be separate from the plan pull request. It SHALL target the default branch that holds the checked plan merge. The design job MUST NOT get GitHub write access. The flow SHALL enter the design human gate only after it reads back the right branch, base, head, and open pull request.

#### Scenario: First design is ready

- **WHEN** the design job returns one valid design and the trusted checks pass.
- **THEN** the trusted step opens the run's design pull request and records its branch, base, head, and provider receipt.

#### Scenario: Design pull request cannot be proved

- **WHEN** the pull request is absent, closed, on the wrong branch or base, or has an unknown head.
- **THEN** the flow does not enter the design human gate and records a safe failure.

#### Scenario: Publish is tried twice

- **WHEN** the trusted design post is retried after a timeout or lost reply.
- **THEN** it reads back the same branch and pull request and does not make a second one.

### Requirement: Reuse the design pull request for changes

Each design change SHALL use a fresh job attempt. The flow SHALL keep the run's design branch and pull request. The new attempt SHALL get the last saved design, the approved plan, the repo guidance for its base, the prior result, and the bounded human notes. A trusted post SHALL update the same pull request.

For each changed root review thread, the trusted post SHALL add one short reply. The reply SHALL say what changed or why no change was made. It MUST NOT close the thread.

#### Scenario: A person asks for design changes

- **WHEN** an allowed person sends the design gate from `Human Review` to `In Progress`.
- **THEN** the flow starts a fresh design attempt and updates the same design pull request before it goes back to `Human Review`.

#### Scenario: A change note is addressed

- **WHEN** a design change gets one or more root review comments.
- **THEN** the trusted post replies once to each changed thread and leaves each thread open.

#### Scenario: The first design sandbox is gone

- **WHEN** a design change starts after the prior sandbox was removed.
- **THEN** the flow restores the saved design and review facts and does not need the old sandbox.

### Requirement: End only after the design merge is checked

The current default flow SHALL end with success only after a trusted step reads back the approved design merge. It SHALL prove that the saved design pull request was merged to the default branch and that the approved design is present at the merge commit. The merge and check SHALL be safe to retry. The flow SHALL keep durable GitHub and repo proof.

#### Scenario: Design pull request is merged and checked

- **WHEN** GitHub shows the saved design pull request as merged to the default branch and the approved design is present at that merge commit.
- **THEN** the flow saves the merge and check proof and ends with success.

#### Scenario: Design merge reply is not clear

- **WHEN** the design merge call times out or its reply is lost.
- **THEN** the trusted step reads back the saved design pull request and default branch before a retry and does not merge it twice.

#### Scenario: Design pull request cannot be merged with care

- **WHEN** the saved design pull request is closed with no merge, has the wrong base or head, has a conflict, or fails merge policy.
- **THEN** the flow saves a safe failure and does not claim success.

#### Scenario: Design merge lacks file proof

- **WHEN** GitHub shows a design merge but the approved design cannot be found at its default branch commit.
- **THEN** the flow asks for repair and does not end with success.

## MODIFIED Requirements

### Requirement: Merge only after an explicit human decision

The current default flow SHALL treat each `Human Review` visit as one named gate. At the plan gate, the allowed choices SHALL be ask for a plan change, approve the plan merge, or stop the run. At the design gate, they SHALL be ask for a design change, approve the design merge, or stop the run. Only the approved path for the active gate SHALL call its trusted GitHub merge step. An agent result, review note, or provider comment MUST NOT approve a merge.

#### Scenario: Merge is authorized

- **WHEN** an allowed person moves the issue from the plan gate in `Human Review` to `Merging`.
- **THEN** the flow calls the trusted merge step for the saved plan pull request and does not merge the design pull request.

#### Scenario: Design merge is approved

- **WHEN** an allowed person moves the issue from the design gate in `Human Review` to `Merging`.
- **THEN** the flow calls the trusted merge step for the saved design pull request and does not merge the plan pull request again.

#### Scenario: Run is canceled

- **WHEN** an allowed person moves the issue from either active gate in `Human Review` to `Canceled`.
- **THEN** the run ends as canceled without a new merge or agent job.

#### Scenario: Unrecognized departure from Human Review

- **WHEN** an allowed person moves the issue from `Human Review` to a state that is not set for the active gate.
- **THEN** the flow records the event, picks no work edge, and keeps or restores the active gate.

### Requirement: Verify the approved planning work on the default branch

The current default flow SHALL read back the approved plan merge before design work starts. It SHALL prove that the saved plan pull request was merged to the default branch and that its proposal and specs are present at the merge commit. It SHALL keep the GitHub and repo proof. This step SHALL start design work; it MUST NOT end the run.

#### Scenario: Authorized pull request is merged and verified

- **WHEN** GitHub shows the saved plan pull request as merged to the default branch and the approved plan files are present at that merge commit.
- **THEN** the flow saves the merge and check proof and starts the design job.

#### Scenario: Merge response is ambiguous

- **WHEN** the merge call times out or its reply is lost.
- **THEN** the trusted step reads back the saved pull request and default branch before a retry and does not make or merge another pull request.

#### Scenario: Pull request cannot be merged safely

- **WHEN** the saved plan pull request is closed with no merge, has the wrong base or head, has a conflict, or fails merge policy.
- **THEN** the flow saves a safe failure and does not start design work.

#### Scenario: Merge succeeds but planning files cannot be verified

- **WHEN** GitHub shows a merge but the approved proposal and specs cannot be found at its default branch commit.
- **THEN** the flow asks for repair and does not start design work.
